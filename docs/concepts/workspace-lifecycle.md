---
sidebar_position: 2
title: Workspace lifecycle
description: Phases, conditions, pause and resume, scheduled uptime/downtime.
---

# Workspace lifecycle

## Phases

The `Workspace` resource surfaces a coarse phase — shown on the portal
cards and by `kubectl get workspace`:

| Phase | Meaning | Compute |
|---|---|---|
| `Pending` | accepted, not yet reconciled | none |
| `Provisioning` | starting up, not ready | scaling up |
| `Running` | desktop up and reachable | 1 replica, ready |
| `Paused` | **user** paused it manually | scaled to 0 |
| `Stopped` | **scheduled** downtime window | scaled to 0 |
| `Failed` | admission/governance denial or crash | none/blocked |
| `Terminating` | being deleted | tearing down |

`Paused` and `Stopped` share the same scale-to-0 mechanism; they only
differ in *why* the desktop is down (manual vs schedule), so the UI can
offer the right action (resume vs "next uptime at …").

## Conditions

`status.conditions` follow the standard Kubernetes convention:

| Type | True when |
|---|---|
| `Ready` | the workload reports ready — carries admission denial reasons (`ImageNotInCatalog`, `QuotaExceeded`, …) when it is `False` |
| `ConnectionReady` | the desktop server **accepts TCP connections** on the default protocol port. Pod readiness proves the container runs; this proves the desktop actually listens. |

The operator also emits Kubernetes **Events** on the Workspace at every
phase transition and admission decision. The portal aggregates them
with the children's events in the workspace's Events panel.

## Pause = scale to 0, not delete

Pausing a workspace scales its workload to 0 replicas — it does **not**
delete anything. Resume is a scale back to 1: fast, no reconstruction,
no re-admission. The home volume is retained in every case.

- **Deployment / StatefulSet**: `spec.replicas` patched 0 ⇄ 1 in place.
- **Bare Pod** (legacy workload kind): deleted on pause, recreated from
  the same home PVC on resume — equivalent for the user, state lives on
  the PVC.
- **Windows / KubeVirt VM**: `spec.running` toggled; the VM object and
  its disks are kept.

While paused, `status.address/port/protocol` are cleared and `Ready` is
`False` with reason `Paused`.

## Scheduled uptime / downtime

A template can plan start/stop by cron to cap resource use:

```yaml
spec:
  schedule:
    timezone: Europe/Paris        # IANA name, REQUIRED when crons are set
    uptime:   ["0 8 * * 1-5"]     # start weekdays at 08:00
    downtime: ["0 20 * * *"]      # stop every day at 20:00
```

- Standard 5-field cron, evaluated in the template's **explicit**
  timezone — never the controller's own.
- Scheduled downtime uses the pause mechanism; the phase reads
  `Stopped` (scheduled) rather than `Paused` (manual).
- Like any template option, the schedule can be delegated to workspace
  creators via `overrides.allowedFields: [schedule]`.
- `status.nextTransition` carries the next change; the portal card
  shows it ("⏰ next stop …").

### When a manual action meets the schedule

A manual pause/resume **wins until the next scheduled edge of the
opposite kind**, then the schedule regains control:

- Manual **resume** during a downtime window → stays up until the next
  scheduled **stop** (wake it after hours, it runs the evening, stops on
  schedule).
- Manual **pause** during an uptime window → stays down until the next
  scheduled **start** ("done for today", back tomorrow morning).

With no schedule, `spec.paused` is the only signal — pure manual
pause/resume.

## Applying config changes to a running workspace

A workspace whose configuration changed while it runs (template edit,
or a runtime override update through the portal/API) normally picks the
new shape up at its next scale-up boundary — the next resume. The
portal shows a clickable **"update pending"** badge that forces that
boundary immediately: the operator applies the pending pod template
mid-session (the old pod stops before the new one starts) and emits a
`WorkloadReloaded` event. A reload is not a pause/resume — it never
shifts the schedule arbitration above.
