---
sidebar_position: 3
title: Templates and protocols
description: How a WorkspaceTemplate shapes the desktop — workload kind, VNC/RDP/SSH/KasmVNC, credentials, user overrides.
---

# Templates and protocols

A [`WorkspaceTemplate`](../reference/crds/workspacetemplate) is the
admin-authored shape of a desktop. This page covers its three big
levers: the **workload**, the **protocols**, and the **overrides** a
workspace creator may apply.

## Workload

The template picks the workload kind and passes through the pod spec:

```yaml
spec:
  workload:
    kind: Deployment          # Deployment (default) | StatefulSet | Pod
    securityContext: {}       # container-level
    podSecurityContext: {}    # pod-level
    volumes: []
    volumeMounts: []
    nodeSelector: {}
    tolerations: []
    serviceAccountName: ""
```

- **Deployment** (default): 1 replica, `Recreate` strategy — the home
  PVC is RWO, two desktop pods must never overlap.
- **StatefulSet**: stable identity.
- **Pod**: legacy bare-pod behavior.

The home PVC mount, protocol ports and probes stay platform-managed and
cannot be overridden. Changing a template's workload kind never touches
running workspaces — the new kind applies at the next provisioning.

## Protocols

A template may declare several connection protocols:

```yaml
spec:
  protocols:
    - name: vnc          # vnc | rdp | ssh | kasmvnc
      port: 5901
      default: true      # first entry wins if none is marked
      params:            # locked guacd connection parameters
        color-depth: "24"
      userParams: [color-depth, cursor]   # user-tunable at connect time
      credentialsSecretRef: my-creds      # optional explicit credentials
```

- `vnc`, `rdp` and `ssh` are freely combinable on one template.
  **`kasmvnc` is exclusive**: it bypasses guacd entirely, so a template
  declaring it may declare no other protocol.

:::warning KasmVNC is experimental
The `kasmvnc` protocol is at an **experimental** stage. It may change
incompatibly or be **removed at any time**, without a deprecation
cycle. Don't build production templates on it — prefer `vnc`, `rdp` or
`ssh`.
:::
- With no `protocols` at all, one is synthesized from `os`/`port`
  (linux → `vnc:5901`, windows → `rdp:3389`).
- Every `params` key is validated at admission against the platform's
  parameter registry: unknown names and platform-owned parameters
  (credentials, gateways, `enable-sftp`, recording, …) are rejected for
  every caller, kubectl included.
- The workspace Service exposes every declared port;
  `status.protocols` lists them with the effective default. At connect
  time users pick a protocol among the declared ones and may tune the
  parameter names delegated by `userParams` (entries are exact names or
  whole categories like `cat:audio`).

### Which protocol should a Linux template use?

