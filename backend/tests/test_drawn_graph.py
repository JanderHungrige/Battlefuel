"""Tests for drawn-edge injection (v2 Wave 20 F4, connect-drawn-to-graph)."""

from __future__ import annotations

import pytest
from pydantic import ValidationError
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import Settings
from app.domain.drawn_edge import DrawnEdgeCreate
from app.providers.drawn_edges import DbDrawnEdgeProvider
from app.services.cost_model import OFFROAD_FUEL_PENALTY, OFFROAD_STUB_SPEED_FACTOR
from app.services.drawn_graph import (
    connect_flags,
    edge_cost_params,
    inject_drawn_edges,
    line_length_m,
    linestring_geojson,
)


class TestPureHelpers:
    def test_connect_flags(self) -> None:
        assert connect_flags("first") == (True, False)
        assert connect_flags("last") == (False, True)
        assert connect_flags("both") == (True, True)
        assert connect_flags("none") == (False, False)

    def test_line_length_m_one_segment(self) -> None:
        # 0.01° of latitude ≈ 1.113 km.
        d = line_length_m([[11.8, 49.2], [11.8, 49.21]])
        assert d == pytest.approx(1113, rel=0.02)

    def test_line_length_m_sums_segments(self) -> None:
        one = line_length_m([[11.8, 49.2], [11.8, 49.21]])
        two = line_length_m([[11.8, 49.2], [11.8, 49.21], [11.8, 49.22]])
        assert two == pytest.approx(2 * one, rel=0.01)

    def test_road_cost_is_clear_road(self) -> None:
        c = edge_cost_params("road", 1000.0, 0)
        assert c["speed_factor"] == 1.0
        assert c["fuel_factor"] == 1.0
        assert c["time_cost"] == pytest.approx(1000.0)
        assert c["safe_cost"] == pytest.approx(1000.0)  # threat 0 → no weighting

    def test_path_cost_is_penalised_track(self) -> None:
        c = edge_cost_params("path", 1000.0, 0)
        assert c["speed_factor"] == OFFROAD_STUB_SPEED_FACTOR
        assert c["fuel_factor"] == OFFROAD_FUEL_PENALTY
        # Slower → higher time cost (length / speed_factor).
        assert c["time_cost"] == pytest.approx(1000.0 / OFFROAD_STUB_SPEED_FACTOR)
        assert c["time_cost"] > edge_cost_params("road", 1000.0, 0)["time_cost"]

    def test_threat_raises_safe_cost(self) -> None:
        safe0 = edge_cost_params("road", 1000.0, 0)["safe_cost"]
        safe3 = edge_cost_params("road", 1000.0, 3)["safe_cost"]
        assert safe3 > safe0

    def test_linestring_geojson_roundtrips(self) -> None:
        import json

        gj = json.loads(linestring_geojson([[11.8, 49.2], [11.81, 49.21]]))
        assert gj["type"] == "LineString"
        assert gj["coordinates"] == [[11.8, 49.2], [11.81, 49.21]]


class TestDrawnEdgeCreateValidation:
    def test_accepts_valid_request(self) -> None:
        req = DrawnEdgeCreate(
            kind="road", coordinates=[[11.8, 49.2], [11.81, 49.21]], connect="both"
        )
        assert req.kind == "road"
        assert len(req.coordinates) == 2

    def test_rejects_fewer_than_two_points(self) -> None:
        with pytest.raises(ValidationError):
            DrawnEdgeCreate(kind="road", coordinates=[[11.8, 49.2]], connect="none")

    def test_rejects_non_pair_coordinate(self) -> None:
        with pytest.raises(ValidationError):
            DrawnEdgeCreate(kind="path", coordinates=[[11.8, 49.2], [11.8]], connect="none")

    def test_rejects_out_of_range(self) -> None:
        with pytest.raises(ValidationError):
            DrawnEdgeCreate(kind="road", coordinates=[[200.0, 49.2], [11.8, 49.21]], connect="none")

    def test_rejects_unknown_kind(self) -> None:
        with pytest.raises(ValidationError):
            DrawnEdgeCreate(
                kind="river",  # type: ignore[arg-type]
                coordinates=[[11.8, 49.2], [11.81, 49.21]],
                connect="none",
            )


@pytest.mark.db
class TestInjectDrawnEdges:
    """End-to-end injection against a live PostGIS graph. Cleans up after itself so the dev DB is
    left exactly as found (no drawn rows)."""

    async def test_create_inject_and_cleanup(self) -> None:
        try:
            engine = create_async_engine(Settings().database_url)
            maker = async_sessionmaker(engine, expire_on_commit=False)
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        provider = DbDrawnEdgeProvider()
        edge_id: str | None = None
        try:
            async with maker() as session:
                # Skip cleanly if the routing graph hasn't been built in this environment.
                ways = (await session.execute(text("SELECT count(*) FROM ways"))).scalar_one()
                if ways == 0:
                    pytest.skip("routing graph not built (ways empty)")
                # Draw a short road near the theater centre, connect both ends.
                edge = await provider.create(
                    session,
                    "road",
                    [[11.84, 49.22], [11.845, 49.225]],
                    connect_start=True,
                    connect_end=True,
                )
                edge_id = edge.id
                injected = await inject_drawn_edges(session)
                # 1 drawn edge + 2 connectors.
                assert injected == 3
                rows = (
                    await session.execute(
                        text("SELECT count(*) FROM ways WHERE drawn_id = :d"), {"d": edge_id}
                    )
                ).scalar_one()
                assert rows == 3
                verts = (
                    await session.execute(
                        text("SELECT count(*) FROM ways_vertices_pgr WHERE drawn_id = :d"),
                        {"d": edge_id},
                    )
                ).scalar_one()
                assert verts == 2
                # The injected edges carry real cost so a router will use them.
                costed = (
                    await session.execute(
                        text(
                            "SELECT count(*) FROM ways WHERE drawn_id = :d "
                            "AND time_cost IS NOT NULL AND safe_cost IS NOT NULL"
                        ),
                        {"d": edge_id},
                    )
                ).scalar_one()
                assert costed == 3
        finally:
            # Always remove the test edge + its injected rows, leaving the graph as base OSM.
            async with maker() as session:
                if edge_id is not None:
                    await provider.delete(session, edge_id)
                await inject_drawn_edges(session)
            await engine.dispose()
