// Rebuilds data.json from the latest released manifest of every Foundry repo
// owned by config.owner. Repos are discovered through the GitHub API (any repo
// whose latest release has a module.json or system.json asset); entries in
// catalog.config.json override the discovered name and summary, fix the order
// of listed repos, and keep them in the catalog even if discovery fails.
// Set GITHUB_TOKEN to raise the API rate limit.
// Run with: node scripts/update-catalog.mjs
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const config = JSON.parse(await readFile(path.join(root, "catalog.config.json"), "utf8"));
const exclude = new Set((config.exclude ?? []).map((r) => r.toLowerCase()));

const apiHeaders = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  ...(process.env.GITHUB_TOKEN && { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }),
};

async function api(url) {
  const res = await fetch(url, { headers: apiHeaders });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return { data: await res.json(), next: /<([^>]+)>;\s*rel="next"/.exec(res.headers.get("link") ?? "")?.[1] };
}

async function listRepos() {
  const repos = [];
  let url = `https://api.github.com/users/${config.owner}/repos?type=owner&per_page=100`;
  while (url) {
    const page = await api(url);
    repos.push(...(page?.data ?? []));
    url = page?.next;
  }
  return repos;
}

// Returns { kind, manifestFile } if the repo's latest release ships a Foundry manifest.
async function detectManifest(repo) {
  const release = await api(`https://api.github.com/repos/${config.owner}/${repo}/releases/latest`);
  const assets = new Set((release?.data.assets ?? []).map((a) => a.name));
  if (assets.has("system.json")) return { kind: "system", manifestFile: "system.json" };
  if (assets.has("module.json")) return { kind: "module", manifestFile: "module.json" };
  return null;
}

async function discover() {
  const listed = new Set([...config.systems, ...config.modules].map((e) => e.repo.toLowerCase()));
  const candidates = (await listRepos()).filter(
    (r) => !r.archived && !r.fork && !r.private && !listed.has(r.name.toLowerCase()) && !exclude.has(r.name.toLowerCase()),
  );
  const found = await Promise.all(
    candidates.map(async (r) => {
      try {
        const manifest = await detectManifest(r.name);
        return manifest && { repo: r.name, ...manifest };
      } catch (err) {
        console.warn(`[${r.name}] ${err.message}`);
        return null;
      }
    }),
  );
  return found.filter(Boolean);
}

async function fetchEntry(kind, entry) {
  const repoUrl = `https://github.com/${config.owner}/${entry.repo}`;
  const manifest = `${repoUrl}/releases/latest/download/${entry.manifestFile}`;
  let data = {};
  try {
    const res = await fetch(manifest, { redirect: "follow" });
    if (res.ok) data = await res.json();
    else console.warn(`[${entry.repo}] ${res.status} fetching latest manifest`);
  } catch (err) {
    console.warn(`[${entry.repo}] ${err.message}`);
  }
  return {
    kind,
    id: data.id ?? entry.repo,
    name: entry.name ?? data.title ?? entry.repo,
    repo: repoUrl,
    manifest,
    version: data.version ?? null,
    summary: entry.summary ?? firstSentence(data.description),
    compatibility: data.compatibility ?? null,
  };
}

function firstSentence(text) {
  if (!text) return "";
  const match = /^(.+?[.!?])(\s|$)/.exec(text.trim());
  return match ? match[1] : text.trim();
}

let discovered = [];
try {
  discovered = await discover();
  for (const d of discovered) console.log(`Discovered ${d.kind} ${d.repo} (not in catalog.config.json)`);
} catch (err) {
  console.warn(`Repo discovery failed, using catalog.config.json only: ${err.message}`);
}

const byName = (a, b) => a.name.localeCompare(b.name);
const build = async (kind, listedEntries) => [
  ...(await Promise.all(listedEntries.map((e) => fetchEntry(kind, e)))),
  ...(await Promise.all(discovered.filter((d) => d.kind === kind).map((e) => fetchEntry(kind, e)))).sort(byName),
];

const systems = await build("system", config.systems.filter((e) => !exclude.has(e.repo.toLowerCase())));
const modules = await build("module", config.modules.filter((e) => !exclude.has(e.repo.toLowerCase())));

const out = { generatedAt: new Date().toISOString(), owner: config.owner, systems, modules };
await writeFile(path.join(root, "data.json"), JSON.stringify(out, null, 2) + "\n");
console.log(`Wrote data.json: ${systems.length} systems, ${modules.length} modules (${discovered.length} discovered)`);
