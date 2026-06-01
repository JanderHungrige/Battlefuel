"""FastAPI application factory.

All routes live under the ``/api/v1`` prefix. Feature routers are included here; the app
itself stays thin so it can be composed in tests. The real-time sim loop is started only
when ``enable_sim=True`` (the production app), keeping tests free of background ticking.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.move_orders import router as move_orders_router
from app.api.obstacles import router as obstacles_router
from app.api.routes import router as routes_router
from app.api.supply import router as supply_router
from app.api.theater import router as theater_router
from app.api.tiles import router as tiles_router
from app.api.unit_instances import router as unit_instances_router
from app.api.units import router as units_router
from app.api.ws import manager
from app.api.ws import router as ws_router
from app.config import get_settings
from app.services.sim_runner import SimEngine


def create_app(enable_sim: bool = False) -> FastAPI:
    """Build the BattleFuel app. Set ``enable_sim`` to run the real-time sim loop."""

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        engine = SimEngine(manager)
        await engine.start()
        try:
            yield
        finally:
            await engine.stop()

    app = FastAPI(
        title="BattleFuel API",
        version="0.1.0",
        lifespan=lifespan if enable_sim else None,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=get_settings().cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    api_v1 = APIRouter(prefix="/api/v1")

    @api_v1.get("/health", tags=["meta"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    api_v1.include_router(units_router)
    api_v1.include_router(tiles_router)
    api_v1.include_router(unit_instances_router)
    api_v1.include_router(theater_router)
    api_v1.include_router(routes_router)
    api_v1.include_router(move_orders_router)
    api_v1.include_router(obstacles_router)
    api_v1.include_router(supply_router)
    api_v1.include_router(ws_router)
    app.include_router(api_v1)
    return app


app = create_app(enable_sim=True)
