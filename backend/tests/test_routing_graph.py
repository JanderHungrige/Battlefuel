"""Tests for the routing-graph overlay endpoint (v2 Wave 20 F1, routing-graph-overlay-api)."""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.api.routing_graph import _coords
from app.config import Settings
from app.db import get_session
from app.main import create_app
from app.services.routing_graph import _EDGE_SELECT, _load_threats, annotate_ways
from app.services.threat_grid import threat_at


class TestCoordsParse:
    def test_linestring(self) -> None:
        assert _coords('{"type":"LineString","coordinates":[[11.8,49.2],[11.81,49.21]]}') == [
            [11.8, 49.2],
            [11.81, 49.21],
        ]

    def test_multilinestring_flattened(self) -> None:
        gj = '{"type":"MultiLineString","coordinates":[[[1,2],[3,4]],[[5,6]]]}'
        assert _coords(gj) == [[1.0, 2.0], [3.0, 4.0], [5.0, 6.0]]


@pytest.mark.db
class TestRoutingGraphApi:
    async def _client(self) -> tuple[AsyncClient, object]:
        engine = create_async_engine(Settings().database_url)
        maker = async_sessionmaker(engine, expire_on_commit=False)

        async def _override() -> AsyncIterator[AsyncSession]:
            async with maker() as session:
                yield session

        app = create_app()
        app.dependency_overrides[get_session] = _override
        return AsyncClient(transport=ASGITransport(app=app), base_url="http://test"), engine

    async def test_returns_edges_and_nodes(self) -> None:
        try:
            client, engine = await self._client()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        try:
            resp = await client.get("/api/v1/routing-graph")
            assert resp.status_code == 200
            body = resp.json()
            assert len(body["edges"]) > 0
            assert len(body["nodes"]) > 0
            # Edges are [lon, lat] polylines with a threat level; nodes are [lon, lat] points.
            edge = body["edges"][0]
            assert len(edge["geometry"]) >= 2
            assert all(len(pt) == 2 for pt in edge["geometry"])
            assert "threat_level" in edge
            assert len(body["nodes"][0]["point"]) == 2
        finally:
            await client.aclose()
            await engine.dispose()


@pytest.mark.db
class TestThreatEdgePenaltyByResolution:
    """v2 Wave 21 F3: an edge's stored threat is the highest-wins footprint threat at its midpoint,
    read at the threat's own resolution — the SAME field the map colours, so cost matches colour."""

    async def _session(self) -> tuple[AsyncSession, object]:
        engine = create_async_engine(Settings().database_url)
        maker = async_sessionmaker(engine, expire_on_commit=False)
        return maker(), engine

    async def test_stored_threat_matches_the_footprint_model(self) -> None:
        try:
            session, engine = await self._session()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        try:
            # Re-annotate from the current tile state (idempotent), then verify the wiring: every
            # edge's persisted threat_level equals threat_at(midpoint) over the located threats.
            try:
                n = await annotate_ways(session, enemies=[])
            except SQLAlchemyError as exc:
                pytest.skip(f"routing graph not built: {exc}")
            assert n > 0
            threats = await _load_threats(session)
            assert threats, "expected seeded threat tiles"
            rows = (
                await session.execute(
                    text(
                        _EDGE_SELECT.format(where="").replace(
                            "FROM ways", "FROM ways WHERE threat_level IS NOT NULL"
                        )
                        + " ORDER BY gid LIMIT 200"
                    )
                )
            ).all()
            gids = [r[0] for r in rows]
            stored = {
                g: int(t)
                for g, t in (
                    await session.execute(
                        text("SELECT gid, threat_level FROM ways WHERE gid = ANY(:g)"),
                        {"g": gids},
                    )
                ).all()
            }
            mismatches = [
                (gid, stored[gid], threat_at(ux, uy, threats))
                for gid, _lat, _lon, ux, uy, _len in rows
                if stored[gid] != threat_at(ux, uy, threats)
            ]
            assert not mismatches, f"edge threat != footprint model: {mismatches[:5]}"
            # The footprint model paints threat beyond a single H3 cell, so SOME edge is threatened.
            assert any(threat_at(ux, uy, threats) > 0 for _g, _la, _lo, ux, uy, _l in rows)
        finally:
            await session.close()
            await engine.dispose()
