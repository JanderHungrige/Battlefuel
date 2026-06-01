# BattleFuel developer tasks. Run `make` or `make help` to list targets.

.DEFAULT_GOAL := help
.PHONY: help dev stop setup migrate seed test test-backend test-frontend lint clean

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

seed: ## Generate tiles + place demo units (idempotent)
	cd backend && .venv/bin/python scripts/generate_tiles.py && .venv/bin/python scripts/seed_unit_instances.py

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
