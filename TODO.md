# BattleFuel — TODO / Deferred Work

Items intentionally kept out of the current scope, captured so they aren't lost.

## Deferred from Wave 7 (Deployment)

Wave 7 ships **Standard** scope: Dockerized stack + Compose, OpenTofu-provisioned
Hetzner Cloud host, TLS/domain, persistent Postgres+PostGIS volume with backups,
**scripted manual deploy**. The following were explicitly deferred:

- [ ] **CI/CD auto-deploy pipeline** — GitHub Actions workflow that builds images,
  runs OpenTofu, and deploys on push/tag (gated by a manual approval step so it
  still honours the "never auto-deploy without explicit yes" rule). Likely a future
  wave or post-MVP milestone. Builds on Wave 7's scripted deploy targets.
- [ ] **Health/uptime monitoring + alerting** — container/host health checks,
  uptime monitoring, and alert routing (e.g. on deploy failure or service down).

> Source: Wave 7 planning (`/mdd plan-wave battlefuel-wave-7`, 2026-06-02).
> When ready, fold these into a new wave/milestone rather than bolting onto Wave 7.
