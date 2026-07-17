---
sidebar_position: 2
title: Quickstart
description: Install WaaS on an existing cluster, create your first Workspace and connect to it from the browser.
---

# Quickstart

This page takes you from an existing Kubernetes cluster to a desktop in
your browser. It is written for platform users and admins — if you want
to hack on WaaS itself, see the developer quickstart in the
[waas repository](https://github.com/XoRHub/waas#quickstart-local-dev)
instead, or [try WaaS on a local k3d cluster](installation/try-locally).

## Prerequisites

- A Kubernetes cluster `>= 1.26` and `kubectl`/`helm` access to it.
- [cert-manager](https://cert-manager.io/docs/installation/) installed —
  the **only** external prerequisite (it issues the admission webhook and
  ingress certificates).
- Optional: KubeVirt, only if you want Windows workspaces. It is
  auto-detected — nothing to configure.

## 1. Install the chart

```sh
helm install waas oci://ghcr.io/xorhub/waas/charts/waas \
  --namespace waas --create-namespace \
  --set ingress.host=waas.example.com \
  --set ingress.tls.issuerRef.name=<your-clusterissuer>
```

A single chart installs everything: operator, API server, WebSocket
proxy, frontend, guacd and PostgreSQL. See
[Installation](installation/) for the values you will care about in a
real deployment (OIDC SSO, external PostgreSQL, placement, bootstrap
policies).

The default install already includes:

- a **default `WorkspacePolicy`** (priority 0, applies to every
  authenticated user: 3 workspaces max, modest per-workspace caps,
  2 h idle suspend, 14-day max lifetime);
- the **waas-images catalog** (`catalogs.waasImages`, enabled by
  default): the official XorHub desktop images are pre-approved so the
  picker is not empty on first login.

Log in with the bootstrap `admin` account — if you didn't set
`apiServer.adminPassword`, the generated password is printed once in
the api-server logs:

```sh
kubectl -n waas logs deploy/waas-api-server | grep -i password
```

## 2. Create a WorkspaceTemplate

A template describes the desktop: which image, which sizing, which
protocols. Apply this minimal template (adjust the image tag to the
[current catalog](https://github.com/XoRHub/waas-images/blob/main/catalog-waas-images.yaml)):

```yaml title="template.yaml"
apiVersion: waas.xorhub.io/v1alpha1
kind: WorkspaceTemplate
metadata:
  name: ubuntu-desktop
  namespace: waas
spec:
  displayName: "Ubuntu 24.04 — XFCE Desktop"
  description: "Full XFCE desktop over VNC (recommended protocol for Linux)."
  os: linux
  image: docker.io/xorhub/ubuntu-desktop-noble:2.0.1
  port: 5901
  homeSize: 10Gi
  resources:
    requests: { cpu: 500m, memory: 1Gi }
    limits: { cpu: "2", memory: 4Gi }
```

```sh
kubectl apply -f template.yaml
```

No credentials to configure: when a template exposes VNC/RDP without an
explicit password source, the platform generates a random per-workspace
password, injects it into the pod and resolves it server-side at
connect time. See
[Templates and protocols](concepts/templates-and-protocols#credentials)
for the explicit-Secret pattern.

:::note
The image must be approved by the catalog: workspace creation fails
with `ImageNotInCatalog` otherwise. The default install pre-approves
the `docker.io/xorhub` registry, so the template above works
out of the box. For your own images, add a
[`WorkspaceImage`](reference/crds/workspaceimage) entry first.
:::

## 3. Create a Workspace

From the portal: **New workspace**, pick the template, pick a size,
create.

![Placeholder — workspace creation dialog in the portal](/img/placeholders/create-workspace.png)

{/* TODO(image): capture du dialogue de création de workspace (choix template + sliders sizing) */}

Or declaratively — the GitOps way:

```yaml title="workspace.yaml"
apiVersion: waas.xorhub.io/v1alpha1
kind: Workspace
metadata:
  name: alice-ubuntu
  namespace: waas
spec:
  displayName: "Alice's Ubuntu desktop"
  owner: alice          # must match YOUR authenticated username via kubectl
  templateRef: ubuntu-desktop
```

```sh
kubectl apply -f workspace.yaml
kubectl get workspace -n waas -w
```

The workspace goes `Pending → Provisioning → Running`. The `READY`
column flips once the desktop actually accepts connections on its
protocol port (the operator probes it — pod readiness alone is not
enough).

## 4. Connect from the browser

Open the portal, click the workspace card — the desktop opens in the
browser tab over a WebSocket session. The proxy validates your JWT
before any connection to guacd is made; the desktop password never
reaches the browser.

![Placeholder — VNC session open in the browser](/img/placeholders/session-vnc.png)

{/* TODO(image): capture d'une session VNC XFCE ouverte dans le navigateur (overlay WaaS visible) */}

## 5. Everyday operations

| Action | Portal | kubectl |
|---|---|---|
| Pause (free compute, keep home) | card menu → Pause | `kubectl patch workspace <name> --type=merge -p '{"spec":{"paused":true}}'` |
| Resume | card menu → Resume | same with `"paused":false` |
| Delete (home volume kept by default) | card menu → Delete | `kubectl delete workspace <name>` |
| Inspect status and events | card → Events panel | `kubectl describe workspace <name>` |

## Where to go next

- [Installation](installation/) — the Helm values that matter, upgrades.
- [Concepts](concepts/) — lifecycle, templates, policies, placement, volumes.
- [Using the CRDs](guides/using-the-crds) — kubectl/ArgoCD/Flux patterns,
  more examples.
- [Workspace images](images/) — what runs inside a Linux workspace, and
  [how to build your own image](images/build-your-own).
