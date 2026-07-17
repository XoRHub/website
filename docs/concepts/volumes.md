---
sidebar_position: 6
title: Volumes
description: Home volume retention, reuse and storage quotas.
---

# Volumes

Every workspace gets a **home volume** — a PVC mounted at the desktop
user's home directory. It is the only thing that survives pod
restarts, pauses, image changes… and, by default, workspace deletion.

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
  the workspace *and* its home on expiry — reclaiming storage is
  precisely what a TTL is for.

![Placeholder — Volumes tab listing retained volumes](/img/placeholders/volumes-tab.png)

{/* TODO(image): capture de l'onglet Volumes (volumes retenus, provenance, bouton delete) */}

## Reusing a volume

At creation, pass the retained volume's name:

```yaml
spec:
  templateRef: ubuntu-desktop
  homeVolumeName: my-old-workspace-home   # "start from an existing volume"
```

The webhook checks: same owner, volume actually retained, same target
namespace. The operator then re-labels the volume as live.

## Quotas

Retained volumes count against the policy's aggregate **storage** quota
exactly as attached ones do (never against `maxWorkspaces` or compute).
The portal home page shows `used / limit` with a "of which X retained"
breakdown. A volume adopted at creation counts at its **actual** size,
not the template's `homeSize`.
