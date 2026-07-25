---
sidebar_position: 10
title: Accepted limitations
description: Delegated rights the portal deliberately does not surface — what that implies, and how to use them through the API or the CRDs.
---

# Accepted limitations

The portal is a **mirror** of your server-side rights, never the
enforcement point. The admission webhook judges every request the same
way whether it comes from the portal, `curl` or `kubectl` — so a few
delegated rights deliberately have **no portal UI**: they exist, they
are enforced, but exercising them requires the API or the CRDs.

This page lists each of those gaps, what it means in practice, and the
supported way through. Nothing here is a backdoor: every example below
goes through the exact same governance as a portal click.

Getting a token for the `curl` examples (local accounts; with SSO, reuse
the browser session's bearer token):

```sh
TOKEN=$(curl -s -X POST https://waas.example.com/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"marc","password":"…"}' | jq -r .data.accessToken)
```

## Advanced overrides: security contexts and volumes

A template can delegate the `securityContext`, `podSecurityContext` and
`volumes` override rights. The portal offers **no editor** for them —
they are pod-spec-shaped, and a form would only pretend to make them
safe. If the right is delegated to you, you can use it at **creation
time** through the API.

**Example — what it implies.** Your `dev-tools` template delegates
`securityContext` and `volumes`; you need `SYS_PTRACE` to run
`strace`/`gdb` plus a scratch volume. The portal cannot express this;
this request can:

```sh
curl -X POST https://waas.example.com/api/v1/workspaces \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{
    "templateRef": "dev-tools",
    "displayName": "debug box",
    "overrides": {
      "securityContext": {"capabilities": {"add": ["SYS_PTRACE"]}},
      "volumes": [{"name": "scratch", "emptyDir": {"sizeLimit": "2Gi"}}],
      "volumeMounts": [{"name": "scratch", "mountPath": "/scratch"}]
    }
  }'
```

Declaratively, the same thing is a [Workspace CR](guides/using-the-crds)
with the identical `spec.overrides` block.

If the template does not delegate the right, the webhook denies with the
usual `[Reason] message` format:

```
[OverrideNotAllowed] template "dev-tools" does not allow overriding "securityContext" (allowed: [resources env])
```

:::warning Semantics and lifecycle

- `securityContext` and `podSecurityContext` **replace** the template's
  values wholesale; `volumes`/`volumeMounts` are **appended** (an entry
  with the same name as a template volume wins over it).
- These overrides are **creation-time only**: the runtime
  reconfiguration endpoint (`PATCH /workspaces/{id}/overrides`) does not
  accept them. To change them, delete the workspace **keeping its home
  volume**, then recreate with the new overrides and `homeVolumeName`
  pointing at the retained volume.

:::

### Before you delegate these rights (admins)

:::danger These rights gate the *field*, not its *content*

`allowedFields` decides **whether** a user may set `volumes`,
`securityContext` or `podSecurityContext`. It does not — and
deliberately will not — inspect **what** they put in it. Read literally,
that means:

**`volumes`** accepts any Kubernetes volume source. A user who has the
right can attach:

```yaml
volumes:
  - name: anything
    secret:
      secretName: <any Secret sitting in the workspace namespace>
```

and read that Secret from their desktop. The workspace namespace
normally holds at least the registry pull secret and the per-workspace
SSH key. The same reachability comes through `projected:`, which can
also re-introduce a ServiceAccount token WaaS otherwise disables. On
clusters not enforcing Pod Security Admission `restricted`, `cephfs`,
`rbd` and `iscsi` are reachable too, each with its own `secretRef`.

**`securityContext`** covers the whole struct, `privileged: true`
included. **`podSecurityContext`** is the pod-level twin — `runAsUser: 0`,
`fsGroup`, `supplementalGroups`, `sysctls`. Only the namespace's Pod
Security Admission level stops either.

:::

**Why WaaS does not validate the content.** Pod Security Admission is
not the safety net here: the `restricted` level explicitly **permits**
`secret` and `projected` volumes, because mounting a Secret from your
own namespace is ordinary Kubernetes. Re-implementing that judgement
inside WaaS would mean running a second policy engine over a volume
schema that grows with every Kubernetes release — and it would put the
decision in the wrong place. **Constraining how a delegated pod-spec
field may be used is cluster administration**, and Kubernetes already
ships the tools for it.

**What to do instead.** Treat all three rights as equivalent to handing
out namespace-level access:

1. **Delegate them only to people you would trust with `kubectl` on the
   target namespace.** That is the honest mental model — everything
   above follows from it.
2. **Prefer the alternatives when they fit.** A shared filesystem is
   better served by an admin-provisioned PersistentVolumeClaim, or by a
   volume declared **in the template**, than by a user-authored inline
   volume. Both keep you in control of *which* storage is reachable.
   Same for secrets: inject them from the template, never through a
   user override.
3. **If you must delegate with partial trust, pair it with an admission
   policy.** A `ValidatingAdmissionPolicy` (GA in Kubernetes 1.30, beta
   since 1.28, no extra component), Kyverno or Gatekeeper, scoped to your
   workspace namespaces, is where you express rules like "no `secret`
   volumes in tenant-created pods".

:::info The default policy does not grant these

The bootstrap `WorkspacePolicy` shipped by the Helm chart grants
`env`, `resources` and `schedule` — **not** `volumes`, and never the
security contexts. The reference GitOps policy set does the same.
Granting them is an explicit, auditable change on your side.

**Chart 0.2.x and earlier did grant `volumes`** in that bootstrap
policy; 0.3.0 drops it. Upgrading does not rewrite a policy you already
have, so check `defaultPolicy.overrides.allowedFields` on an existing
install. If you relied on it, add it back deliberately — after reading
the warning above.

:::

## Choosing the target namespace at creation

A template (or policy) can delegate the `placement` right, and the
creation API accepts a `targetNamespace` that overrides the template's
[placement pattern](concepts/placement). The portal never offers this
field — it always uses the resolved pattern and shows you the preview.

**Example — what it implies.** Your team shares `waas-team-blue`
(common quota, team NetworkPolicy) and your template's pattern would
put you in `waas-marc`. With the `placement` right:

```sh
curl -X POST https://waas.example.com/api/v1/workspaces \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{
    "templateRef": "xfce",
    "targetNamespace": "waas-team-blue"
  }'
```

Declaratively: set `spec.targetNamespace` on the Workspace CR. Either
way the value is **frozen at creation** — a workspace never moves.

:::warning Typos create namespaces

Namespace placement is create-only bootstrap: if the target namespace
does not exist, the operator **creates it** — with the full quota /
NetworkPolicy / Pod Security bootstrap. A typo (`waas-team-bleu`) does
not fail; it silently mints a new, fully equipped namespace. Check the
spelling, and check `kubectl get ns` afterwards if in doubt. This
namespace-sprawl risk is exactly why the portal has no free-text field
for it.

:::

## Metadata overrides show your override, not the merged result

With the `metadata` right you can set labels/annotations on your
workspace's workload, from the creation dialog and the runtime settings
tab. The portal shows **your override as stored** — not the final
metadata of the workload, which is the template's metadata merged with
yours, where **platform and template keys always win** and reserved
domains (`waas.xorhub.io/*`, `kubernetes.io/*`, …) are rejected
server-side:

```
[OverrideNotAllowed] overrides.labels: metadata key "waas.xorhub.io/owner" is reserved (domain "waas.xorhub.io" is platform- or Kubernetes-owned)
```

**Example — what it implies.** The template stamps `team: platform` on
the workload; you override `team: blue`. The settings tab shows `blue`
(your override, faithfully), but the deployed workload carries
`platform` — the template's key shadows yours.

There is nothing to bypass here; the truth is always on the workload
object, whose namespace and name the workspace card displays:

```sh
kubectl -n <namespace> get deploy <workloadName> \
  -o jsonpath='{.spec.template.metadata.labels}'
```

If a label of yours does not appear there, it collided with a template
or platform key — pick a key the template does not set.
