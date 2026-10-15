# Sargas Foundry Catalog

A static GitHub Pages site listing every Foundry VTT module and game system
published by [sargas79](https://github.com/sargas79), with each one's name,
manifest URL, one-line description and latest released version.

## How it works

- New modules and systems are discovered automatically: every public,
  non-fork, non-archived repository of the owner whose latest release has a
  `module.json` or `system.json` asset is included. Discovered entries use the
  manifest title and the first sentence of its description.
- `catalog.config.json` overrides discovery. Listed repositories get a fixed
  order, a one-line summary and an optional `name` that replaces the manifest
  title so the catalog can use standardized names; they stay in the catalog
  even if discovery fails. Add a repository name to the optional `exclude`
  array to hide it.
- `scripts/update-catalog.mjs` fetches the latest released manifest of every
  repository (`releases/latest/download/module.json` or `system.json`) and
  writes `data.json`. Set `GITHUB_TOKEN` to raise the GitHub API rate limit
  (the workflow does this).
- `index.html` renders `data.json`.
- The `pages.yml` workflow refreshes `data.json` on every push to `main`,
  once a day, and on demand, then deploys the site to GitHub Pages.

## Publishing

1. Push this folder to the `main` branch of a public repository.
2. In the repository settings open **Pages** and set **Source** to
   **GitHub Actions**.
3. The workflow runs on the next push (or via **Actions → Build and deploy
   catalog → Run workflow**). The site is served at
   `https://<owner>.github.io/<repo>/`.

## Refreshing locally

```
node scripts/update-catalog.mjs
```
