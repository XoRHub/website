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
supports dynamic resize. **VNC is the only protocol**: the platform
reaches a Linux workspace over VNC and nothing else (`rdp` is reserved
for Windows VMs — **Not Implemented Yet** — and `ssh` belongs to
[remote workspaces](../guides/remote-workspaces.md)), so no image ships
`xrdp` or `sshd`, no build arg can add them, and ports 3389/2222 are
not exposed. Services run under **tini + supervisord**,
entirely unprivileged; the entrypoint renders all mutable config into
tmpfs so the **root filesystem can be read-only**. The web client is
guacd/wwt from the platform — no noVNC in the images. Every image boots
in CI with `--read-only --cap-drop ALL --security-opt
no-new-privileges` and must answer a real RFB banner — the hardening
checklist is enforced, not aspirational.

## How the images are built

Every image declares one parent (`from:` in its manifest), which CI
resolves to the exact ref built earlier in the same pipeline. An image
contains its own layer plus every ancestor's — so **capability is
inherited, never added later**: every image gets the Xvnc stack, the
PulseAudio daemon and the hardening from the core at the root of its
chain, and `devtools` gets Firefox, git and mise for free because it
descends from the published Ubuntu desktop.

```mermaid
flowchart TB
    subgraph base ["base/ — core-* build parents, never published"]
        CORE["core-ubuntu-noble<br/>core-debian-13 · core-fedora-43<br/><b>VNC only</b>"]
    end

    subgraph desktop ["desktop/ — XFCE + baseline (browser, git, ssh client, mise)"]
        OSD["ubuntu-desktop-noble<br/>debian-desktop-13<br/>fedora-desktop-43"]
    end

    subgraph apps ["apps/"]
        KIOSK["single-app kiosks (WAAS_APP)<br/>no desktop in the image"]
        DT["devtools<br/>full XFCE desktop + VS Code"]
    end

    CORE --> OSD
    CORE --> KIOSK
    OSD --> DT
```

One OS-parameterized Dockerfile builds the Ubuntu and Debian cores
(Fedora, dnf-based, has its own). Each OS desktop descends from the
core of its own OS (`fedora-desktop-43` from `core-fedora-43`), the
kiosks from `core-ubuntu-noble`, and `devtools` from the published
`ubuntu-desktop-noble`. A `-dev` variant is a separate **tag** from the
same build, not a runtime flag.

### Build order

CI derives each image's **depth** from that parentage — 0 for a root,
parent + 1 otherwise — and builds one depth at a time:

```mermaid
flowchart LR
    L0["<b>layer-0</b> — 3 images<br/>core-ubuntu-noble<br/>core-debian-13<br/>core-fedora-43"]
    L1["<b>layer-1</b> — 8 images<br/>ubuntu-desktop-noble<br/>debian-desktop-13 · fedora-desktop-43<br/>firefox · chrome · libreoffice<br/>hermes-agent · -dev"]
    L2["<b>layer-2</b> — 2 images<br/>devtools · devtools-dev"]
    L0 -->|"merge + push"| L1 -->|"merge + push"| L2
```

Within a wave everything runs in parallel — one job per image **per
architecture**, each doing build → smoke → scan, then a merge job that
publishes the multi-arch index. The next wave cannot start before that
merge: a child's `BASE_IMAGE` is the exact ref its parent just pushed,
which is what makes a change to a base propagate through the whole tree
in a single pipeline run.

Depth is a *consequence* of `from:`, not something you set. Only
`devtools` reaches depth 2 today, and the generator hard-fails above it
— `.github/workflows/build.yml` wires exactly three `layer-N`/`merge-N`
pairs, so a deeper tree is a deliberate ~10-line change there, never a
silent one.

A kiosk's `WAAS_APP` session mode runs its one application undecorated
and maximized, with no panel, terminal or window-manager keybindings
behind it.

The OS desktops ship a **working baseline**, not a bare XFCE:
Firefox, git, an **SSH client** (the client half only — for outbound
`git push`; no image ships an sshd), curl, vim and less — enough to
clone, edit and push without installing anything first. `devtools`
inherits that and adds VS Code plus the system build toolchain on top;
the kiosks deliberately do not, having no shell to use it from.

## The contract with the Workspace CR

Any image honoring this contract works as a WaaS Linux workspace —
that's the whole interface, whether the image comes from waas-images or
[your own build](build-your-own.md):

