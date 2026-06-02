---
id: 40-opentofu-hetzner
title: OpenTofu — Hetzner Cloud Infrastructure as Code
edition: MDD
initiative: battlefuel
wave: battlefuel-wave-7
wave_status: active
depends_on: []
relates: [38-production-stack, 39-db-persistence-backups, 41-deploy-runbook]
source_files:
  - infra/versions.tf
  - infra/variables.tf
  - infra/main.tf
  - infra/outputs.tf
  - infra/cloud-init.yaml.tftpl
  - infra/terraform.tfvars.example
  - infra/.gitignore
  - infra/README.md
routes: []
models: []
test_files: []
data_flow: greenfield
last_synced: 2026-06-02
status: complete
phase: all
mdd_version: 11
tags: [opentofu, terraform, hetzner, hcloud, infrastructure, cloud-init, iac, firewall, block-volume, floating-ip]
path: Deploy/Infra
integration_contracts: []
satisfies_contracts:
  - from: 39-db-persistence-backups
    function: "block volume mounted at /mnt/battlefuel-data with pgdata/ + backups/ created"
    when: "cloud-init formats+mounts the hcloud_volume and mkdir -p the data dirs the compose stack binds to."
    status: done
    verified_at: "infra/cloud-init.yaml.tftpl"
  - from: 41-deploy-runbook
    function: "provisioned host + outputs (floating_ipv4, ssh_command) for the deploy script"
    when: "deploy runs `tofu apply` then ships the stack to the host IP."
    status: pending
    verified_at: ""
known_issues:
  - "`tofu apply` against real Hetzner needs a valid token + DNS and was not run here; config was verified with `tofu init`/`validate`/`fmt`, and apply happens at deploy time (feature 41)."
  - "State is local by default and may contain sensitive values — gitignored; remote backend is a commented stub in versions.tf."
  - "ssh_admin_cidr defaults to 0.0.0.0/0 — lock to your IP in secrets.auto.tfvars."
security_read_sites: []
sister_projects: []
---

# 40 — OpenTofu — Hetzner Cloud Infrastructure as Code

## Purpose
Provision, reproducibly and from code, the host the production stack runs on — so the
deployment target is recreatable and the "Docker → Hetzner via OpenTofu" demo-state is real.

## What was built (`infra/`)
- **`versions.tf`** — OpenTofu `>= 1.6`, `hetznercloud/hcloud ~> 1.49`; `hcloud` provider
  reads `var.hcloud_token`. Local state by default with a documented remote-backend stub.
- **`variables.tf`** — `hcloud_token` (sensitive), `name`, `location`, `server_type`
  (default `cpx31` amd64), `image` (`ubuntu-24.04`), `ssh_public_key`, `ssh_admin_cidr`,
  `volume_size` (20 GB), `domain`.
- **`main.tf`** — the resources:
  - `hcloud_ssh_key` — host access key.
  - `hcloud_firewall` (+ attachment) — **only** SSH (locked to `ssh_admin_cidr`) and public
    80/443 (for Caddy + ACME).
  - `hcloud_volume` (ext4) + `hcloud_volume_attachment` (automount off — cloud-init mounts).
  - `hcloud_server` with `user_data` from the cloud-init template.
  - `hcloud_floating_ip` (+ assignment) — stable ingress IP for the domain's A record.
- **`cloud-init.yaml.tftpl`** — installs Docker + compose plugin, formats (first boot only)
  and mounts the block volume at **`/mnt/battlefuel-data`** (via `/etc/fstab`, `nofail`), and
  creates `pgdata/`, `backups/`, and `/opt/battlefuel` — matching `BATTLEFUEL_DB_DATA_DIR` /
  `BATTLEFUEL_BACKUP_DIR` from feature 39.
- **`outputs.tf`** — `server_ipv4`, `floating_ipv4`, `volume_device`, `ssh_command`.
- **`terraform.tfvars.example`** — template for `secrets.auto.tfvars` (gitignored).
- **`infra/.gitignore`** — ignores `.terraform/`, state, and `*.auto.tfvars` (keeps the
  example).
- **`README.md`** — init/plan/apply usage + state/secrets notes.

## Key decisions
- **Floating IP** so the public address is stable across server rebuilds.
- **Volume mounted by cloud-init** (automount off) so the mount point + data dirs are created
  deterministically before the stack starts.
- **amd64 default** (`cpx31`) for dependable `ortools`/PostGIS wheels (arm64 is cheaper but
  needs wheel verification — open research).
- **Secrets only in `*.auto.tfvars`** (gitignored), never in git or OpenTofu-tracked files
  beyond local state.

## How it was verified
- **`tofu fmt -check`** → clean; **`tofu init -backend=false`** → providers resolve
  (`hcloud ~> 1.49`); **`tofu validate`** → *"The configuration is valid"* (checks resource
  schemas against the real hcloud provider).
- `templatefile` var (`volume_device`) consistent between `main.tf` and the cloud-init template.
- `tofu apply` against live Hetzner runs at deploy time (feature 41) with a real token + DNS.

## Follow-ups / deferred
- Optional Hetzner-DNS-managed records (currently DNS is manual) — open research.
- Remote state backend for multi-operator safety.
