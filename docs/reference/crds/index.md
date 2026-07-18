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
| [Workspace](workspace.mdx) | `ws` | One user's desktop instance |
| [WorkspaceTemplate](workspacetemplate.mdx) | `wst` | The shape of a desktop |
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

Each page shows the CRD as **one annotated YAML manifest**:

- Every field is a real YAML key, with its API documentation as `#`
  comments right above it — the same text `kubectl explain` shows,
  verbatim from the Go API types.
- Values are type placeholders: `<string>`, `<int32>`, `<boolean>`,
  `<quantity>` (a Kubernetes quantity such as `2`, `500m` or `4Gi`).
  Enums are spelled out in place (`User | Group`).
- Constraints ride on the field line as a trailing comment:
  `# required · min: 0 · default: false`.
- Nested objects fold like folders — click a key (▸) to open or close
  its subtree, or use the **Expand all / Collapse all** buttons. A
  collapsed key shows `{…}` / `[…]`.
- In lists, the `-` line marks one example element; `<key>` marks the
  free keys of a map.
