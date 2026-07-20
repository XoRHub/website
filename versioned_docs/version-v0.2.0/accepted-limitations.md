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

:::warning For admins

Delegating `securityContext` delegates the **whole struct** —
`privileged: true` included. Only grant it on templates whose audience
you would trust with `kubectl` on the target namespace.

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
