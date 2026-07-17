---
sidebar_position: 1
title: What the chart bootstraps
description: The policies and catalog entries a default install renders, and exactly what rights they grant.
---

# What the chart bootstraps

WaaS governance is **fail-closed**: with zero `WorkspacePolicy` objects
in the cluster, *nobody* can create a workspace — not even admins. And
with an empty catalog, there is no image to pick. So the chart can
render a small set of governance CRs at install time, so a fresh
platform works before any GitOps repo exists. They are ordinary,
visible, auditable CRs — editable and removable like any other.

| Helm block | Object | Default |
|---|---|---|
| `defaultPolicy.*` | catch-all `WorkspacePolicy` (`default`, priority 0) | **enabled** |
| `adminPolicy.*` | all-rights `WorkspacePolicy` (`admins`, priority 10000) | disabled |
| `catalogs.waasImages.*` | registry-wide `WorkspaceImage` (`docker.io/xorhub`) | **enabled** |
| `catalogs.kasm.*` | registry-wide `WorkspaceImage` (`docker.io/kasmweb`, KasmVNC) | disabled |

## The default policy — what every user can do out of the box

`defaultPolicy` renders a policy with **no subjects**, which by
convention matches **every authenticated user**, at priority 0 so any
policy you add later wins. Concretely, on a fresh install every user
may:

| Right | Default value |
|---|---|
| Concurrent workspaces | **3** |
| Per-workspace caps | 1 CPU, 1 Gi memory, 5 Gi home volume |
| Aggregate caps (all their workspaces + retained volumes) | 2 CPU, 3 Gi memory, 15 Gi storage |
| Images | the **whole enabled catalog** (`images: []`) — i.e. every `docker.io/xorhub` image, see below |
| Idle suspend | paused after **2 h** without a session (compute freed, home kept) |
| Max lifetime | deleted after **336 h / 14 days** — **home volume included** (TTL contract) |
| Clipboard | both directions allowed |
| Template overrides | `env`, `resources`, `schedule`, `volumes` — still intersected with each template's own allow-list |
| Remote workspaces | **off** |

Two things worth a second look before going to production:

- **`maxLifetime: 336h` destroys data**: a policy TTL deletes the home
  volume along with the workspace — that is the documented contract of
  a TTL. If your users keep long-lived desktops, raise or remove it.
- **`volumes` is in the default override list**: on any template that
  *also* delegates `volumes`, a user can mount arbitrary volume
  sources (including `hostPath`). The template list is the effective
  gate — just be aware the policy side is open by default.

## The admin policy — off by default, and why you probably want it

Admins **are subject to the admission gates like everyone else**: they
bypass override allow-lists, but quotas, catalog and lifecycle checks
apply to them through whatever policy matches them — which, on a fresh
install, is the default policy above (3 workspaces, 14-day TTL…).

`adminPolicy.enabled: true` renders the explicit escape hatch: priority
10000, subjects `User:admin` plus whatever IdP groups you add, **no
limits or lifecycle fields** (absent fields constrain nothing), the
whole catalog, every override field, remote workspaces on. The bypass
is deliberately **a CR you can read and audit** — visible in the
effective-policy debugger — not a hidden code path.

```yaml
adminPolicy:
  enabled: true
  subjects:
    - { kind: User, name: admin }
    - { kind: Group, name: platform-admins }   # your IdP admin group
```

## The bootstrap catalogs — what "approved" means here

`catalogs.waasImages` (on by default) renders a **registry-wide**
`WorkspaceImage`: it approves *every* image under `docker.io/xorhub`
for the protocols `vnc`/`rdp`/`ssh`, and the api-server periodically
syncs the picker metadata (names, icons, versions, recommended
sizing/securityContext) from the published
[`catalog-waas-images.yaml`](https://github.com/XoRHub/waas-images/blob/main/catalog-waas-images.yaml)
(`apiServer.catalogSyncInterval`, default 6 h — cosmetic metadata only,
the approval itself never changes without an admin).

Implication: combined with the default policy's `images: []`, **any
authenticated user can run any official XorHub desktop image** on day
one. That is the intended out-of-the-box experience; tighten it by
listing specific images in your policies, or by replacing the
registry-wide entry with per-image `WorkspaceImage` objects (exact
refs, digests pinned).

`catalogs.kasm` (off by default) is the same idea for the upstream
`docker.io/kasmweb` images over the **KasmVNC** protocol — an extra
data plane an admin opts into deliberately.

## Handing over to GitOps

The bootstrap objects exist so day one works without a Git repo. The
doctrine, for each of them, is **never both at once for the same
name**:

1. define the equivalent object in your GitOps repo
   (e.g. `gitops/governance/policies.yaml`, `images.yaml` in the waas
   repo layout);
2. disable the matching chart flag (`defaultPolicy.enabled: false`, …)
   in the same change;
3. from then on Git is the source of truth — remember that admin
   console edits to these CRs are manual overrides ArgoCD will
   overwrite on its next sync (configure `selfHeal`/`ignoreDifferences`
   to taste).

Keep a catch-all policy at priority 0 in Git too: **no matching policy
means denial, for everyone**.
