---
sidebar_position: 2
title: Configuration
description: The Helm values that matter — ingress, SSO, database, policies, placement, metrics.
---

# Configuration

The full value list is generated into the chart's own
[README](https://github.com/XoRHub/waas/blob/main/helm/waas/README.md)
by helm-docs, and every value is documented inline in `values.yaml`.
This page walks through the groups you will actually touch.

## Ingress / routing

```yaml
ingress:
  enabled: true
  host: waas.example.com
  className: ""            # empty = cluster default
  tls:
    enabled: true
    issuerRef:
      kind: ClusterIssuer
      name: letsencrypt
```

Prefer Gateway API? Set `httpRoute.enabled: true` with your
`parentRefs`; hostnames default to `ingress.host`.

guacd is **never** routed by either — it stays ClusterIP-only, reached
exclusively through the wwt proxy after JWT validation.

## Authentication (OIDC SSO)

Local accounts work out of the box (bootstrap `admin` +
admin-created users). For SSO:

```yaml
apiServer:
  oidc:
    issuerURL: https://idp.example.com/realms/main
    clientID: waas
    clientSecretRef: { name: waas-oidc, key: client-secret }
    redirectURL: https://waas.example.com/api/v1/auth/oidc/callback
    groupsClaim: groups
    adminGroups: [platform-admins]   # IdP groups granted the admin role
    disableLocalLogin: false
```

Notes worth knowing:

- The IdP's `groups` claim is mirrored at **every** SSO login and is
  what [`WorkspacePolicy` subjects](../concepts/governance) match
  against.
- `disableLocalLogin: true` disables username/password for **everyone,
  bootstrap admin included** — the api-server refuses to start if OIDC
  is not configured at the same time (a typo can never lock everyone
  out silently). Break-glass is redeploying without the flag.
- Set `adminGroups` together with `disableLocalLogin`, otherwise no
  account can ever reach the admin role through SSO.

## Database

The chart bundles PostgreSQL 17 for convenience. For production, bring
your own:

```yaml
postgres:
  enabled: false
  externalURLSecretRef: { name: waas-db, key: database-url }
```

## Workspace placement

Where workspace **workloads** (pods, services, home PVCs) land — the
CRs themselves stay in the platform namespace:

```yaml
workspaces:
  namespace: ""                        # CR namespace; empty = release namespace
  defaultNamespacePattern: "waas-{user}"   # workload namespace pattern
```

The pattern accepts `{user}`, `{workspace}`, `{templateName}` and
`{os}` placeholders; an invalid pattern makes the operator and
api-server **refuse to start** rather than silently fall back. Details
and the precedence chain: [Placement](../concepts/placement).

## Bootstrap policies and catalogs

```yaml
defaultPolicy:
  enabled: true          # catch-all policy, priority 0 — see values.yaml
adminPolicy:
  enabled: false         # explicit all-rights policy for admins (off by default)
catalogs:
  waasImages: { enabled: true }    # official XorHub images (docker.io/xorhub)
  kasm: { enabled: false }         # upstream kasmweb images (KasmVNC)
```

Doctrine: these bootstrap CRs exist so a fresh install works without a
GitOps repo. Once `gitops/`-managed policies and images take over,
disable the matching flag — never run both for the same object name.

## Observability

```yaml
metrics:
  enabled: true                    # /metrics on every component (cluster-internal)
  serviceMonitor: { enabled: true }  # api-server + wwt (prometheus-operator)
  podMonitor: { enabled: true }      # operator
grafana:
  dashboards: { enabled: true }      # bundled dashboards (configmap or operator mode)
```

## Sizing knobs

Every component exposes `replicas`, `resources`,
`deploymentLabels/Annotations` and `podLabels/Annotations`
(`operator.*`, `apiServer.*`, `wwt.*`, `frontend.*`, `guacd.*`,
`postgres.*`). Session-related tunables live under `apiServer.*`
(`accessTokenTTL`, `connectionTokenTTL`, `eventsPollInterval`,
`catalogSyncInterval`).
