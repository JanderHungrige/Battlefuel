# BattleFuel Server Setup — Step by Step (for dummies)

This walks you from a **blank Ubuntu VPS** to a **running, auto-deploying BattleFuel** at
`https://battlefuel.jeanquestenterprise.de` (prod) and `https://battlefuel-dev.jeanquestenterprise.de`
(dev). No prior Docker knowledge assumed — copy/paste each block and check the ✅ checkpoints.

> **The single most-forgotten step is #7 (Bootstrap).** If you skip it you'll see the map but
> **no units / no chatter / empty panels** — because the database is empty.

---

## 0. What you're building (the big picture)

```
  You merge to GitHub  ─┐
       (main / dev)     │  GitHub Actions builds Docker images, pushes them to GHCR
                        ▼
                 ghcr.io/janderhungrige/battlefuel-{backend,frontend,db}:{main,dev}
                        │
        (every minute)  │  a cron on the VPS pulls new images
                        ▼
   VPS 159.195.148.193 ── prod stack on :3000  ── dev stack on :3001
        (Docker)              │                        │
                              └── Nginx Proxy Manager (TLS) ──┐
                                                              ▼
   battlefuel.jeanquestenterprise.de  /  battlefuel-dev.jeanquestenterprise.de
```

- **Each stack** = 3 containers: `db` (Postgres+PostGIS), `backend` (FastAPI), `frontend`
  (nginx serving the app **and** proxying `/api/v1` to the backend). The frontend is the only
  thing exposed — on a plain HTTP port (3000 or 3001).
- **NPM** (which you already run) adds HTTPS and maps each domain to a port.
- **No Watchtower** — auto-deploy is a tiny cron script using the host's own Docker.

---

## 1. Prerequisites (have these ready)

- A VPS (netcup) running **Ubuntu**, with root SSH access.
- Two DNS **A records** pointing at the VPS IP `159.195.148.193`:
  - `battlefuel.jeanquestenterprise.de`
  - `battlefuel-dev.jeanquestenterprise.de`
- A **GitHub Personal Access Token (classic)** with the **`read:packages`** scope (to pull the
  private images). Make it at https://github.com/settings/tokens.
- **Nginx Proxy Manager** already installed and reachable (you have this).
- The repo's seed map files on your **dev machine** (they're not in git):
  `data/hohenfels.osm` and `data/hohenfels-roads.osm`.

---

## 2. Install Docker (on the VPS)

SSH in (`ssh root@159.195.148.193`), then:

```bash
curl -fsSL https://get.docker.com | sh
docker --version            # ✅ should print Docker version 24+ (we use the built-in BuildKit)
docker compose version      # ✅ should print Compose v2.x
```

---

## 3. Log in to GHCR so the VPS can pull the images (on the VPS)

```bash
# paste your read:packages PAT when prompted (NOT your GitHub password)
echo "PASTE_YOUR_PAT_HERE" | docker login ghcr.io -u JanderHungrige --password-stdin
ls -l /root/.docker/config.json   # ✅ must be a FILE (not a directory)
```

> If `config.json` is ever a *directory*, delete it (`rm -rf /root/.docker/config.json`) and
> run the `docker login` again.

---

## 4. Get the code + seed data onto the VPS

**On the VPS** — clone the repo (use your PAT if it asks for a password):

```bash
git clone https://github.com/JanderHungrige/Battlefuel.git /opt/battlefuel
cd /opt/battlefuel
mkdir -p data data-prod/pgdata data-dev/pgdata
```

**On your dev machine** (the laptop with the repo) — copy the two map files the VPS can't get
from git:

```bash
rsync -av data/hohenfels.osm data/hohenfels-roads.osm root@159.195.148.193:/opt/battlefuel/data/
```

✅ Back on the VPS, confirm both files arrived:
```bash
ls -lh /opt/battlefuel/data/hohenfels.osm /opt/battlefuel/data/hohenfels-roads.osm
```

---

## 5. Create the config files (on the VPS)

```bash
cd /opt/battlefuel
cp deploy/.env.prod.example deploy/.env.prod
cp deploy/.env.dev.example  deploy/.env.dev
```

Edit **both** files (`nano deploy/.env.prod`, then `nano deploy/.env.dev`) and set a **strong
DB password**. In each file change these two lines so the password matches:

```
BATTLEFUEL_DB_PASSWORD=<a-strong-password>
BATTLEFUEL_DATABASE_URL=postgresql+asyncpg://battlefuel:<the-same-password>@db:5432/battlefuel
```

Use a **different** password for prod vs dev. Everything else in the templates is fine as-is.
These files are gitignored — they never leave the server.

---

## 6. Start both stacks (on the VPS)

```bash
cd /opt/battlefuel
docker compose --env-file deploy/.env.prod -f deploy/compose.app.yml up -d
docker compose --env-file deploy/.env.dev  -f deploy/compose.app.yml up -d
```

✅ Check everything is healthy (give the DB ~20s the first time):
```bash
docker compose --env-file deploy/.env.prod -f deploy/compose.app.yml ps
docker compose --env-file deploy/.env.dev  -f deploy/compose.app.yml ps
```
Each should show `db`, `backend`, `frontend` as **Up** (db `healthy`).

