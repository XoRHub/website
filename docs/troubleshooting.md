---
sidebar_position: 9
title: Troubleshooting
description: Common failure modes and how to read them.
---

# Troubleshooting

The golden rule: **the Workspace CR tells the story**. Phase,
conditions and Events carry every admission decision, denial reason and
teardown failure — start with:

```sh
kubectl -n <cr-namespace> describe workspace <name>
```

## Workspace is denied at creation

Denials read `[ReasonCode] human message` — in the kubectl error, the
HTTP 403, the `Ready` condition and the portal alike.

| Reason | Meaning | Fix |
|---|---|---|
| `NoPolicyMatches` | no `WorkspacePolicy` matches you | ship a `default` policy at priority 0; check your IdP groups are mirrored (they sync at SSO login) |
| `ImageNotInCatalog` | the template's image has no `WorkspaceImage` entry | add/approve the catalog entry with the **exact** ref |
| `ImageDisabled` | catalog kill-switch is off | re-enable the `wsi` |
| `ImageNotAllowed` | `allowedGroups` or the policy's image subset excludes you | check the policy's `images` and the image's `allowedGroups` |
| `ProtocolMismatch` | template declares a protocol the image doesn't serve | align `protocols` with the `WorkspaceImage.protocols` |
| `ResourcesOutOfBounds` | sizing outside image min/max or policy caps | pick a size within bounds |
| `QuotaExceeded` | count, running count or aggregate over the policy limit | delete/pause something, or raise the policy. "running workspace quota reached" also denies **resume** — expected with `maxRunningWorkspaces`, pausing another workspace frees the slot (or create the workspace paused) |
| `IdentityViolation` | `spec.owner` ≠ your authenticated user, or forged identity annotations | set `owner` to your own username; never set `waas.xorhub.io/*` identity annotations |
| `OverrideNotAllowed` | an override field is not delegated to you | template ∩ policy `overrides.allowedFields` must contain the field |
| `PlacementDenied` | the `targetNamespace` you asked for is neither the resolved default, nor labeled with your ownership, nor a free name in your `waas-<user>` territory — a name inside your prefix that already belongs to another user is refused | drop `targetNamespace` to take the default, or ask an admin (they may place anywhere) |

A user whose group mirror is empty matches only subjects-less policies —
that's the "everyone gets the default policy" symptom, not a priority
bug: groups sync from the IdP at every SSO login (or via admin edit).

## I was signed out right after changing something about myself

Expected, and it is the platform telling you so rather than hiding it.
Changing your password (Profile page), demoting yourself (Users page) or
deactivating / password-resetting your own account through the API
revokes **every** session of that account — the one you did it from
included. The portal returns you to the login page with a notice naming
the reason instead of waiting for the next request to fail.

You cannot be signed back in on the spot: the replacement session would
be minted in the same second as the revocation and refused by it. Sign in
again with the new password or the new rights.

Two things this is **not**: editing someone else's account never touches
your own session, and an edit that revokes nothing (a quota bump on
yourself, for instance) leaves you signed in. If you were signed out
without changing anything, read the next section instead.

## I cannot demote or deactivate my own admin account

```
the platform must keep at least one active administrator — promote another
account first
```

You are the last active administrator. The refusal is deliberate: there
is no in-product way back from zero admins, and `WAAS_ADMIN_PASSWORD`
only seeds an **empty** user table — a redeploy would not restore the
role, only a manual database edit would. Promote another account to
admin, then retry.

## A user cannot log in via SSO

The login page always shows the same generic message — *"SSO login
failed for this account — contact an administrator"* — because the
caller is not authenticated yet and a precise message would disclose
another account. **The reason is in the audit trail**, and there are two
of them:

