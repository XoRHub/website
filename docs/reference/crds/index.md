---
sidebar_position: 1
title: CRD reference
description: Field-by-field reference for the four waas.xorhub.io CRDs, generated from the published JSON Schemas.
---

# CRD reference

Field-by-field reference for the four CRDs of the
`waas.xorhub.io/v1alpha1` API group:

| Kind | Short name | Purpose |
|---|---|---|
| [Workspace](workspace.mdx) | — | One user's desktop instance |
| [WorkspaceTemplate](workspacetemplate.mdx) | — | The shape of a desktop |
| [WorkspacePolicy](workspacepolicy.mdx) | `wsp` | Self-service envelope per user/group |
| [WorkspaceImage](workspaceimage.mdx) | `wsi` | Approved catalog entry |

:::info How these pages are produced
They are **generated at build time** from the JSON Schemas the waas
repository publishes under
[`crd-schemas/waas.xorhub.io/`](https://github.com/XoRHub/waas/tree/main/crd-schemas/waas.xorhub.io)
— the same schemas its own CI validates manifests against, with
per-field descriptions straight from the API types. The schemas are
vendored into this site's repo (`crd-schemas/`, ref recorded in
`crd-schemas/WAAS_REF`) so the build is offline and reproducible;
refreshing them for a new waas release is a one-command sync
documented in the site's
[CONTRIBUTING](https://github.com/XoRHub/website/blob/main/CONTRIBUTING.md).
:::

Conventions used in the tables:

- Nested fields are indented under their parent; `[]` marks "each
  element of this list", `map[string]T` a free-keyed map.
- **Required.** flags fields their parent requires; everything else is
  optional.
- Descriptions are verbatim from the API types — they are the same text
  `kubectl explain` shows.
