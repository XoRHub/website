# WaaS documentation website

[![deploy](https://github.com/XoRHub/website/actions/workflows/deploy.yml/badge.svg)](https://github.com/XoRHub/website/actions/workflows/deploy.yml)

End-user documentation for [WaaS](https://github.com/XoRHub/waas)
(Kubernetes-native Workspace-as-a-Service) and
[waas-images](https://github.com/XoRHub/waas-images) (the workspace
desktop images). Built with [Docusaurus](https://docusaurus.io),
published on GitHub Pages: **https://xorhub.github.io/website/**

## Local development

```sh
mise install    # pinned Node toolchain (.mise.toml — same pins CI uses)
npm ci
npm start       # dev server; regenerates the CRD reference first
npm run build   # full production build (all versions)
```

## How this repo works

- `docs/` is the **Next** version, tracking waas `main`.
  `versioned_docs/version-vX.Y.Z/` are frozen snapshots cut when waas
  tags a release — see [CONTRIBUTING.md](CONTRIBUTING.md) for the cut
  procedure (`version-cut` workflow).
- The **CRD reference** pages are generated at build time from the
  JSON Schemas vendored under `crd-schemas/` (synced from
  `XoRHub/waas` at the ref recorded in `crd-schemas/WAAS_REF`):
  `scripts/sync-crd-schemas.mjs` refreshes them,
  `scripts/generate-crd-docs.mjs` renders the pages (wired as
  `pre`-scripts of `start`/`build`).
- Screenshots/diagrams still to produce are tracked in
  [IMAGES_TODO.md](IMAGES_TODO.md); the pages reference gray
  placeholders under `static/img/placeholders/` in the meantime.

## Deployment

`.github/workflows/deploy.yml` builds on every PR and deploys `main`
to GitHub Pages via `actions/deploy-pages`. One-time repo setup:
Settings → Pages → Source = **GitHub Actions**.

## License

Apache-2.0, like the projects it documents.
