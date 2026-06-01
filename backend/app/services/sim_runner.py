"""The real-time simulation loop (Wave 3, sim-engine).

Ticks every ``sim_tick_seconds`` (real time), advancing each active move order by
``sim_tick_seconds * sim_time_scale`` game-seconds: it moves the unit along its route,
burns fuel, completes the order on arrival, and broadcasts each update over the WebSocket.
"""

from __future__ import annotations

import asyncio
import contextlib

import h3
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.ws import ConnectionManager
from app.config import get_settings
from app.db import get_session_maker
from app.models.unit_instance import UnitInstanceRow
from app.providers.factory import build_unit_provider
from app.providers.move_orders import build_move_order_provider
from app.services.sim import advance
from app.services.tile_grid import DEFAULT_RESOLUTION


class SimEngine:
    """Owns the background sim task."""

    def __init__(self, manager: ConnectionManager) -> None:
        self._manager = manager
        self._task: asyncio.Task[None] | None = None
        self._stop = asyncio.Event()

    async def start(self) -> None:
        self._stop.clear()
        self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        self._stop.set()
        if self._task is not None:
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
            self._task = None

    async def _run(self) -> None:
        settings = get_settings()
        maker = get_session_maker()
        dt_game = settings.sim_tick_seconds * settings.sim_time_scale
        while not self._stop.is_set():
            try:
                async with maker() as session:
                    await self.tick(session, dt_game)
            except Exception:
                pass
            with contextlib.suppress(asyncio.TimeoutError):
                await asyncio.wait_for(self._stop.wait(), timeout=settings.sim_tick_seconds)

    async def tick(self, session: AsyncSession, dt_game_s: float) -> None:
        """Advance every active order by one game-time step. Public for testing."""
        orders = build_move_order_provider()
        units = build_unit_provider()
        for order in await orders.list_active(session):
            row = await session.get(UnitInstanceRow, order.instance_id)
            if row is None:
                continue
            unit_type = units.get_unit(row.unit_type_id)
            if unit_type is None:
                continue
            fuel = (
                row.current_fuel_liters
                if row.current_fuel_liters is not None
                else unit_type.fuel.capacity_liters
            )
            step = advance(order, fuel, unit_type, dt_game_s)
            await orders.set_progress(session, order.id, step.progress_m, step.status)
            await session.execute(
                update(UnitInstanceRow)
                .where(UnitInstanceRow.id == order.instance_id)
                .values(
                    lat=step.lat,
                    lon=step.lon,
                    h3_index=h3.latlng_to_cell(step.lat, step.lon, DEFAULT_RESOLUTION),
                    current_fuel_liters=step.fuel_l,
                )
            )
            await session.commit()
            await self._manager.broadcast(
                {
                    "type": "unit_update",
                    "instance_id": order.instance_id,
                    "order_id": order.id,
                    "lat": step.lat,
                    "lon": step.lon,
                    "fuel_l": round(step.fuel_l, 1),
                    "status": step.status.value,
                    "progress_m": round(step.progress_m, 1),
                    "distance_m": round(order.distance_m, 1),
                }
            )
