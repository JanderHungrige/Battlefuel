# BattleFuel — TODO / Deferred Work

Items intentionally kept out of the current scope, captured so they aren't lost.

## Deferred from Wave 7 (Deployment)

Wave 7 ships **Standard** scope: Dockerized stack + Compose, OpenTofu-provisioned
Hetzner Cloud host, TLS/domain, persistent Postgres+PostGIS volume with backups,
**scripted manual deploy**. The following were explicitly deferred:

- [x] **CI/CD auto-deploy pipeline** — DONE (2026-06-02): GitHub Actions builds images and
  pushes to GHCR; Watchtower on `159.195.148.193` auto-deploys prod (`main`→:3000) and dev
  (`dev-deployment`→:3001), fronted by Nginx Proxy Manager for TLS. See
  `.mdd/ops/cicd-deploy-159.md` and `.mdd/docs/42-cicd-auto-deploy.md`. (Targets 159.x and
  supersedes the Wave-7 Hetzner/OpenTofu manual deploy, which stays as reference.)
- [ ] **Health/uptime monitoring + alerting** — container/host health checks,
  uptime monitoring, and alert routing (e.g. on deploy failure or service down).

> Source: Wave 7 planning (`/mdd plan-wave battlefuel-wave-7`, 2026-06-02).
> When ready, fold these into a new wave/milestone rather than bolting onto Wave 7.
