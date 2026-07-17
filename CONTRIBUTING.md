# Contributing

This repo is the documentation site for WaaS and waas-images. Content
lives in `docs/` (Markdown/MDX, Docusaurus). The source of truth for
*facts* is always the `waas` / `waas-images` repos — when their docs
change, this site follows.

## Local setup

```sh
mise install    # installs the pinned Node from .mise.toml (CI uses the same file)
npm ci
npm start       # http://localhost:3000, live reload
```

`npm run build` must pass before any PR — it regenerates the CRD
reference, builds every doc version and fails on broken links.

## Editing content

- `docs/` = the **Next** version (tracks waas `main`). This is the only
  tree you normally edit.
- `versioned_docs/version-vX.Y.Z/` are **frozen snapshots** — only touch
  them for a factual error in a released version's docs.
- The CRD reference pages (`docs/reference/crds/*.mdx`) are
  **generated and gitignored** — edit the generator
  (`scripts/generate-crd-docs.mjs`) or the source schemas in waas, never
  the output. The section index (`docs/reference/crds/index.md`) is
  hand-written and editable.
- Screenshots: real images go to `static/img/`; every missing one is a
  gray placeholder listed in `IMAGES_TODO.md` — when you add the real
  image, replace the file, delete the `TODO(image)` comment next to the
  reference, and remove the line from `IMAGES_TODO.md`.

## Refreshing the CRD reference

The four CRD pages are generated from JSON Schemas vendored under
`crd-schemas/waas.xorhub.io/` (committed so the build is offline and
reproducible; the synced waas ref is recorded in
`crd-schemas/WAAS_REF`). When waas changes its CRDs:

```sh
node scripts/sync-crd-schemas.mjs --ref vX.Y.Z   # or: --local ../waas
npm run gen:crd                                  # regenerate, eyeball the pages
```

Review the schema diff and commit (`docs: sync CRD schemas to waas vX.Y.Z`).

## Cutting a docs version (waas release)

When waas publishes a `vX.Y.Z` tag, freeze the current docs as that
version. **Nominal path**: run the
[`version-cut` workflow](.github/workflows/version-cut.yml)
(Actions → version-cut → Run workflow → enter the tag). It syncs the
schemas at the tag, runs `docusaurus docs:version vX.Y.Z` and opens a
PR to review.

The equivalent by hand:

```sh
node scripts/sync-crd-schemas.mjs --ref vX.Y.Z
npm run gen:crd
npm run docusaurus docs:version vX.Y.Z
npm run build
# commit docs/-generated versioned_docs/, versioned_sidebars/, versions.json,
# crd-schemas/ — "docs: cut version vX.Y.Z"
```

The workflow also listens to `repository_dispatch` (type
`waas-release`) so the waas release pipeline can trigger the cut
automatically later; until that wiring exists, the manual dispatch
above **is** the documented procedure.

Keep the version dropdown short: Docusaurus serves every entry in
`versions.json`; prune very old versions when they stop being useful.

## Commits

Conventional Commits, atomic — same convention as the source repos:
`docs: …` for content, `feat: …` for site features/generators,
`chore: …`, `ci: …`, `fix: …`.

## Dependency updates

Renovate manages the npm dependencies and GitHub Actions pins
(`renovate.json`). Docusaurus majors are grouped and never automerged.
