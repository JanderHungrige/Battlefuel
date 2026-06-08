# BattleFuel developer tasks. Run `make` or `make help` to list targets.

.DEFAULT_GOAL := help
.PHONY: help dev stop setup migrate seed test test-backend test-frontend lint clean \
        provision deploy prod-bootstrap backup restore prod-logs prod-down

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*## "}{printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

dev: ## Start the whole stack (db + backend + frontend); Ctrl+C to stop
	@bash scripts/dev.sh

stop: ## Stop the database container (backend/frontend stop with Ctrl+C)
	@docker compose stop db

setup: ## First-time setup: Python venv + deps, frontend deps
	python3 -m venv backend/.venv && cd backend && .venv/bin/python -m pip install -e ".[dev]"
	cd frontend && npm install

migrate: ## Apply database migrations
	cd backend && .venv/bin/alembic upgrade head

seed: ## Generate tiles + frontline threats + place demo units + fuel depots (idempotent)
	cd backend && .venv/bin/python scripts/generate_tiles.py && .venv/bin/python scripts/seed_threats.py && .venv/bin/python scripts/seed_unit_instances.py && .venv/bin/python scripts/seed_supply.py

test: test-backend test-frontend ## Run all tests

test-backend: ## Run backend tests (pytest)
	cd backend && .venv/bin/pytest

test-frontend: ## Run frontend tests (vitest)
	cd frontend && npm test

lint: ## Lint + type-check backend and frontend
	cd backend && .venv/bin/ruff check . && .venv/bin/mypy app
	cd frontend && npm run lint

clean: ## Stop and remove the database container + volume (DESTROYS data)
	docker compose down -v

# --- Production / deployment (Wave 7) -----------------------------------------------------

provision: ## Provision the Hetzner host with OpenTofu (tofu apply in infra/)
	cd infra && tofu init && tofu apply

deploy: ## Deploy the stack to the provisioned host (explicit; never auto-runs)
	@bash scripts/deploy.sh

prod-bootstrap: ## One-time data bootstrap on the prod stack (migrate + seed + routing graph)
	@bash scripts/prod-bootstrap.sh

reseed-stack: ## Reseed a DEPLOYED stack's DB to the canonical scenario (host): make reseed-stack ENV=deploy/.env.dev
	@bash deploy/reseed-stack.sh "$(ENV)"

backup: ## Run an on-demand production DB backup (pg_dump + retention)
	@bash scripts/backup.sh

restore: ## Restore the prod DB from a dump: make restore FILE=/path/to/backup.sql.gz
	@bash scripts/restore.sh "$(FILE)"

prod-logs: ## Tail logs of the production stack
	docker compose -f compose.prod.yml --env-file .env logs -f --tail=100

prod-down: ## Stop the production stack (data volume preserved)
	docker compose -f compose.prod.yml --env-file .env down
