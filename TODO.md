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

## Deferred from BattleFuel v2 (initiative battlefuel-v2)

- [ ] **Landing-page login / authentication** — deferred 2026-06-02. Wave 8 ships the landing
  page + data-integration guide without auth; add a "fun login" / real authentication later
  (app is currently single-user, no auth). See `.mdd/initiatives/battlefuel-v2.md`.
- [ ] **MGRS-native tile inspection (retire the hex tile from the UX)** — deferred 2026-06-03
  (raised during Wave 3 review). Wave 2 made MGRS the default *grid* and hides the hex layers,
  but the **data/inspect layer is still H3**: clicking the map resolves to an H3 cell and the
  inspect window shows hex-tile attributes. Make inspection MGRS-cell-native and drop the hex
  tile from the operator UX. Touches the tile panel, map click-resolution, and the tile model —
  scope as its own wave/task, not a Wave-3 add-on. (Wave 3's combat-square highlight now clears
  on closing the inspect window / map-background click, so the immediate UX bug is resolved.)
