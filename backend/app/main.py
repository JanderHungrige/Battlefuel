"""FastAPI application factory.

All routes live under the ``/api/v1`` prefix. Feature routers (e.g. units) are
included here; the app itself stays thin so it can be composed in tests.
"""

from __future__ import annotations

from fastapi import APIRouter, FastAPI

from app.api.units import router as units_router


def create_app() -> FastAPI:
    """Build and return the BattleFuel FastAPI application."""

    app = FastAPI(title="BattleFuel API", version="0.1.0")

    api_v1 = APIRouter(prefix="/api/v1")

    @api_v1.get("/health", tags=["meta"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    api_v1.include_router(units_router)
    app.include_router(api_v1)
    return app


app = create_app()
