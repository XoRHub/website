---
sidebar_position: 4
title: Try WaaS locally
description: Spin up a throwaway k3d cluster with WaaS fully deployed, in one command.
---

# Try WaaS locally

No cluster at hand? The waas repository ships a one-command local
environment based on [k3d](https://k3d.io) (k3s in Docker). This is the
same environment the developers use, but it is also the fastest way to
**evaluate** WaaS on a laptop.

:::warning
This path builds the platform images locally from source — it is an
evaluation/development setup, not an install method. For a real
cluster, use the [Helm chart](./index.md).
:::

## Prerequisites

- Docker
- [mise](https://mise.jdx.dev/) — installs every pinned tool
  (Go, Node, Helm, k3d, …) at the exact versions the project's CI uses

## Bootstrap

```sh
git clone https://github.com/XoRHub/waas && cd waas
# The desktop images are expected as a sibling checkout:
git clone https://github.com/XoRHub/waas-images ../waas-images

mise install          # every pinned tool
make dev-bootstrap    # creates the k3d cluster, builds and imports every
                      # image, deploys the chart, seeds the dev catalog
```

`make dev-bootstrap` prints the portal URL and credentials at the end.
The sibling checkout path can be overridden with `WAAS_IMAGES_DIR`.

## Day-2 commands

```sh
make dev-reload       # rebuild + redeploy services/frontend after changes
make dev-reload-all   # also rebuilds the desktop images
make smoke            # validates real per-protocol sessions end to end
make dev-down         # tears the cluster down
```

From here, the [Quickstart](../quickstart) applies unchanged — create a
template, create a workspace, connect from the browser.
