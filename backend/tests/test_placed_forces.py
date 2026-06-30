"""DB tests for scenario force placement endpoints (v2 Wave 22 F1).

Place a friendly unit and a hostile via the API, confirm each shows up in its listing, then remove
it. Each test cleans up what it creates so it does not pollute the shared dev DB.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import Settings
from app.db import get_session
from app.main import create_app


async def _client() -> tuple[AsyncClient, object]:
    engine = create_async_engine(Settings().database_url)
    maker = async_sessionmaker(engine, expire_on_commit=False)

    async def _override() -> AsyncIterator[AsyncSession]:
        async with maker() as session:
            yield session

    app = create_app()
    app.dependency_overrides[get_session] = _override
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test"), engine


@pytest.mark.db
class TestPlaceBlue:
    async def test_place_then_remove_blue_unit(self) -> None:
        try:
            client, engine = await _client()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        try:
            resp = await client.post(
                "/api/v1/unit-instances",
                json={"unit_type_id": "armor-tank-coy", "lat": 49.22, "lon": 11.85},
            )
            assert resp.status_code == 201, resp.text
            placed = resp.json()
            # Half fuel (F2): 18000 L tank → 9000 L.
            assert placed["current_fuel_liters"] == 9000.0
            assert placed["status"] == "operational"
            listing = await client.get("/api/v1/unit-instances")
            assert any(u["id"] == placed["id"] for u in listing.json())

            iid = placed["id"]
            assert (await client.delete(f"/api/v1/unit-instances/{iid}")).status_code == 204
            listing2 = await client.get("/api/v1/unit-instances")
            assert not any(u["id"] == iid for u in listing2.json())
            assert (await client.delete(f"/api/v1/unit-instances/{iid}")).status_code == 404
        finally:
            await client.aclose()
            await engine.dispose()

    async def test_unknown_unit_type_is_404(self) -> None:
        try:
            client, engine = await _client()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        try:
            resp = await client.post(
                "/api/v1/unit-instances",
                json={"unit_type_id": "no-such-type", "lat": 49.22, "lon": 11.85},
            )
            assert resp.status_code == 404
        finally:
            await client.aclose()
            await engine.dispose()


@pytest.mark.db
class TestPlaceRed:
    async def test_place_then_remove_red_unit(self) -> None:
        try:
            client, engine = await _client()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        try:
            resp = await client.post(
                "/api/v1/enemy-units",
                json={"unit_type_id": "mech-inf-coy", "lat": 49.24, "lon": 11.86},
            )
            assert resp.status_code == 201, resp.text
            placed = resp.json()
            assert placed["sidc"].startswith("1006")  # hostile affiliation
            listing = await client.get("/api/v1/enemy-units")
            assert any(e["id"] == placed["id"] for e in listing.json())

            assert (await client.delete(f"/api/v1/enemy-units/{placed['id']}")).status_code == 204
            listing2 = await client.get("/api/v1/enemy-units")
            assert not any(e["id"] == placed["id"] for e in listing2.json())
            assert (await client.delete(f"/api/v1/enemy-units/{placed['id']}")).status_code == 404
        finally:
            await client.aclose()
            await engine.dispose()