| Aspect                          | Value                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VNC port                        | `5901` (RFB 3.8, VncAuth) — guacd protocol `vnc`, the only protocol for `os: linux`                                                                                                                                                                                                                                                                                        |
| Audio                           | PulseAudio native protocol on `4713`, streamed by guacd when the session enables audio                                                                                                                                                                                                                                                                                     |
| Readiness                       | TCP open on `5901` ⇔ Xvnc accepts connections (matches the operator's probes)                                                                                                                                                                                                                                                                                              |
| User                            | `waas_user`, UID/GID `1000:1000`, home **`/home/waas_user`** = the operator's PVC mount; fresh volumes are seeded from `/etc/skel`                                                                                                                                                                                                                                         |
| Writable paths                  | `/home/waas_user` (PVC), `/tmp`, `/run` (emptyDirs) — everything else read-only-safe                                                                                                                                                                                                                                                                                       |
| Required env                    | **`WAAS_DESKTOP_PASSWORD`** — the VNC session password. The image **refuses to start without it**. The legacy name `VNC_PW` is refused with an explicit error.                                                                                                                                                                                                             |
| Optional env                    | `WAAS_VNC_RESOLUTION`, `WAAS_VNC_COL_DEPTH`, `WAAS_AUDIO_ENABLED`, `WAAS_STARTUP` (full session command), `WAAS_APP` (single-app kiosk command — mutually exclusive with `WAAS_STARTUP`)                                                                                                                                                                                   |
| Init hook                       | optional ConfigMap mounted at `/etc/waas/init.d/` — `*.sh` sourced at boot, as UID 1000                                                                                                                                                                                                                                                                                    |
| Recommended pod securityContext | `runAsNonRoot`, `runAsUser/fsGroup: 1000`, `readOnlyRootFilesystem: true`, `capabilities.drop: [ALL]`, `allowPrivilegeEscalation: false`, `seccompProfile: RuntimeDefault` → PodSecurity **restricted** compliant                                                                                                                                                          |

Every runtime variable is `WAAS_`-prefixed — that is the whole naming
contract. Under the platform you rarely set the password yourself:
when a template has no explicit credential source, the operator
generates a per-workspace password and injects `WAAS_DESKTOP_PASSWORD`
via `secretKeyRef` on its own (see
[Credentials](../concepts/templates-and-protocols.md#credentials)).

Security defaults worth knowing:

- **VNC authentication is always on** (`VncAuth`); an empty password
  refuses to start. There is no credential-less mode to opt into: the
  only session listener is Xvnc, and it always asks.
- No secrets are ever baked into layers; the password arrives via env
  at runtime, is hashed into tmpfs and scrubbed from the environment.
- `-dev` tagged variants (e.g. `devtools-dev`) are a documented reduced
  profile — sudo baked in, requires a relaxed pod securityContext —
  meant to be gated behind `allowedGroups` in the catalog. Reach for
  one only when you genuinely need system packages: for language
  runtimes and CLI tools, the hardened image is enough (see below).

:::note Upgrading from a 2.x image
Earlier majors carried an optional xrdp bridge and an opt-in sshd on
the OS desktops (`WAAS_RDP_ENABLED`, `WAAS_RDP_AUTH_ENABLED`,
`WAAS_SSH_ENABLED`, `WAAS_SSH_AUTHORIZED_KEYS(_FILE)`,
`WAAS_TLS_CERT`/`_KEY`). Since **3.0.0** the daemons, their build args
and those variables are gone rather than defaulted off: setting them
does nothing, and a template still declaring `rdp` or `ssh` on one of
these images is rejected by the platform itself, not by the image —
see [Troubleshooting](../troubleshooting.md#template-denied-rdp-on-a-linux-template-or-ssh-anywhere-in-cluster).
:::

## Installing tools that survive a restart

Only `/home/waas_user` is a volume, so anything `apt install` writes
lands in the container layer and dies with the pod. The desktop images
therefore ship **mise**: it installs language runtimes and CLI tools
under `~/.local/share/mise` — on the home PVC — so they survive
restarts, pauses and image changes exactly like the rest of the home.

```bash
mise use -g node@22      # persists; still there after a pod restart
mise use -g python@3.13
```

It needs no privileges and writes nothing outside `$HOME` and `/tmp`,
so it works on the **hardened** images under a read-only root
filesystem. A workspace that only needs a runtime or a CLI tool
therefore does **not** need a `-dev` tag.

What it does not cover: **system libraries**. Anything requiring a
shared object, a codec or an apt package's maintainer scripts still
means `sudo apt install` on a `-dev` image — and that is still lost on
restart. Two consequences worth knowing: what a user installs this way
lives on the PVC, so it sits outside the image's trivy gate and SBOM by
construction; and mise's shims come first on `PATH`, so a
user-installed `python3` shadows the image's own.

## Which images exist?

The list of published images is deliberately **not** duplicated here —
it changes with every release. The authoritative, machine-readable list
is the catalog the platform itself syncs from:
[`catalog-waas-images.yaml`](https://github.com/XoRHub/waas-images/blob/main/catalog-waas-images.yaml)
(and
[`catalog-kasmweb.yaml`](https://github.com/XoRHub/waas-images/blob/main/catalog-kasmweb.yaml)
for the optional upstream Kasm images). Roughly: OS desktops
(Ubuntu/Debian/Fedora XFCE) and per-app images (Firefox, Chrome,
LibreOffice, VS Code devtools, Hermes Agent) on amd64 + arm64.

Image tags are **immutable** (`<version>`, plus throwaway
`<version>-g<sha>` branch tags); published images are cosign-signed
with a CycloneDX SBOM attested to the image reference.

The interesting part is building your own → next page.
