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
from app.domain.combat_event import combat_event_frame
from app.domain.move_order import MoveOrder, MoveOrderStatus
from app.domain.unit import UnitType
from app.models.unit_instance import UnitInstanceRow
from app.providers.base import UnitDataProvider
from app.providers.buy_orders import build_buy_order_provider
from app.providers.combat_events import (
    CombatEventFeedProvider,
    build_combat_event_feed_provider,
    due_combat_events,
)
from app.providers.factory import build_unit_provider
from app.providers.move_orders import MoveOrderProvider, build_move_order_provider
from app.providers.refuel_orders import build_refuel_order_provider
from app.providers.rendezvous import build_rendezvous_order_provider
from app.providers.strategic_feed import (
    StrategicFeedProvider,
    build_strategic_feed_provider,
    due_strategic,
)
from app.providers.supply import build_supply_provider
from app.providers.tile_feed import TileFeedProvider, build_tile_feed_provider, due_events
from app.providers.tiles import TileDataProvider, build_tile_provider
from app.providers.unit_instances import build_unit_instance_provider
from app.services.buy_service import progress_buy_order_stages
from app.services.cost_model import TileFactors, tile_factors
from app.services.event_engine import EventEngine
from app.services.refuel_service import try_complete_depot_refuel, try_complete_refuel
from app.services.rendezvous_schedule_service import decrement_and_collect_due
from app.services.sim import (
    THREAT_CROSS_FUEL_FACTOR,
    THREAT_L5,
    SimStep,
    advance,
    advance_with_terrain,
    point_at,
    polyline_length_m,
    substep_dt,
)
from app.services.tile_grid import DEFAULT_RESOLUTION
from app.services.tile_mutation import apply_tile_mutation, tile_update_frame

