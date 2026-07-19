---
sidebar_position: 1
title: Installation
description: Install WaaS with the Helm chart — prerequisites, install, upgrade, uninstall.
---

# Installation

WaaS ships as a **single Helm chart** that installs every component:
operator, API server, WebSocket proxy (wwt), frontend, guacd and
PostgreSQL.

## Prerequisites

| Requirement | Why |
|---|---|
| Kubernetes `>= 1.26` | chart requirement |
| [cert-manager](https://cert-manager.io/docs/installation/) | issues the admission-webhook certificate and (optionally) the ingress TLS certificate. The **only** hard prerequisite. |
| KubeVirt (optional) | Windows workspaces only. Auto-detected at runtime — a Linux-only install needs nothing. |
| A default StorageClass | home volumes (PVCs) and the bundled PostgreSQL |

## Install

From the OCI registry (a chart version is published on every chart
release — the chart follows its own SemVer, independent from the app,
see `Chart.yaml`'s `version` vs `appVersion`):

```sh
helm install waas oci://ghcr.io/xorhub/waas/charts/waas \
  --namespace waas --create-namespace \
  --version <chart-version>
```

From a source checkout:

```sh
helm install waas ./helm/waas --namespace waas --create-namespace
```

Then retrieve the bootstrap admin password (unless you set
`apiServer.adminPassword` or `apiServer.adminPasswordSecretRef`):

```sh
kubectl -n waas logs deploy/waas-api-server | grep -i password
```

## Upgrade

```sh
helm upgrade waas oci://ghcr.io/xorhub/waas/charts/waas --version <chart-version>
```

CRDs are shipped with the chart. Generated secrets (JWT signing key,
internal token, PostgreSQL password) are kept across upgrades.

## Uninstall

```sh
helm uninstall waas -n waas
```

Home volumes (PVCs) are deliberately **not** deleted by an uninstall —
see [Volumes](../concepts/volumes.md) for the retention model.

## What a default install gives you

- **Ingress enabled** on `waas.example.com` (change `ingress.host`),
  TLS via your cert-manager issuer (`ingress.tls.issuerRef`). A Gateway
  API `HTTPRoute` can be used instead (`httpRoute.enabled`).
- A bundled **PostgreSQL 17** StatefulSet (`postgres.enabled: true`).
  Point `postgres.externalURL`/`externalURLSecretRef` at your own
  instance for production.
- A **default `WorkspacePolicy`** (`defaultPolicy.*`): without at least
  one policy **nobody** can create a workspace — WaaS is fail-closed by
  design. The bootstrap policy is a visible, auditable CR you can edit
  or disable once your GitOps repo defines the real ones.
- The **waas-images catalog** (`catalogs.waasImages`, on by default):
  approves the official `docker.io/xorhub` desktop images so the
  workspace picker is not empty on day one. `catalogs.kasm` (upstream
  `docker.io/kasmweb` images, experimental KasmVNC protocol — may be
  removed at any time) exists too but is off by default.

Continue with [Configuration](configuration.md) for the values worth
reviewing before a real deployment, and
[What the chart bootstraps](../admin/bootstrap-governance.md) for
exactly which rights the bootstrap policy and catalogs grant.