| Audit action | Meaning | Fix |
|---|---|---|
| `user.sso_link_conflict` | the IdP's username claim matches an **existing** account bound to a different subject (or a local one). Treated as an attempted takeover — many IdPs let users pick their own username claim | rename or delete the conflicting account; never repoint the IdP's `sub` |
| `user.sso_placement_conflict` | the username is distinct, but it **normalizes** onto an existing account's namespace (`alice.smith` vs `alice_smith`) | see [how names are built](concepts/placement#name-rules) — usually a stale local account created before SSO was wired; delete it, or rename one side in the directory |

```sh
# both carry the two usernames and the namespace in their detail
curl -s -H "Authorization: Bearer $TOKEN" \
  'https://waas.example.com/api/v1/admin/audit-logs?action=user.sso_placement_conflict' | jq
```

A user in a non-Latin script (`иван`, `王五`) is **never** refused for
this reason — those resolve through the account id instead.

## Workspace Running but not connectable

- `Ready=True` but `ConnectionReady=False`: the pod runs but the
  desktop server doesn't listen yet (or crashed). Check the pod logs in
  the target namespace.
- The desktop container **refuses to start without
  `WAAS_DESKTOP_PASSWORD`** — under the platform this is injected
  automatically; standalone/custom setups must provide it. Legacy
  `VNC_PW`/`RDP_PASSWORD` are refused with an explicit error.
- `CreateContainerConfigError`: a template `secretKeyRef` resolves in
  the **target** namespace, never the platform one — and with the
  per-user default that namespace is not known in advance. Provision the
  Secret there (External Secrets/Vault), or pin the template to a shared
  namespace where it is pre-provisioned. See
  [Placement](concepts/placement#one-pitfall-to-know-about).
- `PullSecretMissing` condition: the `WorkspaceImage`'s
  `imagePullSecretRef` points at a missing Secret — fail-closed,
  retried automatically once fixed.

## The desktop can't reach something on the network

Placed namespaces carry a **default-deny egress** policy: DNS is always
open, the public internet is allowed minus
`operator.desktopEgress.blockedCIDRs` — the cloud IMDS and, by default,
every RFC1918 range. So an internal service (package mirror, private
Git, on-prem API) is blocked until it is listed in
`operator.desktopEgress.extraAllowedCIDRs`, which wins over the blocked
ranges. Symptoms are timeouts, not errors: name resolution keeps
working. Full rule set:
[Placement](concepts/placement#what-desktops-can-reach-the-waas-default-ingress-policy).

If your CNI does not enforce NetworkPolicy **egress**, the policy is
inert — `operator.desktopEgress.enabled: false` makes that explicit
rather than leaving a policy you believe in.

## Video works, no sound

`enable-audio` alone is not enough over VNC: the template's `vnc`
protocol entry also needs `exposeAudioPort: true` (opens PulseAudio's
4713 on the container and Service). Without it the session degrades
silently. See
[Templates and protocols](concepts/templates-and-protocols#protocol--feature-matrix).

## Workspace stuck in Terminating

Read the `TeardownFailed` event/condition on the CR — the finalizer
retries forever rather than leak silently. Full procedure, including
the last-resort finalizer bypass:
[Workspace deletion](concepts/workspace-deletion#when-teardown-fails).

## Paused workspace didn't come back on schedule

Remember the arbitration rule: a **manual** action wins until the next
scheduled edge of the **opposite** kind. A manual pause during an
uptime window stays down until the *next* scheduled start — that's the
contract, not a missed cron. See
[Workspace lifecycle](concepts/workspace-lifecycle#when-a-manual-action-meets-the-schedule).

## Where the logs are

| Component | What you'll find |
|---|---|
| operator | reconcile decisions, admission re-checks, teardown/janitor activity |
| api-server | auth, policy resolution, audit trail, session sweeper |
| wwt | session/JWT validation, guacd handshakes |
| desktop pod | Xvnc/xrdp/sshd/supervisord logs, entrypoint warnings (e.g. RDP auth disabled) |

All in the platform namespace (`kubectl -n waas logs deploy/...`),
desktop pods in their target namespace.
