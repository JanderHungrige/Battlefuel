"""The real-time simulation loop (Wave 3, sim-engine).

Ticks every ``sim_tick_seconds`` (real time), advancing each active move order by
``sim_tick_seconds * sim_time_scale`` game-seconds: it moves the unit along its route,
burns fuel, completes the order on arrival, and broadcasts each update over the WebSocket.
"""

from __future__ import annotations

import asyncio
import contextlib
from random import Random

import h3
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.ws import ConnectionManager
from app.config import get_settings
from app.db import get_session_maker
from app.models.unit_instance import UnitInstanceRow
from app.providers.factory import build_unit_provider
from app.providers.move_orders import build_move_order_provider
from app.providers.refuel_orders import build_refuel_order_provider
from app.providers.tile_feed import TileFeedProvider, build_tile_feed_provider, due_events
from app.providers.tiles import build_tile_provider
from app.providers.unit_instances import build_unit_instance_provider
from app.services.cost_model import TileFactors, tile_factors
from app.services.event_engine import EventEngine
from app.services.refuel_service import try_complete_refuel
from app.services.sim import advance
from app.services.tile_grid import DEFAULT_RESOLUTION
from app.services.tile_mutation import apply_tile_mutation, tile_update_frame

_NEUTRAL_FACTORS = TileFactors(speed_factor=1.0, fuel_factor=1.0)


class SimEngine:
    """Owns the background sim task."""

    def __init__(self, manager: ConnectionManager) -> None:
        self._manager = manager
        self._task: asyncio.Task[None] | None = None
        self._stop = asyncio.Event()
        self._game_s = 0.0  # cumulative game-time, drives the scripted tile feed

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
        feed = build_tile_feed_provider()
        events = EventEngine(
            Random(),
            mean_interval_game_s=settings.event_mean_interval_game_s,
            enabled=settings.game_mode,
        )
        dt_game = settings.sim_tick_seconds * settings.sim_time_scale
        while not self._stop.is_set():
            try:
                async with maker() as session:
                    prev_game_s = self._game_s
                    self._game_s += dt_game
                    await self.tick(session, dt_game)
                    await self.complete_refuels(session)
                    await self.apply_feed(session, feed, prev_game_s, self._game_s)
                    await events.step(
                        session, build_tile_provider(), self._manager, self._game_s, dt_game
                    )
            except Exception:
                pass
            with contextlib.suppress(asyncio.TimeoutError):
                await asyncio.wait_for(self._stop.wait(), timeout=settings.sim_tick_seconds)

    async def apply_feed(
        self, session: AsyncSession, feed: TileFeedProvider, prev_s: float, now_s: float
    ) -> int:
        """Apply scripted-feed events that came due in (prev_s, now_s]; broadcast each. Public
        for testing. Returns the number of mutations applied."""
        tiles = build_tile_provider()
        applied = 0
        for ev in due_events(feed.events(), prev_s, now_s):
            cell = h3.latlng_to_cell(ev.lat, ev.lon, DEFAULT_RESOLUTION)
            tile = await apply_tile_mutation(session, tiles, cell, ev.mutation)
            if tile is not None:
                await self._manager.broadcast(tile_update_frame(tile))
                applied += 1
        return applied

    async def complete_refuels(self, session: AsyncSession) -> int:
        """Complete any active refuel order whose unit + truck are co-located. Public for testing.

        Returns the number of transfers completed; broadcasts a ``refuel_order_update`` per one.
        """
        orders = build_refuel_order_provider()
        instances = build_unit_instance_provider()
        units = build_unit_provider()
        completed = 0
        for order in await orders.list_active(session):
            done = await try_complete_refuel(session, instances, units, orders, order)
            if done is not None:
                await self._manager.broadcast(
                    {
                        "type": "refuel_order_update",
                        "order_id": done.id,
                        "unit_id": done.unit_id,
                        "truck_id": done.truck_id,
                        "status": done.status.value,
                        "fuel_type": done.fuel_type.value,
                        "transferred_liters": round(done.transferred_liters, 1),
                    }
                )
                completed += 1
        return completed

    async def tick(self, session: AsyncSession, dt_game_s: float) -> None:
        """Advance every active order by one game-time step. Public for testing."""
        orders = build_move_order_provider()
        units = build_unit_provider()
        tiles = build_tile_provider()
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
            tile = await tiles.get_tile(session, row.h3_index) if row.h3_index else None
            factors = (
                tile_factors(tile.terrain, tile.road_condition) if tile else _NEUTRAL_FACTORS
            )
            step = advance(
                order,
                fuel,
                unit_type,
                dt_game_s,
                speed_factor=factors.speed_factor,
                fuel_factor=factors.fuel_factor,
            )
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