✅ The API is reachable locally (returns `{"status":"ok"}`):
```bash
curl -s http://localhost:3000/api/v1/health    # prod
curl -s http://localhost:3001/api/v1/health    # dev
```

> At this point the app loads but is **empty** (no units/tiles). That's expected until step 7.

---

## 7. Seed the databases — THE STEP EVERYONE FORGETS ⚠️

This imports the map geometry, places units/depots, and builds the routing graph. Run it
**once per stack** (it's safe to re-run; it skips work already done):

```bash
cd /opt/battlefuel
COMPOSE_FILE=deploy/compose.app.yml BATTLEFUEL_ENV_FILE=deploy/.env.prod bash scripts/prod-bootstrap.sh
COMPOSE_FILE=deploy/compose.app.yml BATTLEFUEL_ENV_FILE=deploy/.env.dev  bash scripts/prod-bootstrap.sh
```

✅ Each run should end with `Bootstrap complete.` and mention ~2683 ways annotated.

✅ Confirm data is now present (no longer empty):
```bash
curl -s http://localhost:3000/api/v1/unit-instances | head -c 200    # should list units, not []
```

> If you see `relation "osm_multipolygons" does not exist` or a "file not found" error, the
> seed `.osm` files (step 4) aren't on the VPS — fix that and re-run.

---

## 8. Turn on auto-deploy + nightly backups (on the VPS)

```bash
cd /opt/battlefuel
chmod +x deploy/auto-deploy.sh
crontab deploy/crontab.example     # ⚠ replaces your whole crontab; if you have other jobs,
                                   #   run `crontab -e` and paste the 3 lines instead
crontab -l                         # ✅ shows 2 auto-deploy lines + 1 nightly backup line
```

From now on: a push to `main` redeploys **prod** and a push to `dev-deployment` redeploys
**dev**, automatically, within ~1 minute (the cron pulls the new image and restarts only the
changed service).

---

## 9. Point the domains at the stacks (in Nginx Proxy Manager)

In the NPM web UI, add **two Proxy Hosts**:

| Domain | Forward Hostname / IP | Forward Port | Websockets Support | SSL |
|--------|-----------------------|--------------|--------------------|-----|
| `battlefuel.jeanquestenterprise.de` | `159.195.148.193` | `3000` | **ON** | request a cert (Let's Encrypt) |
| `battlefuel-dev.jeanquestenterprise.de` | `159.195.148.193` | `3001` | **ON** | request a cert |

> **Websockets Support must be ON** — the live sim clock, unit movement, and the Chatter panel
> all use a WebSocket. With it off you'd see units but no chatter/movement.

---

## 10. Final check ✅

Open `https://battlefuel.jeanquestenterprise.de` in a browser. You should see:
- the map **with the hex grid and units**,
- the Chatter panel **filling with messages** over time,
- units moving when you issue orders.

Quick command-line confirmation:
```bash
curl -s https://battlefuel.jeanquestenterprise.de/api/v1/unit-instances | head -c 120   # not []
```

Done. 🎉

---

## Day-2 operations (cheat sheet)

**Deploy a change:** just merge to `main` (prod) or push to `dev-deployment` (dev). Wait ~1–2
min for GitHub Actions to build and the cron to pull. Watch it:
```bash
tail -f /var/log/battlefuel-deploy-prod.log
```

**See logs:**
```bash
cd /opt/battlefuel
docker compose --env-file deploy/.env.prod -f deploy/compose.app.yml logs -f --tail=100 backend
```

**Manual backup now:**
```bash
cd /opt/battlefuel
COMPOSE_FILE=deploy/compose.app.yml BATTLEFUEL_ENV_FILE=deploy/.env.prod bash scripts/backup.sh
```

**Restore from a backup:**
```bash
cd /opt/battlefuel
COMPOSE_FILE=deploy/compose.app.yml BATTLEFUEL_ENV_FILE=deploy/.env.prod \
  bash scripts/restore.sh /opt/battlefuel/data-prod/backups/battlefuel-<timestamp>.sql.gz
```

**Roll back to a previous build:** every CI build is tagged with its commit SHA. On the VPS,
set `IMAGE_TAG=<good-sha>` in `deploy/.env.prod`, then:
```bash
docker compose --env-file deploy/.env.prod -f deploy/compose.app.yml up -d backend frontend
```
Then revert the bad commit on `main` so the cron doesn't re-pull the broken `:main`.

**Pause auto-deploy:** `crontab -e` and comment out the two `auto-deploy.sh` lines.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Map shows but **no units / no chatter / empty panels** | DB not seeded | Run **step 7** (bootstrap) |
| `osm_multipolygons does not exist` during bootstrap | seed `.osm` files missing on VPS | redo **step 4** rsync, re-run step 7 |
| Units show but **no chatter / no movement** | NPM Websockets Support off | turn it **ON** for both proxy hosts (step 9) |
| `docker login`/pull says `denied` | PAT missing `read:packages`, or `config.json` is a dir | recreate PAT / `rm` the dir, redo **step 3** |
| Site won't load at all | DNS / NPM / firewall | check A records → `159.195.148.193`; `curl http://localhost:3000/` on the VPS = 200? |
| `client version 1.25 is too old` | (old Watchtower — no longer used) | ensure you're on the current `compose.app.yml` (no `watchtower` service); `git pull` |

For the full reference, see `.mdd/ops/cicd-deploy-159.md`.
