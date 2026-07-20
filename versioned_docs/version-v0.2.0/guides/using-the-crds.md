---
sidebar_position: 1
title: Using the CRDs
description: Create and manage workspaces with kubectl, ArgoCD or Flux.
---

# Using the CRDs

Everything the portal does goes through the four
`waas.xorhub.io/v1alpha1` CRDs — which means everything the portal does,
**you can do declaratively**. This page covers the mechanics; see
[Examples](examples) for ready-to-adapt YAML.

## kubectl basics

```sh
# The four kinds (wsi/wsp have short names):
kubectl get workspaces -n waas
kubectl get workspacetemplates -n waas
kubectl get wsi -n waas        # WorkspaceImage
kubectl get wsp -n waas        # WorkspacePolicy

kubectl apply -f workspace.yaml
kubectl describe workspace alice-ubuntu   # phase, conditions, events
kubectl delete workspace alice-ubuntu     # home volume retained by default
```

`kubectl get workspace` shows the PHASE and READY columns; the
operator's Events on the CR tell the story of every transition and
admission decision.

## Identity with direct kubectl

The admission webhook binds each workspace to a trusted identity:

- `spec.owner` must equal **your authenticated Kubernetes username** —
  writing someone else's name is denied (`IdentityViolation`);
- owner is **immutable** after creation;
- the platform's identity annotations are reserved for the api-server —
  never set `waas.xorhub.io/*` identity annotations yourself.

Governance applies unchanged: your policies, quotas and catalog rules
are enforced by the webhook, not by the portal. Denials surface
verbatim in the kubectl error message:

```
admission webhook denied the request:
[QuotaExceeded] workspace count 3 of maximum 3 reached
```

## GitOps (ArgoCD / Flux)

Workspaces, templates, policies and catalog entries are ordinary
Kubernetes manifests — put them in a Git repo and let ArgoCD/Flux
apply them:

- **Ordering doesn't matter**: a `Workspace` applied before its
  template is admitted with a warning; the reconciler enforces
  governance again before any compute is created.
- **Pruning is safe for data**: a pruned `Workspace` always retains its
  home volume (the delete-volume opt-in can only be stamped by the
  API path). See [Volumes](../concepts/volumes).
- **Pin image refs**: templates should reference immutable tags or
  digests — mutable tags fight both ArgoCD and the catalog.
- **Admin-edited objects**: if the admin console also edits policies or
  catalog entries, remember Git wins at the next sync — configure
  `selfHeal: false` or `ignoreDifferences` on those two kinds if you
  want console edits to stick.

A typical GitOps layout:

```
gitops/
├── governance/
│   ├── images.yaml       # WorkspaceImage entries (the catalog)
│   └── policies.yaml     # WorkspacePolicy entries
├── templates/
│   ├── ubuntu-desktop.yaml
│   └── devtools.yaml
└── workspaces/           # optional: long-lived, declared workspaces
    └── ci-runner-desktop.yaml
```

## Field manuals

- [`Workspace`](../reference/crds/workspace) — owner, templateRef,
  paused, resources, overrides, homeVolumeName.
- [`WorkspaceTemplate`](../reference/crds/workspacetemplate) — image,
  sizing, protocols, workload, schedule, placement, homeVolume,
  overrides.
- [`WorkspacePolicy`](../reference/crds/workspacepolicy) — subjects,
  priority, limits, lifecycle, clipboard, override rights.
- [`WorkspaceImage`](../reference/crds/workspaceimage) — image ref,
  protocols, architectures, enabled, allowedGroups, sizing bounds.
