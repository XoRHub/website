---
sidebar_position: 1
title: Workspace images
description: What runs inside a Linux workspace — design, the contract with the Workspace CR, and the image catalog.
---

# Workspace images

Linux workspaces run OCI images from the
[waas-images](https://github.com/XoRHub/waas-images) project —
Kasm-style, 100% OSS desktop images purpose-built for the platform.

## Design in one paragraph

TigerVNC's **Xvnc is the display server** (no Xvfb double stack): it
serves RFB natively — exactly what guacd's VNC client speaks — and
supports dynamic resize. **RDP is a bridge**: xrdp without sesman/PAM,
its `libvnc` backend pointed at the local Xvnc, fully non-root — both
protocols always show the same session. Services run under **tini +
supervisord**, entirely unprivileged; the entrypoint renders all
mutable config into tmpfs so the **root filesystem can be read-only**.
The web client is guacd/wwt from the platform — no noVNC in the
images. Every image boots in CI with `--read-only --cap-drop ALL
--security-opt no-new-privileges` and must pass a real protocol
handshake — the hardening checklist is enforced, not aspirational.

```mermaid
flowchart TB
    subgraph layers [Image layers]
        B["base/ — core-* images<br/>Xvnc + openbox, optional xrdp/sshd<br/>(internal build parents, never published)"]
        D["desktop/ — XFCE<br/>ubuntu-desktop-noble, debian-desktop-13, fedora-desktop-43"]
        A["apps/ — one app per image<br/>firefox, chrome, libreoffice, devtools<br/>(VNC-only by construction)"]
        B --> D --> A
    end
```

![Placeholder — image layer tree](/img/placeholders/image-layers.png)

{/* TODO(image): schéma propre de l'arborescence base → desktop → apps avec les variantes */}

**VNC is the recommended protocol for Linux**; RDP is a compatibility
option, and SSH exists only on the OS-level desktop images. Per-app
images (`apps/*`) are VNC-only **by construction** — xrdp and sshd
binaries are simply absent, not merely disabled.

## The contract with the Workspace CR

Any image honoring this contract works as a WaaS Linux workspace —
that's the whole interface, whether the image comes from waas-images or
[your own build](build-your-own.md):

| Aspect | Value |
|---|---|
| VNC port | `5901` (RFB, VncAuth) — the default for `os: linux` |
| RDP port | `3389` (TLS negotiated) — only images built with RDP support, enabled via `WAAS_RDP_ENABLED=1` |
| SSH port | `2222` — publickey only, OS-level desktop images only, opt-in via `WAAS_SSH_ENABLED=1` |
| Audio | PulseAudio native protocol on `4713`, streamed by guacd when the session enables audio |
| Readiness | TCP open on the template port ⇔ the protocol server accepts connections (matches the operator's probes) |
| User | `waas_user`, UID/GID `1000:1000`, home **`/home/waas_user`** = the operator's PVC mount; fresh volumes are seeded from `/etc/skel` |
| Writable paths | `/home/waas_user` (PVC), `/tmp`, `/run` (emptyDirs) — everything else read-only-safe |
| Required env | **`WAAS_DESKTOP_PASSWORD`** — one session password shared by VNC and RDP. The image **refuses to start without it**. Legacy names (`VNC_PW`, `RDP_PASSWORD`) are refused with an explicit error. |
| Optional env | `WAAS_VNC_RESOLUTION`, `WAAS_VNC_COL_DEPTH`, `WAAS_VNC_ENABLED`, `WAAS_RDP_ENABLED`, `WAAS_RDP_AUTH_ENABLED`, `WAAS_SSH_ENABLED`, `WAAS_SSH_AUTHORIZED_KEYS(_FILE)`, `WAAS_STARTUP`, `WAAS_AUDIO_ENABLED`, `WAAS_TLS_CERT`/`WAAS_TLS_KEY` |
| Init hook | optional ConfigMap mounted at `/etc/waas/init.d/` — `*.sh` sourced at boot, as UID 1000 |
| Recommended pod securityContext | `runAsNonRoot`, `runAsUser/fsGroup: 1000`, `readOnlyRootFilesystem: true`, `capabilities.drop: [ALL]`, `allowPrivilegeEscalation: false`, `seccompProfile: RuntimeDefault` → PodSecurity **restricted** compliant |

Every runtime variable is `WAAS_`-prefixed — that is the whole naming
contract. Under the platform you rarely set the password yourself:
when a template has no explicit credential source, the operator
generates a per-workspace password and injects `WAAS_DESKTOP_PASSWORD`
via `secretKeyRef` on its own (see
[Credentials](../concepts/templates-and-protocols.md#credentials)).

Security defaults worth knowing:

- **RDP authentication is on by default** and has no build-time
  opt-out — an image can never leave the pipeline with an open RDP.
- **SSH is publickey-only by construction**: the unprivileged sshd
  cannot read `/etc/shadow`, so password auth is impossible.
- No secrets are ever baked into layers; the password arrives via env
  at runtime, is hashed into tmpfs and scrubbed from the environment.
- `-dev` tagged variants (e.g. `devtools-dev`) are a documented reduced
  profile — sudo baked in, requires a relaxed pod securityContext —
  meant to be gated behind `allowedGroups` in the catalog.

## Which images exist?

The list of published images is deliberately **not** duplicated here —
it changes with every release. The authoritative, machine-readable list
is the catalog the platform itself syncs from:
[`catalog-waas-images.yaml`](https://github.com/XoRHub/waas-images/blob/main/catalog-waas-images.yaml)
(and
[`catalog-kasmweb.yaml`](https://github.com/XoRHub/waas-images/blob/main/catalog-kasmweb.yaml)
for the optional upstream Kasm images). Roughly: OS desktops
(Ubuntu/Debian/Fedora XFCE, multi-protocol) and per-app images
(Firefox, Chrome, LibreOffice, VS Code devtools) on amd64 + arm64.

Image tags are **immutable** (`<version>`, plus throwaway
`<version>-g<sha>` branch tags); published images are cosign-signed
with a CycloneDX SBOM attested to the image reference.

The interesting part is building your own → next page.
