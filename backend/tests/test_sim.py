"""Tests for the sim engine (Wave 3 Feature 4: sim-engine)."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

import pytest
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.api.ws import ConnectionManager
from app.config import Settings
from app.domain.move_order import MoveOrder, MoveOrderStatus
from app.domain.route import RouteMetric
from app.providers.factory import build_unit_provider
from app.providers.move_orders import build_move_order_provider
from app.providers.routing import build_routing_provider
from app.providers.seed_data import SEED_UNITS
from app.providers.unit_instances import build_unit_instance_provider
from app.services.instance_seed import seed_unit_instances
from app.services.move_order_service import create_move_order
from app.services.sim import advance, haversine_m, point_at, polyline_length_m
from app.services.sim_runner import SimEngine

_ARMOR = next(u for u in SEED_UNITS if u.id == "armor-tank-coy")
_LINE = [[11.80, 49.20], [11.80, 49.21], [11.80, 49.22]]  # ~2.2 km due north


def _order(progress_m: float = 0.0) -> MoveOrder:
    return MoveOrder(
        id="o1",
        instance_id="i1",
        status=MoveOrderStatus.ACTIVE,
        metric=RouteMetric.FAST,
        distance_m=polyline_length_m(_LINE),
        duration_s=100.0,
        fuel_consumed_l=10.0,
        progress_m=progress_m,
        geometry=_LINE,
    )


class TestGeometry:
    def test_haversine_one_degree_lat_is_about_111km(self) -> None:
        assert haversine_m(11.8, 49.0, 11.8, 50.0) == pytest.approx(111_000, rel=0.01)

    def test_polyline_length(self) -> None:
        assert polyline_length_m(_LINE) == pytest.approx(2224, rel=0.02)

    def test_point_at_endpoints_and_middle(self) -> None:
        assert point_at(_LINE, 0) == [11.80, 49.20]
        assert point_at(_LINE, 10_000) == [11.80, 49.22]  # beyond → last
        mid = point_at(_LINE, polyline_length_m(_LINE) / 2)
        assert mid[1] == pytest.approx(49.21, abs=1e-3)


class TestAdvance:
    def test_partial_step_stays_active_and_burns_fuel(self) -> None:
        step = advance(_order(), fuel_l=18000, unit_type=_ARMOR, dt_game_s=30)
        assert step.status is MoveOrderStatus.ACTIVE
        assert step.progress_m > 0
        assert step.fuel_l < 18000

    def test_large_step_completes_at_last_point(self) -> None:
        step = advance(_order(), fuel_l=18000, unit_type=_ARMOR, dt_game_s=100_000)
        assert step.status is MoveOrderStatus.COMPLETE
        assert [round(step.lon, 5), round(step.lat, 5)] == [11.80, 49.22]

    def test_fuel_never_negative(self) -> None:
        step = advance(_order(), fuel_l=5.0, unit_type=_ARMOR, dt_game_s=100_000)
        assert step.fuel_l == 0.0

    def test_speed_factor_scales_progress(self) -> None:
        full = advance(_order(), fuel_l=18000, unit_type=_ARMOR, dt_game_s=30, speed_factor=1.0)
        half = advance(_order(), fuel_l=18000, unit_type=_ARMOR, dt_game_s=30, speed_factor=0.5)
        assert half.progress_m == pytest.approx(full.progress_m / 2, rel=1e-6)

    def test_blocked_speed_factor_makes_no_progress_but_burns_fuel(self) -> None:
        step = advance(_order(), fuel_l=18000, unit_type=_ARMOR, dt_game_s=30, speed_factor=0.0)
        assert step.progress_m == 0.0
        assert step.fuel_l < 18000  # stuck on a blocked road still idles fuel

    def test_fuel_factor_increases_burn(self) -> None:
        base = advance(_order(), fuel_l=18000, unit_type=_ARMOR, dt_game_s=30, fuel_factor=1.0)
        heavy = advance(_order(), fuel_l=18000, unit_type=_ARMOR, dt_game_s=30, fuel_factor=1.3)
        assert (18000 - heavy.fuel_l) == pytest.approx((18000 - base.fuel_l) * 1.3, rel=1e-6)


class _FakeWS:
    def __init__(self, *, fail: bool = False) -> None:
        self.messages: list[dict[str, Any]] = []
        self.fail = fail

    async def accept(self) -> None:
        pass

    async def send_json(self, message: dict[str, Any]) -> None:
        if self.fail:
            raise RuntimeError("client gone")
        self.messages.append(message)


class TestConnectionManager:
    async def test_broadcast_reaches_clients(self) -> None:
        mgr = ConnectionManager()
        ws = _FakeWS()
        await mgr.connect(ws)  # type: ignore[arg-type]
        await mgr.broadcast({"hello": 1})
        assert ws.messages == [{"hello": 1}]

    async def test_failing_client_is_dropped(self) -> None:
        mgr = ConnectionManager()
        bad = _FakeWS(fail=True)
        await mgr.connect(bad)  # type: ignore[arg-type]
        await mgr.broadcast({"x": 1})
        assert mgr.count == 0


@asynccontextmanager
async def _session() -> AsyncIterator[AsyncSession]:
    engine = create_async_engine(Settings().database_url)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with maker() as session:
            yield session
    except SQLAlchemyError as exc:
        pytest.skip(f"database unavailable: {exc}")
    finally:
        await engine.dispose()


@pytest.mark.db
class TestTick:
    async def test_tick_moves_unit_to_destination_and_completes(self) -> None:
        async with _session() as session:
            try:
                ways = (await session.execute(text("SELECT count(*) FROM ways"))).scalar_one()
            except SQLAlchemyError:
                pytest.skip("ways table missing — run build_routing_graph.sh")
            if not ways:
                pytest.skip("routing graph empty")

            await seed_unit_instances(session)
            instances = build_unit_instance_provider()
            orders = build_move_order_provider()
            inst = await instances.get_instance(session, "inst-armor-1")
            assert inst is not None
            unit_type = build_unit_provider().get_unit(inst.unit_type_id)
            assert unit_type is not None
            order = await create_move_order(
                session,
                build_routing_provider(),
                orders,
                inst,
                unit_type,
                49.20,
                11.83,
                RouteMetric.FAST,
            )
            assert order is not None
            await orders.set_status(session, order.id, MoveOrderStatus.ACTIVE)

            engine = SimEngine(ConnectionManager())
            await engine.tick(session, dt_game_s=1_000_000)  # huge step → arrival

            done = await orders.get(session, order.id)
            assert done is not None and done.status is MoveOrderStatus.COMPLETE
            moved = await instances.get_instance(session, "inst-armor-1")
            assert moved is not None
            last = order.geometry[-1]
            assert moved.lon == pytest.approx(last[0], abs=1e-5)
            assert moved.lat == pytest.approx(last[1], abs=1e-5)
            assert (moved.current_fuel_liters or 0) < 15000
