"""Tests for the sim engine (Wave 3 Feature 4: sim-engine)."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from itertools import pairwise
from typing import Any

import h3
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
from app.services.tile_grid import DEFAULT_RESOLUTION

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


class TestSubstepDt:
    """F3 (Wave 10, doc 62): sub-step sizing that caps the distance per broadcast frame."""

    def test_caps_distance_per_substep(self) -> None:
        from app.services.sim import substep_dt

        # 10 m/s, 200 m cap → 20 game-seconds per sub-step.
        assert substep_dt(60.0, 10.0, 200.0) == pytest.approx(20.0)

    def test_uses_remaining_when_smaller(self) -> None:
        from app.services.sim import substep_dt

        assert substep_dt(5.0, 10.0, 200.0) == pytest.approx(5.0)

    def test_zero_speed_collapses_to_whole_step(self) -> None:
        from app.services.sim import substep_dt

        assert substep_dt(60.0, 0.0, 200.0) == pytest.approx(60.0)


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

    async def test_tick_halts_on_blocked_tile_without_fuel_bleed(self) -> None:
        """F1 (Wave 10): end-to-end — a unit on a blocked tile HALTS cleanly (no progress,
        no idle fuel burn) instead of freezing while it bleeds fuel."""
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

            # Block the tile the unit is standing on (as the event feed could mid-mission).
            # Restored in `finally` so this test never pollutes the shared dev DB.
            cell = h3.latlng_to_cell(inst.lat, inst.lon, DEFAULT_RESOLUTION)
            cap = unit_type.fuel.capacity_liters
            fuel_before = await instances.get_instance(session, "inst-armor-1") or inst
            before_l = fuel_before.current_fuel_liters if fuel_before.current_fuel_liters else cap
            try:
                await session.execute(
                    text("UPDATE tiles SET road_condition='blocked' WHERE h3_index = :c"),
                    {"c": cell},
                )
                await session.commit()

                engine = SimEngine(ConnectionManager())
                await engine.tick(session, dt_game_s=60)

                halted = await orders.get(session, order.id)
                assert halted is not None and halted.status is MoveOrderStatus.HALTED
                assert halted.progress_m == 0.0  # never entered the block
                after = await instances.get_instance(session, "inst-armor-1")
                assert after is not None
                after_l = after.current_fuel_liters if after.current_fuel_liters else cap
                assert after_l == pytest.approx(before_l, abs=1e-6)  # halted -> no idle fuel bleed
            finally:
                await session.execute(
                    text("UPDATE tiles SET road_condition='clear' WHERE h3_index = :c"),
                    {"c": cell},
                )
                await session.commit()

    async def test_tick_substeps_into_multiple_smooth_frames(self) -> None:
        """F3 (Wave 10): a tick that moves a unit hundreds of metres is split into multiple small
        unit_update frames (≤ sim_max_step_m apart), not one big jump."""
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

            ws = _FakeWS()
            mgr = ConnectionManager()
            await mgr.connect(ws)  # type: ignore[arg-type]
            engine = SimEngine(mgr)
            await engine.tick(session, dt_game_s=600)  # several km of travel in one tick

            frames = [m for m in ws.messages if m["type"] == "unit_update"]
            assert len(frames) >= 2  # sub-stepped, not a single jump
            # Each hop is bounded near sim_max_step_m (200 m). The bound is loose because the
            # look-ahead sizes the sub-step on the current tile's speed while the actual move uses
            # the entering tile's, so a slow→fast terrain transition can stretch a hop a little —
            # still ~30x smaller than the ~6 km single jump this would be without sub-stepping.
            for a, b in pairwise(frames):
                hop = haversine_m(a["lon"], a["lat"], b["lon"], b["lat"])
                assert hop <= 400


class TestNeverStallTraversal:
    """F1 (Wave 10, doc 60): a unit never freezes. A physical block (or threat-L5 in Safe)
    halts cleanly (no progress, no idle fuel burn); Fast crosses threat-L5 at a penalty;
    a 'crossing' order crawls across the obstruction and reverts to active once clear.

    These target the NEW pure decision function ``advance_with_terrain`` (wraps ``advance``),
    so they need no DB and stay deterministic. Local imports keep module collection working
    until the symbol exists. RED until F1 is implemented.
    """

    @staticmethod
    def _order(
        progress_m: float = 0.0,
        *,
        metric: RouteMetric = RouteMetric.FAST,
        status: MoveOrderStatus = MoveOrderStatus.ACTIVE,
    ) -> MoveOrder:
        return MoveOrder(
            id="o1",
            instance_id="i1",
            status=status,
            metric=metric,
            distance_m=polyline_length_m(_LINE),
            duration_s=100.0,
            fuel_consumed_l=10.0,
            progress_m=progress_m,
            geometry=_LINE,
        )

    def test_blocked_tile_halts_with_no_progress_and_no_fuel_burn(self) -> None:
        from app.services.cost_model import TileFactors
        from app.services.sim import advance_with_terrain

        order = self._order(progress_m=100.0)
        step = advance_with_terrain(
            order,
            fuel_l=18000,
            unit_type=_ARMOR,
            dt_game_s=30,
            factors=TileFactors(speed_factor=0.0, fuel_factor=1.0),
            threat_level=0,
        )
        assert step.status == "halted"
        assert step.progress_m == 100.0  # did not enter the block
        assert step.fuel_l == 18000  # halted ⇒ no idle burn (this is the stall fix)

    def test_blocked_tile_halts_in_safe_posture_too(self) -> None:
        from app.services.cost_model import TileFactors
        from app.services.sim import advance_with_terrain

        step = advance_with_terrain(
            self._order(metric=RouteMetric.SAFE),
            fuel_l=18000,
            unit_type=_ARMOR,
            dt_game_s=30,
            factors=TileFactors(speed_factor=0.0, fuel_factor=1.0),
            threat_level=0,
        )
        assert step.status == "halted"

    def test_threat_l5_fast_crosses_at_penalty_not_halt(self) -> None:
        from app.services.cost_model import TileFactors
        from app.services.sim import advance_with_terrain

        clear = TileFactors(speed_factor=1.0, fuel_factor=1.0)
        normal = advance_with_terrain(
            self._order(),
            fuel_l=18000,
            unit_type=_ARMOR,
            dt_game_s=30,
            factors=clear,
            threat_level=0,
        )
        crossed = advance_with_terrain(
            self._order(metric=RouteMetric.FAST),
            fuel_l=18000,
            unit_type=_ARMOR,
            dt_game_s=30,
            factors=clear,
            threat_level=5,
        )
        assert crossed.status == "active"  # Fast does not halt on threat
        assert 0 < crossed.progress_m < normal.progress_m  # crosses, but slower (penalty)
        assert (18000 - crossed.fuel_l) > (18000 - normal.fuel_l)  # extra fuel burn

    def test_threat_l5_safe_halts(self) -> None:
        from app.services.cost_model import TileFactors
        from app.services.sim import advance_with_terrain

        step = advance_with_terrain(
            self._order(progress_m=50.0, metric=RouteMetric.SAFE),
            fuel_l=18000,
            unit_type=_ARMOR,
            dt_game_s=30,
            factors=TileFactors(speed_factor=1.0, fuel_factor=1.0),
            threat_level=5,
        )
        assert step.status == "halted"
        assert step.progress_m == 50.0
        assert step.fuel_l == 18000

    def test_threat_below_5_moves_normally(self) -> None:
        from app.services.cost_model import TileFactors
        from app.services.sim import advance_with_terrain

        clear_step = advance_with_terrain(
            self._order(),
            fuel_l=18000,
            unit_type=_ARMOR,
            dt_game_s=30,
            factors=TileFactors(speed_factor=1.0, fuel_factor=1.0),
            threat_level=0,
        )
        t4 = advance_with_terrain(
            self._order(metric=RouteMetric.SAFE),
            fuel_l=18000,
            unit_type=_ARMOR,
            dt_game_s=30,
            factors=TileFactors(speed_factor=1.0, fuel_factor=1.0),
            threat_level=4,
        )
        assert t4.status == "active"
        assert t4.progress_m == pytest.approx(clear_step.progress_m, rel=1e-6)

    def test_crossing_order_crawls_across_block_without_freezing(self) -> None:
        from app.services.cost_model import TileFactors
        from app.services.sim import advance_with_terrain

        order = self._order(progress_m=100.0, status=MoveOrderStatus.CROSSING)
        step = advance_with_terrain(
            order,
            fuel_l=18000,
            unit_type=_ARMOR,
            dt_game_s=30,
            factors=TileFactors(speed_factor=0.0, fuel_factor=1.0),
            threat_level=0,
        )
        assert step.status == "crossing"
        assert step.progress_m > 100.0  # inches forward — never frozen
        assert step.fuel_l < 18000  # burns fuel while crossing

    def test_crossing_reverts_to_active_on_clear_tile(self) -> None:
        from app.services.cost_model import TileFactors
        from app.services.sim import advance_with_terrain

        step = advance_with_terrain(
            self._order(status=MoveOrderStatus.CROSSING),
            fuel_l=18000,
            unit_type=_ARMOR,
            dt_game_s=30,
            factors=TileFactors(speed_factor=1.0, fuel_factor=1.0),
            threat_level=0,
        )
        assert step.status == "active"  # cleared the obstruction → normal movement resumes
        assert step.progress_m > 0


class TestThreatHaltPopupFix:
    """v2 Wave 13 F5: halt only on the transition INTO threat; Continue crosses at normal speed."""

    @staticmethod
    def _order(
        progress_m: float = 0.0,
        *,
        metric: RouteMetric = RouteMetric.SAFE,
        status: MoveOrderStatus = MoveOrderStatus.ACTIVE,
    ) -> MoveOrder:
        return MoveOrder(
            id="o1",
            instance_id="i1",
            status=status,
            metric=metric,
            distance_m=polyline_length_m(_LINE),
            duration_s=100.0,
            fuel_consumed_l=10.0,
            progress_m=progress_m,
            geometry=_LINE,
        )

    def test_starting_in_threat_does_not_halt(self) -> None:
        from app.services.cost_model import TileFactors
        from app.services.sim import advance_with_terrain

        # SAFE unit already in a threat tile (currently_in_threat) entering threat → moves, no halt.
        step = advance_with_terrain(
            self._order(metric=RouteMetric.SAFE),
            fuel_l=18000,
            unit_type=_ARMOR,
            dt_game_s=30,
            factors=TileFactors(speed_factor=1.0, fuel_factor=1.0),
            threat_level=5,
            currently_in_threat=True,
        )
        assert step.status != "halted"
        assert step.progress_m > 0.0  # it moved out instead of freezing at move start

    def test_transition_into_threat_halts_in_safe(self) -> None:
        from app.services.cost_model import TileFactors
        from app.services.sim import advance_with_terrain

        # SAFE unit in a clear tile entering a threat tile → halts (the decision point).
        step = advance_with_terrain(
            self._order(metric=RouteMetric.SAFE),
            fuel_l=18000,
            unit_type=_ARMOR,
            dt_game_s=30,
            factors=TileFactors(speed_factor=1.0, fuel_factor=1.0),
            threat_level=5,
            currently_in_threat=False,
        )
        assert step.status == "halted"

    def test_continue_crosses_threat_at_normal_speed(self) -> None:
        from app.services.cost_model import TileFactors
        from app.services.sim import advance_with_terrain

        clear = TileFactors(speed_factor=1.0, fuel_factor=1.0)
        normal = advance_with_terrain(
            self._order(status=MoveOrderStatus.ACTIVE),
            fuel_l=18000,
            unit_type=_ARMOR,
            dt_game_s=30,
            factors=clear,
            threat_level=0,
        )
        cont = advance_with_terrain(
            self._order(status=MoveOrderStatus.CONTINUING),
            fuel_l=18000,
            unit_type=_ARMOR,
            dt_game_s=30,
            factors=clear,
            threat_level=5,  # crossing a threat tile
        )
        assert cont.status == "continuing"
        # Normal speed + normal fuel (no crawl penalty), unlike "proceed slowly".
        assert cont.progress_m == normal.progress_m
        assert cont.fuel_l == normal.fuel_l

    def test_continuing_reverts_to_active_on_clear_tile(self) -> None:
        from app.services.cost_model import TileFactors
        from app.services.sim import advance_with_terrain

        step = advance_with_terrain(
            self._order(status=MoveOrderStatus.CONTINUING),
            fuel_l=18000,
            unit_type=_ARMOR,
            dt_game_s=30,
            factors=TileFactors(speed_factor=1.0, fuel_factor=1.0),
            threat_level=0,  # cleared the threat
        )
        assert step.status == "active"  # next threat tile will re-prompt
