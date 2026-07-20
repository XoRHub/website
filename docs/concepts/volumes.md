---
sidebar_position: 6
title: Volumes
description: Home volume retention, reuse and storage quotas.
---

# Volumes

Every workspace gets a **home volume** — a PVC mounted at the desktop
user's home directory (default `/home/waas_user`, configurable per
template via `spec.homeMountPath`). It is the only thing that survives
pod restarts, pauses, image changes… and, by default, workspace
deletion.

That "only" is load-bearing: a package installed with `apt` goes to the
container layer and is gone on the next restart. The waas-images
desktops ship **mise** for exactly this reason — it installs runtimes
and CLI tools under `~/.local/share/mise`, on the volume, so they
persist with the rest of the home (see
[Workspace images](../images/index.md#installing-tools-that-survive-a-restart)).

## Retention model

The PVC is the source of truth — no separate database of volumes. A
**retained volume** is a WaaS-managed home PVC whose workspace no
longer exists, identified by its labels (owner, `retained=true`,
provenance annotations).

```
creation ──► home PVC "<workload>-home"
   │
workspace deletion
   │
   ├── keep volume (DEFAULT) ── the PVC is DETACHED, not deleted
   │     still yours, still counted against your storage quota
   │     │
   │     ├── reuse: create a new workspace "from an existing volume"
   │     │     (same owner, same target namespace — a PVC is namespaced)
   │     │
   │     └── delete it later: portal Volumes tab (or admin Fleet → Volumes)
   │
   └── delete volume (EXPLICIT opt-in in the deletion dialog)
         the PVC is deleted along with the workspace
```

Two deliberate consequences:

- **GitOps can never destroy user data**: `kubectl delete` / ArgoCD
  prune never carry the opt-in, so they always retain the volume.
- **A policy TTL deletes the volume**: `lifecycle.maxLifetime` deletes
  the workspace _and_ its home on expiry — reclaiming storage is
  precisely what a TTL is for.

![Placeholder — Volumes tab listing retained volumes](/img/placeholders/volumes-tab.png)

## Reusing a volume

At creation, pass the retained volume's name:

```yaml
spec:
  templateRef: ubuntu-desktop
  homeVolumeName: my-old-workspace-home # "start from an existing volume"
```

The webhook checks: same owner, volume actually retained, same target
namespace. The operator then re-labels the volume as live.

## Template metadata on home volumes

A template can stamp labels and annotations on the home PVC via
`spec.homeVolume`. The driving use case is storage machinery driven by
PVC labels — e.g. enrolling every home into Longhorn recurring backup
jobs:

```yaml
spec:
  homeVolume:
    labels:
      recurring-job.longhorn.io/source: enabled
      recurring-job-group.longhorn.io/backup-daily: enabled
```

Size, class and mount path stay where they were — the top-level
`homeSize`, `storageClassName` and `homeMountPath`.

The sync model is deliberately different from the other metadata
surfaces (namespace metadata is create-only, workload metadata
converges by rollout): homeVolume metadata is **synced in place on
every reconcile**. Editing the template enrolls volumes provisioned
long ago without touching the workspaces — and since PVC metadata sits
outside the pod-template fingerprint, enabling a backup never restarts
a desktop.

Removals propagate too. The operator records the keys it stamped in a
ledger annotation on the PVC (`waas.xorhub.io/template-meta`); a key
dropped from the template is removed at the next reconcile, while keys
an admin set on the PVC by hand are never in the ledger and never
touched. The usual reserved-domain denylist applies (`kubernetes.io`,
`xorhub.io`, `argoproj.io`, service-mesh injectors, … — `longhorn.io`
is deliberately allowed) and operator-owned labels always win.

Retained volumes keep their metadata and ledger — a detached volume
still holds the user's data, exactly the one worth keeping in the
backup rotation. It is _not_ re-synced while detached (no workspace
reconciles it); the next adoption converges it against the adopting
template, removing the old template's ledgered keys and stamping the
new ones.

This surface is admin-only by design: there is no overridable field
for it, because PVC labels drive platform machinery (backup, DR), not
user preference.

## Quotas

Retained volumes count against the policy's aggregate **storage** quota
exactly as attached ones do (never against `maxWorkspaces` or compute).
The portal home page shows `used / limit` with a "of which X retained"
breakdown. A volume adopted at creation counts at its **actual** size,
not the template's `homeSize`.
