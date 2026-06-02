# BattleFuel — Hetzner Cloud infrastructure (OpenTofu)

Provisions the host the production stack runs on: SSH key, firewall (22 locked to your
CIDR, 80/443 public), a block volume for Postgres data + backups, a server bootstrapped
with Docker + compose via cloud-init, and a stable floating IP.

## Prerequisites
- [OpenTofu](https://opentofu.org) CLI (`tofu`)
- A Hetzner Cloud project + API token (read/write)
- An SSH keypair

## Usage
```bash
cd infra
cp terraform.tfvars.example secrets.auto.tfvars   # fill in token + ssh key (gitignored)
tofu init
tofu plan
tofu apply
```

Outputs include `floating_ipv4` (point your domain's A record here), `server_ipv4`, and an
`ssh_command`. After `apply`, deploy the app with the deploy script (see the project-root
deploy runbook / `make deploy`).

## Notes
- **State** is local by default (`terraform.tfstate`, gitignored). It can contain sensitive
  values — back it up out-of-band, or configure the remote backend stub in `versions.tf`.
- **Secrets** live only in `*.auto.tfvars` (gitignored) and never in git or the committed
  example.
- **Volume mount**: cloud-init formats (first boot only) and mounts the volume at
  `/mnt/battlefuel-data`, creating `pgdata/`, `backups/`, and `/opt/battlefuel`. These match
  `BATTLEFUEL_DB_DATA_DIR` / `BATTLEFUEL_BACKUP_DIR` in the app `.env`.
- **Arch**: defaults to amd64 (`cpx31`) — the safe target for `ortools` / PostGIS wheels.
  arm64 (`cax*`) is cheaper but verify wheel availability first (Wave-7 open research).
