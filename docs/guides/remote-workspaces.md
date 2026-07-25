---
sidebar_position: 3
title: Remote workspaces
description: Connect to machines outside the cluster through the same browser session flow.
---

# Remote workspaces

Distinct from provisioned workspaces: an authorized user registers
machines **external to the cluster** (hostname, port, protocol,
credentials) and connects to them through the same browser → proxy →
guacd chain. Nothing is provisioned — the machine's lifecycle is
managed elsewhere.

- Protocols: `ssh`, `vnc`, `rdp` (KasmVNC is refused — it has no
  meaning for an external machine).
- **Opt-in via policy, fail-closed**: `spec.remoteWorkspaces: true` on
  a [`WorkspacePolicy`](../reference/crds/workspacepolicy). Without it
  the feature is invisible in the portal and refused by the API.
  Platform admins always have it.
- **Credentials are write-only**: sent at registration, stored in a
  per-entry Kubernetes Secret, resolved server-side at connect time,
  never returned by the API. Each entry is strictly private to its
  creator — even admins cannot see another user's remotes or
  credentials.
- Clipboard policies apply to remote sessions exactly as to provisioned
  ones.

## Targets the api-server refuses

A "remote machine" pointed at the cluster itself would turn the feature
into a pivot into your own network, so the api-server rejects:
loopback, link-local (the cloud IMDS at `169.254.169.254` included), the
kube-apiserver ClusterIP, single-label names, `*.svc` and
`*.<cluster domain>` names, plus any CIDR listed in
`apiServer.remoteBlockedCIDRs`. Add your cluster's **pod and service
CIDRs** there — they cannot be discovered from inside a pod. The cluster
DNS domain is auto-discovered from the api-server pod's
`/etc/resolv.conf` (`cluster.local` fallback); override it with
`apiServer.clusterDomain` only if that discovery is wrong for your
cluster.

The check runs at create, update **and** connect, so entries registered
before the guard existed are covered too. Two deliberate
non-restrictions:

- **RFC1918 addresses stay allowed** — a legitimate remote machine
  commonly sits on a private LAN reached over VPN or peering. That is
  also why `remoteBlockedCIDRs` does not default to those ranges.
- **A hostname that fails to resolve stays allowed** — registering a
  machine that is off, or behind DNS the api-server cannot see, must
  keep working.

:::warning Guardrail, not a security boundary
guacd re-resolves the name when it dials, so DNS rebinding bypasses the
check. The structural answer is an egress NetworkPolicy on the platform
pods (guacd/wwt), which does not exist yet.
:::

## Wake-on-LAN

A remote machine with a registered MAC address can be woken from the
portal — manually ("Wake" button) or automatically when opening a
machine that turns out to be off (one WoL attempt, ~20 s boot grace,
then reconnect).

A cluster pod cannot broadcast on the target's physical L2 network, so
the magic packet is **delegated to an external relay** on the target's
LAN, which the api-server calls over HTTP
(`apiServer.wol.relayURL` + optional bearer token). One relay per
site/VLAN in multi-site setups.

## Network prerequisite

guacd must be able to **egress** to the target machines — adapt your
NetworkPolicies if you restrict egress (the example policy shipped with
waas-images only covers in-cluster traffic).
