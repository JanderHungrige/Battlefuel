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
- [ ] **Backend MGRS-cell data layer / `GET /api/v1/mgrs-cells` endpoint** — deferred 2026-06-03
  from v2 Wave 9 (the "Hybrid" backend step). Read-only server-side MGRS-cell aggregation mirroring
  the frontend `aggregateCell` rule (`frontend/src/map/cellSituation.ts`), threat-first, as the seed
  of an authoritative MGRS data layer. Needs a server-side UTM/MGRS dep (`utm`/`pyproj`) or a PostGIS
  `ST_Transform` query. Not on the inspection critical path (W9 aggregates client-side). Fold into the
  data-migration wave (and reconcile with the hex→MGRS data move below).
- [~] **MGRS-native tile inspection (retire the hex tile from the UX)** — IN PROGRESS as **v2 Wave 9**
  (`battlefuel-v2-wave-9`). The UX + client-side inspection (click→MGRS cell, aggregated panel, no
  hex vocabulary) is being built now; only the **backend data-model migration** part is deferred (see
  the `/api/v1/mgrs-cells` entry above). Original note: Wave 2 made MGRS the default grid; the data
  layer was still H3 and the inspect window showed hex attributes.
