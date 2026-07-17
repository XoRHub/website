---
sidebar_position: 5
title: Placement
description: Which namespace workspace workloads land in — patterns, naming, per-namespace guardrails.
---

# Placement

The Workspace **CRs** (and all governance objects) stay in the platform
namespace; only the **workloads** — Deployment/StatefulSet/Pod,
Service, home PVC, VM — go into a target namespace. This page explains
how that target namespace is chosen and what the operator sets up in
it.

## How the target namespace is resolved

From highest to lowest priority — enforced server-side:

1. **`spec.placement.namespace` of the template** (overridable at
   instantiation if the `placement` field is delegated);
2. **the platform-wide pattern** — Helm value
   `workspaces.defaultNamespacePattern`, shared by the operator and the
   api-server. An invalid pattern makes both components **refuse to
   start** — never a silent fallback;
3. **built-in `waas-workspaces`**: a single shared namespace.

Patterns accept these placeholders — each value is sanitized (NFKD,
lowercase, DNS-1123) and hash-suffixed on truncation/collision, so two
distinct values can never silently merge:

| Token | Source |
|---|---|
| `{user}` | IdP username (trusted identity) |
| `{workspace}` | workspace displayName |
| `{templateName}` | template `metadata.name` |
| `{os}` | template `spec.os` (`linux`/`windows`) |

:::info Frozen at creation
The resolved value is written into `spec.targetNamespace` at creation
and **immutable** afterward. Changing the pattern only affects **new**
workspaces — existing ones keep their namespace, by design. Moving a
workspace means recreating it.
:::

The portal shows the resolved namespace at creation time, and the
template editor lists the valid placeholders.

## What the operator bootstraps in a new namespace

Created on first workload if missing — never modified afterward (your
admin edits are not overwritten):

- **Labels**: `app.kubernetes.io/managed-by=waas-operator`, the owner
  label, and Pod Security labels (`enforce=baseline`,
  `warn=restricted`) — plus the template's
  `placement.namespaceLabels/Annotations` (a server-side denylist
  filters reserved domains: `kubernetes.io`, `xorhub.io`,
  `argoproj.io`, service-mesh injectors, …).
- A **`waas-quota` ResourceQuota** derived from the owner's policy
  aggregate caps (defense in depth — the webhook remains the primary
  enforcement).
- A **default-deny ingress NetworkPolicy**: only the platform namespace
  (where guacd/wwt run) can reach the desktops. Egress stays open.
- **No user RBAC**: users never talk to the Kubernetes API directly —
  everything goes through the portal or your GitOps pipeline.

Shared namespaces (the built-in default, or `{os}`/`{templateName}`
patterns) get **neither** an ownership label **nor** an auto
ResourceQuota — a shared namespace quota would cap the whole team at
one person's budget; set your own namespace quota if you want one.

For non-admins, a namespace **deviating** from the server-resolved
default must either match the `waas-<user>` prefix (recomputed from the
trusted identity) or be an existing namespace labeled with their
ownership — anti-spoofing is webhook-enforced, fail-closed. System
namespaces (`kube-*`, the platform namespace) are refused for everyone.

## Namespace cleanup

`placement.cleanup` on the template, **frozen on the namespace at
creation**:

- **`Retain`** (default): the namespace is never auto-deleted.
  Rationale: deleting a namespace deletes its PVCs, and home volumes
  outlive workspace deletion — Retain is the only default that cannot
  destroy data.
- **`DeleteWhenEmpty`** (opt-in): the operator's namespace janitor
  deletes the namespace once no WaaS-managed object remains in it — a
  [retained home volume](volumes) keeps it alive, and the volume's
  later deletion re-triggers the janitor.

## Workload naming

The api-server computes a workload name from the display name
(sanitized, collision-suffixed per namespace) and freezes it:
Deployment/Service = `<workloadName>`, home PVC =
`<workloadName>-home`. Renaming a workspace's display name never
renames the compute.

## One pitfall to know about

A template's `env.valueFrom.secretKeyRef` resolves in the **pod's**
namespace — the target namespace. A placed template referencing a
Secret that only exists in the platform namespace breaks at startup
(`CreateContainerConfigError`): provision the Secret in the target
namespaces (External Secrets/Vault), or don't place that template.
Protocol `credentialsSecretRef`s are **not** affected — they resolve
server-side in the platform namespace.
