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
3. **built-in `waas-{user}`**: one namespace per user.

The built-in default isolates because the namespace is where every
per-user protection attaches — ownership label, policy-derived quota,
default-deny NetworkPolicy — and because it matches the `waas-<user>`
prefix the webhook already treats as the owner's territory. A **shared**
namespace remains perfectly legitimate, but it is an explicit admin
choice (a literal pattern on a template or in
`workspaces.defaultNamespacePattern`), no longer what you get by
default.

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

:::warning Default changed in chart 0.3.0

The built-in default moved from the shared `waas-workspaces` to the
per-user `waas-{user}`. Existing workspaces are untouched (their
`spec.targetNamespace` is frozen); only **new** ones land per-user. To
keep the previous behavior, declare it explicitly:

```yaml
workspaces:
  defaultNamespacePattern: "waas-workspaces"
```

**Retained home volumes do not follow.** A PVC is namespaced and only
attachable in the namespace it was left in, so homes retained in the old
shared namespace no longer appear when creating a workspace that now
resolves to `waas-<user>`. Moving that data is a storage operation,
outside the platform's scope: use the usual tooling (VolumeSnapshot, or
a backup/restore round-trip with Longhorn, Velero or equivalent).
Keeping the shared pattern, as above, avoids the question entirely.

:::

The portal shows the resolved namespace at creation time, and the
template editor lists the valid placeholders.

## What the operator bootstraps in a new namespace

Created on first workload if missing — never modified afterward (your
admin edits are not overwritten):

- **Labels**: `app.kubernetes.io/managed-by=waas-operator`, the owner
  label (personal namespaces only — the nominal case under the per-user
  default), and Pod Security labels (`enforce=baseline`,
  `warn=restricted`) — plus the template's
  `placement.namespaceLabels/Annotations` (a server-side denylist
  filters reserved domains: `kubernetes.io`, `xorhub.io`,
  `argoproj.io`, service-mesh injectors, …).
- A **`waas-quota` ResourceQuota** derived from the owner's policy
  aggregate caps, personal namespaces only (defense in depth — the
  webhook remains the primary enforcement).
- A **`waas-default-ingress` NetworkPolicy**, ingress *and* egress
  (see below). It is the one bootstrap object the operator **reconciles**
  — drift on it is healed.
- **No user RBAC**, and no ServiceAccount token mounted in the desktop
  pod: users never talk to the Kubernetes API directly — everything goes
  through the portal or your GitOps pipeline.

Namespace metadata is only one of the template's three metadata
surfaces, each with its own sync model: namespace labels/annotations
are **create-only** (above), workload metadata converges **by
rollout**, and home-PVC metadata (`spec.homeVolume`) is **synced in
place** with removal tracking — see [Volumes](volumes).

Shared namespaces — now the opt-in exception: a literal pattern like
`waas-workspaces`, or `{os}`/`{templateName}` — get **neither** an
ownership label **nor** an auto ResourceQuota, since they host several
owners and a shared quota would cap the whole team at one person's
budget; set your own namespace quota if you want one. The webhook stays
the per-user enforcement either way.

For non-admins, a namespace **deviating** from the server-resolved
default must either be an existing namespace labeled with their
ownership, or match the `waas-<user>` prefix recomputed from the trusted
identity — and in that second case only while the namespace is free or
already theirs. Since `waas-{user}` is now the default, a name inside
someone's prefix territory (`waas-alice-lab` for `alice`) may well be
the personal namespace of the user `alice-lab`, quota and retained
volumes included: the prefix is a name rule, not proof of ownership, so
the webhook refuses it with `PlacementDenied`. Anti-spoofing is
webhook-enforced, fail-closed. System namespaces (`kube-*`, the platform
namespace) are refused for everyone.

### What desktops can reach: the `waas-default-ingress` policy

Despite its (historical, kept to avoid orphaning policies already
stamped on existing namespaces) name, it shapes both directions:

- **Ingress**: denied except from the CR namespace and the release
  namespace — that's where guacd/wwt run, and they need to reach the
  desktops.
- **Egress**: **default-deny** as well. DNS (53 UDP+TCP, any
  destination) is always allowed — a desktop that cannot resolve is a
  broken desktop — then the public internet minus
  `operator.desktopEgress.blockedCIDRs`, plus any `extraAllowedCIDRs`.

The blocked defaults are the cloud IMDS `/32` and the RFC1918 ranges, so
a desktop reaches neither the kube-apiserver nor the platform namespace.

:::warning Those defaults assume RFC1918 cluster networks
On a provider that puts the Service CIDR outside RFC1918 — GKE defaults
to `34.118.224.0/20` — the kube-apiserver stays reachable from desktops
until you append your own range. Check it:

```sh
kubectl get svc kubernetes -n default -o jsonpath='{.spec.clusterIP}'
```

Emptying `blockedCIDRs` means "carve out **nothing**", not "use the
defaults" — override entries, never reset the key.
:::

Desktops needing an internal service (a package mirror, a private Git)
get it through `extraAllowedCIDRs`, which wins over the blocked ranges.
`operator.desktopEgress.enabled: false` falls back to the historical
ingress-only policy — the escape hatch for CNIs that do not enforce
egress rules.

### Pod Security: why `baseline`, and how to raise it

`enforce=baseline` is **not** a statement that desktops need baseline.
Measured against the published catalog, the images start and serve
normally under `restricted` given `allowPrivilegeEscalation: false`,
`capabilities.drop: [ALL]` and `seccompProfile: RuntimeDefault`.

The level is `baseline` because **choosing it is the cluster
administrator's call, not the platform's** — the same reason the desktop
container ships no `securityContext` of its own. A hardened cluster
usually fills that field with a cluster-wide mutation policy (Kyverno,
`MutatingAdmissionPolicy`, Gatekeeper), and those are almost always
written *add-if-absent*: a pre-filled field would silently take desktop
pods out of your policy. `warn=restricted` is the canary — the cluster
tells you what raising `enforce` would cost, without breaking a session.

To raise it:

```sh
kubectl label ns <workspace-namespace> \
  pod-security.kubernetes.io/enforce=restricted --overwrite
```

The bootstrap is create-only, so the operator never reverts your label.
Pair it with a template `workload.securityContext` (or a mutation
policy) supplying the three controls above, otherwise the namespace
refuses its own pods. The label cannot be set through
`placement.namespaceLabels` — every `*.kubernetes.io` key is denied
there, so a template author, who is not necessarily a platform admin,
can never lower a namespace to `privileged`.

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

With the per-user default, `Retain` means one `waas-<user>` namespace
per user survives the deletion of their last workspace — coherent with
the reason `Retain` exists (the retained home PVC lives there) and
reused by that user's next workspace.

## Workload naming

The api-server computes a workload name from the display name
(sanitized, collision-suffixed per namespace) and freezes it:
Deployment/Service = `<workloadName>`, home PVC =
`<workloadName>-home`. Renaming a workspace's display name never
renames the compute.

## One pitfall to know about

A template's `env.valueFrom.secretKeyRef` resolves in the **pod's**
namespace — the target namespace, never the platform namespace,
whatever the pattern. A template referencing a Secret that only exists
in the platform namespace breaks at startup
(`CreateContainerConfigError`).

What the per-user default changes is that the target namespace is no
longer **known in advance**, so the Secret cannot simply be
pre-provisioned once. Two supported ways out: provision it into the
target namespaces (External Secrets/Vault), or pin the template to a
shared namespace known in advance where the Secret is pre-provisioned —
what the dev `dev-ssh` template does with
`placement.namespace: waas-workspaces`.

Protocol `credentialsSecretRef`s are **not** affected — they resolve
server-side in the platform namespace.