_NEUTRAL_FACTORS = TileFactors(speed_factor=1.0, fuel_factor=1.0)
# Safety bound on sub-steps per tick; a unit completes its route well before this (v2 Wave 10).
_MAX_SUBSTEPS = 256


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
        strategic = build_strategic_feed_provider()
        combat = build_combat_event_feed_provider()
        events = EventEngine(
            Random(),
            mean_interval_game_s=settings.event_mean_interval_game_s,
            enabled=settings.game_mode,
            decay_interval_game_s=settings.threat_decay_interval_game_s,
            decay_chance=settings.threat_decay_chance,
            light_threat_max=settings.light_threat_max,
        )
        dt_game = settings.sim_tick_seconds * settings.sim_time_scale
        while not self._stop.is_set():
            try:
                async with maker() as session:
                    prev_game_s = self._game_s
                    self._game_s += dt_game
                    await self.tick(session, dt_game)
                    await self.complete_refuels(session)
                    await self.advance_buy_orders(session, dt_game)
                    await self.check_rendezvous_reminders(session, dt_game)
                    await self.apply_feed(session, feed, prev_game_s, self._game_s)
                    await self.apply_strategic_feed(strategic, prev_game_s, self._game_s)
                    await self.apply_combat_feed(combat, prev_game_s, self._game_s)
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

    async def apply_strategic_feed(
        self, strategic: StrategicFeedProvider, prev_s: float, now_s: float
    ) -> int:
        """Broadcast scripted strategic messages that came due in (prev_s, now_s]. Public for
        testing. Returns the number sent."""
        sent = 0
        for ev in due_strategic(strategic.events(), prev_s, now_s):
            await self._manager.broadcast(
                {
                    "type": "strategic_message",
                    "text": ev.text,
                    "category": ev.category,
                    "game_s": round(now_s, 1),
                }
            )
            sent += 1
        return sent

    async def apply_combat_feed(
        self, combat: CombatEventFeedProvider, prev_s: float, now_s: float
    ) -> int:
        """Broadcast located combat events that came due in (prev_s, now_s]. Public for testing.
        Returns the number sent."""
        sent = 0
        for ev in due_combat_events(combat.events(), prev_s, now_s):
            await self._manager.broadcast(combat_event_frame(ev, now_s))
            sent += 1
        return sent

    async def complete_refuels(self, session: AsyncSession) -> int:
        """Complete any active refuel order whose unit + truck are co-located. Public for testing.

        Returns the number of transfers completed; broadcasts a ``refuel_order_update`` per one.
        """
        orders = build_refuel_order_provider()
        instances = build_unit_instance_provider()
        units = build_unit_provider()
        supply = build_supply_provider()
        completed = 0
        for order in await orders.list_active(session):
            if order.depot_id is not None:
                done = await try_complete_depot_refuel(
                    session, instances, units, supply, orders, order
                )
            else:
                done = await try_complete_refuel(session, instances, units, orders, order)
            if done is not None:
                await self._manager.broadcast(
                    {
                        "type": "refuel_order_update",
                        "order_id": done.id,
                        "unit_id": done.unit_id,
                        "truck_id": done.truck_id,
                        "depot_id": done.depot_id,
                        "status": done.status.value,
                        "fuel_type": done.fuel_type.value,
                        "transferred_liters": round(done.transferred_liters, 1),
                    }
                )
                completed += 1
        return completed

    async def advance_buy_orders(self, session: AsyncSession, dt_game_s: float) -> int:
        """Advance active buy orders through their NATO fulfilment stages; broadcast every stage
        change (delivery is the terminal stage). Public for testing. Returns the number of orders
        whose stage changed this step (v2 Wave 11 F4)."""
        supply = build_supply_provider()
        orders = build_buy_order_provider()
        changed = await progress_buy_order_stages(session, supply, orders, dt_game_s)
        for order in changed:
            await self._manager.broadcast(
                {
                    "type": "buy_order_update",
                    "order_id": order.id,
                    "depot_id": order.depot_id,
                    "fuel_type": order.fuel_type.value,
                    "quantity_liters": round(order.quantity_liters, 1),
                    "status": order.status.value,
                    "remaining_game_s": round(order.remaining_game_s, 1),
                    "nato_stage": order.nato_stage.value,
                    "stage_remaining_game_s": round(order.stage_remaining_game_s, 1),
                }
            )
        return len(changed)

    async def check_rendezvous_reminders(self, session: AsyncSession, dt_game_s: float) -> int:
        """Count down planned rendezvous orders; on a due order broadcast a reminder (no
        auto-dispatch) + a chatter line and flip it to ``due``. Public for testing. Returns the
        number of reminders fired this step (v2 Wave 13 F2)."""
        orders = build_rendezvous_order_provider()
        due = await decrement_and_collect_due(session, orders, dt_game_s)
        for order in due:
            await self._manager.broadcast(
                {
                    "type": "rendezvous_reminder",
                    "order_id": order.id,
                    "truck_id": order.truck_id,
                    "unit_id": order.unit_id,
                    "sector_lat": order.sector_lat,
                    "sector_lon": order.sector_lon,
                    "sector_h3": order.sector_h3,
                    "metric": order.metric.value,
                    "status": order.status.value,
                }
            )
            await self._manager.broadcast(
                {
                    "type": "strategic_message",
                    "text": (
                        f"Scheduled rendezvous due — tanker {order.truck_id} ↔ unit "
                        f"{order.unit_id} at sector {order.sector_h3}. Confirm to launch."
                    ),
                    "category": "logistics",
                }
            )
        return len(due)

    async def tick(self, session: AsyncSession, dt_game_s: float) -> None:
        """Advance every active order by one game-time step. Public for testing."""
        orders = build_move_order_provider()
        units = build_unit_provider()
        tiles = build_tile_provider()
        max_step_m = get_settings().sim_max_step_m
        for order in await orders.list_active(session):
            await self._advance_order(session, orders, units, tiles, order, dt_game_s, max_step_m)

    async def _advance_order(
        self,
        session: AsyncSession,
        orders: MoveOrderProvider,
        units: UnitDataProvider,
        tiles: TileDataProvider,
        order: MoveOrder,
        dt_game_s: float,
        max_step_m: float,
    ) -> None:
        """Advance one order across the tick in sub-steps of ≤ ``max_step_m`` so movement is
        smooth, re-running the look-ahead/halt check per sub-step (v2 Wave 10, F1 + F3)."""
        row = await session.get(UnitInstanceRow, order.instance_id)
        if row is None:
            return
        unit_type = units.get_unit(row.unit_type_id)
        if unit_type is None:
            return
        fuel = (
            row.current_fuel_liters
            if row.current_fuel_liters is not None
            else unit_type.fuel.capacity_liters
        )
        working = order
        remaining = dt_game_s
        guard = 0
        while remaining > 1e-9 and guard < _MAX_SUBSTEPS:
            guard += 1
            cur_tile = await tiles.get_tile(session, row.h3_index) if row.h3_index else None
            cur_factors = (
                tile_factors(cur_tile.terrain, cur_tile.road_condition)
                if cur_tile
                else _NEUTRAL_FACTORS
            )
            speed_mps = (
                unit_type.movement.speed_road_kph * cur_factors.speed_factor * 1000.0 / 3600.0
            )
            sub_dt = substep_dt(remaining, speed_mps, max_step_m)
            # Look ahead at the current speed to find the tile the unit is *entering* this sub-step.
            nominal = advance(
                working,
                fuel,
                unit_type,
                sub_dt,
                speed_factor=cur_factors.speed_factor,
                fuel_factor=cur_factors.fuel_factor,
            )
            enter_cell = h3.latlng_to_cell(nominal.lat, nominal.lon, DEFAULT_RESOLUTION)
            enter_tile = await tiles.get_tile(session, enter_cell)
            enter_factors = (
                tile_factors(enter_tile.terrain, enter_tile.road_condition)
                if enter_tile
                else _NEUTRAL_FACTORS
            )
            enter_threat = enter_tile.threat_level if enter_tile else 0
            cur_threat = cur_tile.threat_level if cur_tile else 0
            step = advance_with_terrain(
                working,
                fuel,
                unit_type,
                sub_dt,
                factors=enter_factors,
                threat_level=enter_threat,
                currently_in_threat=cur_threat >= THREAT_L5,
                entering_new_cell=enter_cell != row.h3_index,
            )
            # On a halt, estimate the adjusted fuel to crawl the remaining threat tiles (v2 W13 F5).
            slow_fuel = (
                await self._estimate_slow_mode_fuel(session, tiles, working, unit_type)
                if step.status is MoveOrderStatus.HALTED
                else None
            )
            await self._persist_and_broadcast(
                session, orders, working, step, enter_factors, slow_mode_fuel_l=slow_fuel
            )
            fuel = step.fuel_l
            remaining -= sub_dt
            working = working.model_copy(
                update={"progress_m": step.progress_m, "status": step.status}
            )
            if step.status in (MoveOrderStatus.COMPLETE, MoveOrderStatus.HALTED):
                break
            row = await session.get(UnitInstanceRow, order.instance_id)
            if row is None:
                break

    async def _estimate_slow_mode_fuel(
        self,
        session: AsyncSession,
        tiles: TileDataProvider,
        order: MoveOrder,
        unit_type: UnitType,
    ) -> float:
        """Estimate the fuel to crawl every remaining threat-L5 tile on the route at the slow
        (proceed-slowly) penalty. Samples the remaining geometry at a coarse step (v2 W13 F5)."""
        geom = order.geometry
        total = polyline_length_m(geom)
        speed_kph = unit_type.movement.speed_road_kph
        if total <= 0 or speed_kph <= 0:
            return 0.0
        step_m = 300.0  # ~half a hex at resolution 8
        threat_m = 0.0
        dist = order.progress_m
        guard = 0
        while dist < total and guard < _MAX_SUBSTEPS:
            guard += 1
            pt = point_at(geom, dist)
            cell = h3.latlng_to_cell(pt[1], pt[0], DEFAULT_RESOLUTION)
            tile = await tiles.get_tile(session, cell)
            if tile is not None and tile.threat_level >= THREAT_L5:
                threat_m += step_m
            dist += step_m
        lph = unit_type.fuel.consumption_normal_lph
        return lph * (threat_m / 1000.0) / speed_kph * THREAT_CROSS_FUEL_FACTOR

    async def _persist_and_broadcast(
        self,
        session: AsyncSession,
        orders: MoveOrderProvider,
        order: MoveOrder,
        step: SimStep,
        enter_factors: TileFactors,
        slow_mode_fuel_l: float | None = None,
    ) -> None:
        """Persist a sub-step's progress/position/fuel and broadcast the unit_update (plus a
        chatter line on a halt)."""
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
        frame: dict[str, object] = {
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
        if step.status is MoveOrderStatus.HALTED:
            reason = "blocked" if not enter_factors.passable else "threat"
            frame["reason"] = reason
            if slow_mode_fuel_l is not None:
                frame["slow_mode_fuel_l"] = round(slow_mode_fuel_l, 1)
            await self._manager.broadcast(frame)
            await self._manager.broadcast(
                {
                    "type": "strategic_message",
                    "text": (
                        f"Unit {order.instance_id} halted — {reason} sector ahead "
                        f"({step.lat:.4f}, {step.lon:.4f}). Proceed slowly or re-route."
                    ),
                    "category": "movement",
                }
            )
        else:
            await self._manager.broadcast(frame)
