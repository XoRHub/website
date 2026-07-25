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
| `{user}` | username — the account's label, not its internal id |
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

## How names are built — and what it constrains {#name-rules}

A Kubernetes namespace name is a **DNS-1123 label**: lowercase letters,
digits and dashes, 63 characters maximum. Nothing else. Every value that
enters a name is therefore normalized first (accents folded, uppercase
lowered, anything else collapsed into `-`), and that normalization is
**lossy**. Three consequences are worth knowing before you pick a
pattern or hand out usernames.

### 1. Two usernames must not normalize to the same thing

`alice.smith`, `alice_smith`, `alice-smith` and `Alice Smith` all become
`alice-smith`. Your directory treats them as four distinct people; the
namespace cannot. WaaS refuses the second account rather than renaming
it behind your back:

- **creating a local account** returns `409` and names both sides:

  ```
  username "alice_smith" collides with the existing account "alice.smith":
  both resolve to the personal namespace "waas-alice-smith" — pick a username
  that differs by more than case, accents or separators
  ```

- **first SSO login** fails with the generic
  *"SSO login failed for this account — contact an administrator"*. The
  detail never reaches the login page (the caller is not authenticated
  yet and it would disclose another account's username) — it is in the
  audit trail, action `user.sso_placement_conflict`:

  ```
  username "alice.smith" resolves to the personal namespace "waas-alice-smith",
  already used by account "alice-smith"
  ```

**Recommendation.** Treat it as directory hygiene, not as a WaaS
setting. Directories already disambiguate homonyms (`jdoe`, `jdoe2`) —
apply the same convention here, and make usernames differ by more than
case, accents or separators. The most common way to hit this is a
**local account created before SSO was wired**, then re-created by the
IdP under a different separator: delete the stale local account rather
than renaming the person in the directory.

:::note This rule holds whatever your pattern is

The check does not ask whether the resolved namespace is per-user. Two
accounts indistinguishable in every DNS-derived name are a defect on
their own, and a template added later can put `{user}` back into a
pattern at any time.

:::

### 2. Usernames in a non-Latin script are handled, not refused

`иван`, `王五`, `Ωμέγα` and `علي` leave **no** usable character at all —
Kubernetes accepts none of them in a namespace name, nor in a label
value (only annotation values are free-form UTF-8, which is where WaaS
keeps the username itself). Rather than collapsing every such account
into one namespace, `{user}` resolves through the account id — its first
and last groups:

```
account a1b2c3d4-5e6f-7890-abcd-ef1234567890  →  waas-a1b2c3d4-ef1234567890
account f0e9d8c7-6b5a-4321-9876-543210fedcba  →  waas-f0e9d8c7-543210fedcba
```

Predictable rather than hashed, on purpose: you can go from a namespace
back to its owner with a prefix query, and the name derives from the
same key as the namespace's `waas.xorhub.io/owner` label. Nothing to
configure, no account is ever refused for this reason.

### 3. Long values get truncated — and each token's share is fixed

The 63 characters are split as `(63 − literals) ÷ number of tokens`,
computed from the **pattern alone**. A value that fits is kept whole; a
value that overflows its share is cut and given a short hash so two long
values can never silently merge:

| Pattern | Tokens | Budget each | A value is hashed above |
|---|---|---|---|
| `waas-{user}` (built-in) | 1 | 58 | 58 characters — unreachable in practice |
| `waas-{user}-{workspace}` | 2 | 28 | 28 characters |
| `waas-{os}-{templateName}` | 2 | 28 | 28 characters |
| `waas-{user}-{templateName}-{workspace}` | 3 | 18 | 18 characters |

The share is **fixed**: a short value does not lend its unused
characters to a long one.

```
pattern  waas-{user}-{workspace}     user "alice", 28 characters each

"Poste de travail graphique"        → waas-alice-poste-de-travail-graphique
"Poste de travail graphique Ubuntu" → waas-alice-poste-de-travail-graph-8b0d3
                                       hashed, although the full name would
                                       have fit in 44 of the 63 available
```

This is deliberate: making the split adaptive would move the **future**
workspaces of users whose names are truncated today, for a cosmetic
gain.

**Recommendations.**

- **Prefer few tokens.** Each one you add roughly halves, then thirds,
  the room. The built-in `waas-{user}` is the only shape where
  truncation is effectively out of reach.
- **Think twice before putting `{workspace}` in a pattern.** Display
  names are typed by users and routinely exceed 28 characters, so hashed
  namespaces become the norm rather than the exception. `{templateName}`
  and `{os}` are admin-controlled and short — much safer companions.
- **Check the preview.** The creation dialog shows the resolved
  namespace before you commit, and the template editor shows it for the
  pattern you are writing. A hash in the preview is your signal that the
  pattern is too tight for the values it will meet.

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
