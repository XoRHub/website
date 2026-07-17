---
sidebar_position: 7
title: Workspace deletion
description: What gets destroyed, what survives, and how to unblock a stuck teardown.
---

# Workspace deletion

Contract: deleting a `Workspace` destroys **everything** it owned — in
the cluster and in the platform database — except what the user
explicitly chose to keep (the home volume). Deletion behaves
identically whatever triggered it: portal, `kubectl delete`, ArgoCD
prune, or a policy TTL.

## What is cleaned up, by whom

| Resource | Mechanism |
|---|---|
| Workload + Service in the CR's namespace | ownerReference (native cascade) |
| Workload + Service **placed** in another namespace | `waas.xorhub.io/teardown` finalizer (ownerReferences cannot cross namespaces) |
| Home PVC | finalizer, applying your keep/delete choice — see [Volumes](volumes) |
| Namespace (if `DeleteWhenEmpty`) | the operator's namespace janitor, once truly empty |
| Session rows (database) | api-server — immediately on API deletion, by a background sweeper for kubectl/ArgoCD deletions |

## When teardown fails

A failing teardown is **never silent**: every attempt emits a Warning
event `TeardownFailed` on the CR and sets the `Ready` condition with
the cause — visible in `kubectl describe workspace` and on the portal
card. Retries continue with backoff; the finalizer is never removed
automatically (that would trade a visible stuck deletion for a silent
resource leak).

If a workspace stays in `Terminating`:

```sh
kubectl -n <cr-namespace> describe workspace <name>   # read the TeardownFailed cause
# fix the cause (RBAC, API availability, webhook…) — deletion resumes on its own
```

Last resort — this **knowingly abandons** the remaining cleanup:

```sh
kubectl -n <cr-namespace> patch workspace <name> --type=merge \
  -p '{"metadata":{"finalizers":null}}'
```

The waas repository ships `hack/audit-orphans.sh` to list (and with
`--clean`, reap) anything a bypassed finalizer left behind.