**VNC is the recommended protocol for Linux desktops** built from
waas-images; RDP is a compatibility bridge and SSH gives a terminal
(guacd renders it — nothing to install client-side). See the
[protocol capability matrix](#protocol--feature-matrix) below.

### Credentials

Desktop credentials never live in a CR. Three levels, in precedence
order:

1. **`credentialsSecretRef`** — explicit, always wins. Each protocol
   entry may name a Secret with the keys `username`, `password`,
   `private-key`, `passphrase` (all optional). The api-server resolves
   it server-side when a session starts — the browser never sees the
   values. Ship it with External Secrets/Vault; typically the same
   Secret also feeds the pod via env `valueFrom` (e.g.
   `WAAS_DESKTOP_PASSWORD`) so both sides agree.
2. **Generated per-workspace credentials** — the default when nothing
   explicit is provided: the operator generates a random credential per
   workspace, stores it in a Secret next to the CR, wires it into the
   pod, and the api-server resolves the same Secret at connect time.
   Zero template configuration. For `ssh`, this generates a keypair:
   public key mounted into the pod, private key handed to guacd at
   connect — the private key never exists in the pod's namespace.
3. **Literal `WAAS_DESKTOP_PASSWORD` with `docker run`** — the
   standalone path for running a waas-images build outside the
   platform. Literal env passwords in a template are **not** read by
   the platform.

Rotation of generated credentials is create-only: delete the Secret and
roll the workload; the operator never rotates on its own.

### SSH specifics

SSH is a capability of the **OS-only** waas-images desktops
(`ubuntu-desktop-noble`, `debian-desktop-13`, `fedora-desktop-43`) —
never of the per-app images, which are VNC-only by construction. The
in-image sshd runs fully unprivileged on port 2222 and is
**publickey-only**: password auth is impossible by construction.
Declaring the `ssh` protocol on a template is enough — the operator
generates the keypair and enables sshd itself.

## Creator overrides

The template decides what workspace creators may deviate:

```yaml
spec:
  overrides:
    allowedFields: [env, resources, protocol, protocolParams,
                    securityContext, podSecurityContext, volumes,
                    nodeSelector, tolerations, schedule, placement, metadata]
    owner: alice        # this platform user may override anything (template-side)
```

Merge semantics: env/volumes/mounts merge by name (workspace wins),
nodeSelector merges key-wise, tolerations append, security contexts
replace. Metadata (`labels`/`annotations`) merges **under** the
template's workload metadata — platform and template keys always win,
reserved domains are rejected. A schedule override replaces the
template's schedule wholesale.

On top of the template's list, the user's
[**policy**](governance#override-restriction) may restrict further —
the effective allow-list is the **intersection** of both. Enforcement
is server-side (admission webhook + a reconciler re-check), and every
applied override is audited (field and env var *names*, never values).

:::warning
Allow-listing `volumes` lets users mount arbitrary volume sources —
including `hostPath`. Only enable it on templates aimed at trusted
groups.
:::

In the portal, users who hold override rights see an **Advanced
(template overrides)** panel in the creation dialog; everyone else
never sees it. The panel mirrors the webhook's decision — it never
replaces it. Part of the set is also editable **after** creation, from
the workspace's settings tab: env, nodeSelector, tolerations,
resources, metadata and schedule (applied by rollout — clearing one
falls back to the template). Security contexts and volumes stay
creation-time-only — see
[Accepted limitations](../accepted-limitations).

## Protocol × feature matrix

| Feature | VNC | RDP | SSH | KasmVNC (experimental) |
|---|---|---|---|---|
| Audio playback | ✅ (`enable-audio` + `exposeAudioPort`) | ⚙️ param exists; official images ship no RDP audio chain | N/A | ❌ |
| Governed clipboard | ✅ live | ✅ live, text only | ✅ live | ✅ container-side |
| Persistent home | ✅ | ✅ | ✅ | ✅ |
| File transfer | 🚫 platform-blocked | 🚫 | 🚫 | 🚫 |
| Session recording | 🚫 platform-blocked | 🚫 | 🚫 | ❌ |
| Keyboard layout | N/A (direct keysyms) | ✅ auto-detected from the browser locale | N/A | N/A |
| Dynamic resize | ✅ | ✅ | ❌ (CSS-scaled) | ✅ native |

Legend: ✅ supported · ⚙️ advanced/YAML only · 🚫 deliberately blocked
for everyone (until the feature ships with its own policy gate) ·
❌ absent · N/A not applicable.

Server-side **audio** needs two things: the `enable-audio` session
parameter and `exposeAudioPort: true` on the `vnc` protocol entry —
that opens PulseAudio's port 4713 on the container and Service
(cluster-internal only). Without the port, sessions degrade silently:
video OK, no sound.

## Portal comfort features

Shipped alongside templates and worth knowing about: **split view**
(1–3 desktops side by side with draggable dividers), **folders** to
group workspaces, per-user **protocol/parameter preferences**
(re-validated server-side at every connect), and light/dark **theme**.

![Placeholder — template picker with icons in the creation dialog](/img/placeholders/template-picker.png)

{/* TODO(image): capture du picker de templates (icônes dashboard-icons, descriptions) */}
