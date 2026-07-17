---
sidebar_position: 2
title: Day-2 administration
description: What the platform admin actually does day to day — the two portal views, routine maintenance, and the commands behind them.
---

# Day-2 administration

Once WaaS is installed and governance is seeded, running the platform
is mostly *reviewing* — the operator reconciles, the sweepers pause and
clean up, the webhook enforces. This page maps what the two portal
views offer, then walks the routine tasks.

## The two views

### User view (the portal)

What every authenticated user gets:

- **Dashboard**: one card per workspace — phase, protocol, next
  scheduled transition ("⏰ next stop …"), the "update pending" reload
  badge, pause/resume/delete actions. Users can group cards into
  **folders** and open up to three desktops side by side (**split
  view**).
- **Creation dialog**: template picker (icons and descriptions synced
  from the catalog), sizing sliders pre-filled from the image or policy
  defaults, the resolved target namespace, and — only for users whose
  effective allow-list permits it — the **Advanced (template
  overrides)** panel.
- **Workspace detail**: Events panel (the CR's Kubernetes events
  aggregated with its children's), connection settings (protocol and
  the delegated guacd parameters, re-validated server-side at every
  connect).
- **Volumes tab**: their retained home volumes — provenance, size,
  delete (with confirmation; retained volumes count against their
  storage quota).
- **Quota**: the home page shows used vs limits, with the "of which X
  retained" storage breakdown.

![Placeholder — user dashboard with workspace cards](/img/placeholders/dashboard.png)

{/* TODO(image): capture du portail utilisateur listant les workspaces (cards avec phase/protocole) */}

### Admin view (the console)

Everything above, plus:

- **Fleet dashboard**: every workspace on the platform, with a
  **Volumes** tab (all retained volumes, audited deletion) and a
  **Remote workspaces** tab (owner, target, protocol, MAC/WoL, last
  connection — metadata only, never credentials).
- **Users page**: create/edit users, group chips (known groups =
  policy subjects ∪ existing users' groups, plus free entry), role
  management, and the **effective-policy debugger** — it replays the
  exact resolution the webhook performs: every candidate policy, its
  match outcome, the winner, tie warnings. Your first stop for any
  "why can't this user…" question.
- **Catalog editor** (`WorkspaceImage`) and **policy editor**
  (`WorkspacePolicy`): YAML editors pre-filled with the whole schema
  (generated server-side, never a stale hand-maintained template), plus
  the enable/disable kill-switch per image.
- **Usage** view for capacity questions.

![Placeholder — admin fleet dashboard](/img/placeholders/fleet-view.png)

{/* TODO(image): capture du dashboard Fleet admin (liste des workspaces, onglets Volumes / Remote workspaces) */}

![Placeholder — Users page with the effective-policy debugger](/img/placeholders/admin-users.png)

{/* TODO(image): capture de la page Users admin (dialogue d'édition avec la vue effective-policy) */}

Remember the writing model: the console edits the CRs **directly**. If
those CRs are GitOps-managed, a console edit is a manual override the
next sync overwrites — for quick actions (disable an image, bump a
quota) that's fine, just mirror the change in Git.

## Routine tasks

### Catalog care

- **Approve a new image**: add the `WorkspaceImage` (console or Git),
  exact ref, digest pinned if you run per-image entries. Without the
  catalog entry, templates using the image fail with
  `ImageNotInCatalog`.
- **Emergency-disable an image** (CVE, misbehavior):
  ```sh
  kubectl patch wsi <name> --type=merge -p '{"spec":{"enabled":false}}'
  ```
  New workspaces are blocked instantly; running ones keep working —
  pause them from the Fleet view if the image is actively dangerous.
- If you kept the bootstrap **registry-wide** entry, new official
  images appear in the picker on their own (catalog sync) — review the
  [waas-images releases](https://github.com/XoRHub/waas-images) rather
  than the picker.

### Policy and quota care

- Quota changes are a policy edit — they apply to **new**
  creations/resumes immediately, running workspaces are untouched until
  their next spec change (grandfathering; they still count toward
  quotas).
- Diagnose access questions with the effective-policy debugger before
  touching priorities. An empty group mirror (user matched only by the
  `default` policy) means the user hasn't done an SSO login since the
  group was added — or needs an admin edit of their groups.
- Keep the priority conventions: 0 default, 100–999 groups, 1000+
  per-user exceptions, 10000 admins.

### Fleet hygiene

- **Stuck deletions**: a workspace in `Terminating` carries a
  `TeardownFailed` event/condition with the cause — fix the cause and
  deletion resumes alone; the finalizer bypass is a last resort
  ([procedure](../concepts/workspace-deletion.md#when-teardown-fails)).
- **Failed workspaces**: the `Ready` condition carries the denial
  reason code — the [troubleshooting table](../troubleshooting.md)
  maps each one to its fix.
- **Volumes**: retained volumes live until their owner (or you, from
  Fleet → Volumes, audited) deletes them — and they count against the
  owner's storage quota, so "quota full" complaints often end there.
- The waas repo ships `hack/audit-orphans.sh` for a periodic sweep of
  anything a bypassed finalizer or pre-feature deletion left behind.

### People care

- With OIDC configured, the IdP is the source of truth: the groups
  claim overwrites the mirror at **every** SSO login, and
  `adminGroups` syncs the admin role. Local login stays available as
  break-glass unless you set `disableLocalLogin` (see
  [Configuration](../installation/configuration.md#authentication-oidc-sso)).
- Manual group edits (Users page) are the path when OIDC is not
  configured — and are overwritten at the user's next SSO login when it
  is.

### Watching the platform

- **Audit**: the api-server journals who did what
  (`workspace.created/denied/…`, `catalog.image_*`, `policy.*`,
  volume and remote-workspace events) — append-only, with client IP.
- **Metrics/dashboards**: turn on `metrics.enabled` plus
  ServiceMonitor/PodMonitor and the bundled Grafana dashboards
  ([Configuration](../installation/configuration.md#observability)).
- **Events**: every admission decision and phase transition is a
  Kubernetes Event on the Workspace CR — `kubectl describe workspace`
  is always the ground truth.

### Upgrades

```sh
helm upgrade waas oci://ghcr.io/xorhub/waas/charts/waas --version <chart-version>
```

CRDs ship with the chart; generated secrets survive upgrades. Running
desktops are not restarted by a platform upgrade — workspaces pick up
template-level changes at their next scale-up boundary (or via the
reload badge).
