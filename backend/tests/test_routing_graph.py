"""Tests for the routing-graph overlay endpoint (v2 Wave 20 F1, routing-graph-overlay-api)."""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.api.routing_graph import _coords
from app.config import Settings
from app.db import get_session
from app.main import create_app


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
