---
sidebar_position: 2
title: Example manifests
description: Minimal and advanced YAML for each CRD, ready to adapt.
---

# Example manifests

All examples assume the platform namespace is `waas`. Start minimal;
every field is documented in the [CRD reference](../reference/crds/).

## Workspace — minimal

```yaml
apiVersion: waas.xorhub.io/v1alpha1
kind: Workspace
metadata:
  name: alice-ubuntu
  namespace: waas
spec:
  owner: alice                # your authenticated username
  templateRef: ubuntu-desktop
```

## Workspace — with overrides

Every override must be delegated by the template **and** allowed by
your policy (`overrides.allowedFields`), or admission denies it:

```yaml
apiVersion: waas.xorhub.io/v1alpha1
kind: Workspace
metadata:
  name: alice-dev
  namespace: waas
spec:
  owner: alice
  templateRef: devtools
  displayName: "Dev box — project X"
  resources:                       # needs "resources" delegated
    requests: { cpu: "1", memory: 2Gi }
    limits: { cpu: "4", memory: 8Gi }
  overrides:
    env:                           # needs "env"; merged by name, workspace wins
      - name: TZ
        value: Europe/Paris
    nodeSelector:                  # needs "nodeSelector"
      kubernetes.io/arch: amd64
```

## Workspace — reusing a retained home volume

```yaml
spec:
  owner: alice
  templateRef: ubuntu-desktop
  homeVolumeName: alice-old-desktop-home   # same owner, same target namespace
```

## WorkspaceTemplate — minimal

```yaml
apiVersion: waas.xorhub.io/v1alpha1
kind: WorkspaceTemplate
metadata:
  name: ubuntu-desktop
  namespace: waas
spec:
  displayName: "Ubuntu 24.04 — XFCE Desktop"
  os: linux
  image: docker.io/xorhub/ubuntu-desktop-noble:2.0.1
  port: 5901
  homeSize: 10Gi
  resources:
    requests: { cpu: 500m, memory: 1Gi }
    limits: { cpu: "2", memory: 4Gi }
```

## WorkspaceTemplate — multi-protocol with schedule and overrides

```yaml
apiVersion: waas.xorhub.io/v1alpha1
kind: WorkspaceTemplate
metadata:
  name: ubuntu-desktop-full
  namespace: waas
spec:
  displayName: "Ubuntu 24.04 — VNC + RDP + SSH"
  os: linux
  image: docker.io/xorhub/ubuntu-desktop-noble:2.0.1
  homeSize: 20Gi
  resources:
    requests: { cpu: 500m, memory: 1Gi }
    limits: { cpu: "2", memory: 4Gi }
  protocols:
    - name: vnc
      port: 5901
      default: true
      exposeAudioPort: true          # PulseAudio :4713 for enable-audio
      params:
        color-depth: "24"
      userParams: [cat:display, cat:audio]
    - name: rdp
      port: 3389
    - name: ssh                      # keypair auto-generated per workspace
      port: 2222
  env:
    - name: WAAS_VNC_RESOLUTION
      value: "1920x1080"
    - name: WAAS_RDP_ENABLED
      value: "1"
  schedule:
    timezone: Europe/Paris
    uptime: ["0 8 * * 1-5"]
    downtime: ["0 20 * * *"]
  overrides:
    allowedFields: [env, resources, protocol, protocolParams, schedule]
```

## WorkspaceTemplate — explicit credentials from a Secret

```yaml
apiVersion: waas.xorhub.io/v1alpha1
kind: WorkspaceTemplate
metadata:
  name: ubuntu-shared-creds
  namespace: waas
spec:
  displayName: "Ubuntu — team credentials"
  os: linux
  image: docker.io/xorhub/ubuntu-desktop-noble:2.0.1
  homeSize: 10Gi
  protocols:
    - name: vnc
      port: 5901
      credentialsSecretRef: team-desktop-creds   # keys: username/password
  env:
    - name: WAAS_DESKTOP_PASSWORD                # same Secret feeds the pod
      valueFrom:
        secretKeyRef: { name: team-desktop-creds, key: password }
```

Ship `team-desktop-creds` with External Secrets/Vault. The api-server
resolves the Secret server-side at connect time — the browser never
sees the values.

## WorkspaceImage — catalog entry

```yaml
apiVersion: waas.xorhub.io/v1alpha1
kind: WorkspaceImage
metadata:
  name: ubuntu-desktop-noble
  namespace: waas
spec:
  displayName: "Ubuntu 24.04 XFCE"
  image: docker.io/xorhub/ubuntu-desktop-noble:2.0.1   # exact ref; pin the digest
  enabled: true
  protocols: [vnc, rdp, ssh]
  architectures: [amd64, arm64]
  resources:
    default: { cpu: "1", memory: 2Gi }
    min: { cpu: 250m, memory: 512Mi }
    max: { cpu: "4", memory: 8Gi }
```

## WorkspacePolicy — a team policy

```yaml
apiVersion: waas.xorhub.io/v1alpha1
kind: WorkspacePolicy
metadata:
  name: data-team
  namespace: waas
spec:
  priority: 200                     # 100–999: group policies
  subjects:
    - kind: Group
      name: data-team               # IdP group (OIDC groups claim)
  images: [ubuntu-desktop-noble, devtools]
  limits:
    maxWorkspaces: 5
    perWorkspace: { cpu: "4", memory: 8Gi, home: 50Gi }
    aggregate: { cpu: "8", memory: 16Gi, storage: 200Gi }
  lifecycle:
    idleSuspendAfter: 4h
    maxLifetime: 720h               # 30 days — deletes home too, TTL contract
  clipboard:
    copyFromWorkspace: true
    pasteToWorkspace: false         # no pasting INTO the workspace
  overrides:
    allowedFields: [env, resources, protocolParams]
```

:::tip
Always keep a `default` policy at priority 0 — **no matching policy
means denial**, for everyone.
:::
