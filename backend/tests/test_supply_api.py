"""Tests for the supply stock API (Wave 5 Feature 2: supply-stock-api)."""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import Settings
from app.db import get_session
from app.main import create_app
from app.services.instance_seed import seed_unit_instances
from app.services.supply_seed import seed_fuel_supply


async def _client() -> tuple[AsyncClient, object]:
    engine = create_async_engine(Settings().database_url)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as session:
        await seed_unit_instances(session)
        await seed_fuel_supply(session)

    async def _override() -> AsyncIterator[AsyncSession]:
        async with maker() as session:
            yield session

    app = create_app()
    app.dependency_overrides[get_session] = _override
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test"), engine


@pytest.mark.db
class TestSupplyApi:
    async def test_create_typed_site_and_site_refuel_proposal(self) -> None:
        # v2 Wave 11 F5: a typed site is created stocked; a low site proposes a refuel via the
        # reused Wave-6 redistribution advisor; unknown depot → 404; invalid type → 422.
        try:
            client, engine = await _client()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        site_id = ""
        try:
            created = await client.post(
                "/api/v1/depots",
                json={"name": "Bravo BSA", "lat": 49.21, "lon": 11.84, "site_type": "bsa"},
            )
            assert created.status_code == 201
            site = created.json()
            site_id = site["id"]
            assert site["site_type"] == "bsa"

            # The site was seeded below target fill → the advisor proposes a refuel for it.
            proposal = await client.get(f"/api/v1/advice/site-refuel/{site_id}")
            assert proposal.status_code == 200
            body = proposal.json()
            assert len(body["recommendations"]) >= 1
            assert all(r["target"] == site_id for r in body["recommendations"])

            assert (await client.get("/api/v1/advice/site-refuel/nope")).status_code == 404
            bad = await client.post(
                "/api/v1/depots", json={"name": "X", "lat": 49.2, "lon": 11.8, "site_type": "zzz"}
            )
            assert bad.status_code == 422
        finally:
            if site_id:
                async with async_sessionmaker(engine, expire_on_commit=False)() as s:  # type: ignore[arg-type]
                    await s.execute(
                        text("DELETE FROM fuel_stocks WHERE depot_id = :i"), {"i": site_id}
                    )
                    await s.execute(text("DELETE FROM fuel_depots WHERE id = :i"), {"i": site_id})
                    await s.commit()
            await client.aclose()
            await engine.dispose()

    async def test_list_depots(self) -> None:
        try:
            client, engine = await _client()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        try:
            resp = await client.get("/api/v1/depots")
            assert resp.status_code == 200
            depots = resp.json()
            assert len(depots) >= 2
            assert {"id", "name", "h3_index", "lat", "lon"} <= set(depots[0])
        finally:
            await client.aclose()
            await engine.dispose()

    async def test_create_depot_then_listed(self) -> None:
        """F6 (Wave 10): manually place a depot; it persists and appears in the list."""
        try:
            client, engine = await _client()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        try:
            created = await client.post(
                "/api/v1/depots", json={"name": "FWD Cache", "lat": 49.21, "lon": 11.84}
            )
            assert created.status_code == 201
            depot = created.json()
            assert depot["name"] == "FWD Cache"
            assert depot["h3_index"] and depot["lat"] == 49.21

            listed = await client.get("/api/v1/depots")
            assert any(d["id"] == depot["id"] for d in listed.json())
        finally:
            # Self-clean: never leave the placed depot in the shared dev DB (it has no stock and
            # would skew sibling tests).
            async with async_sessionmaker(engine)() as s:  # type: ignore[arg-type]
                await s.execute(text("DELETE FROM fuel_depots WHERE name = 'FWD Cache'"))
                await s.commit()
            await client.aclose()
            await engine.dispose()

    async def test_get_depot_and_404(self) -> None:
        try:
            client, engine = await _client()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        try:
            ok = await client.get("/api/v1/depots/depot-main")
            assert ok.status_code == 200
            assert ok.json()["id"] == "depot-main"
            missing = await client.get("/api/v1/depots/nope")
            assert missing.status_code == 404
        finally:
            await client.aclose()
            await engine.dispose()

    async def test_create_then_delete_depot(self) -> None:
        """A hand-placed site can be removed via DELETE; a missing id is 404."""
        try:
            client, engine = await _client()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        try:
            created = await client.post(
                "/api/v1/depots",
                json={"name": "Temp FLS", "lat": 49.21, "lon": 11.84, "site_type": "fls"},
            )
            assert created.status_code == 201
            depot_id = created.json()["id"]

            deleted = await client.delete(f"/api/v1/depots/{depot_id}")
            assert deleted.status_code == 200
            assert deleted.json()["status"] == "deleted"

            # Gone from the list, and its stock rows are gone too.
            listed = await client.get("/api/v1/depots")
            assert all(d["id"] != depot_id for d in listed.json())
            stocks = (await client.get(f"/api/v1/fuel-stocks?depot_id={depot_id}")).json()
            assert stocks == []

            # Deleting again 404s.
            assert (await client.delete(f"/api/v1/depots/{depot_id}")).status_code == 404
        finally:
            async with async_sessionmaker(engine)() as s:  # type: ignore[arg-type]
                await s.execute(text("DELETE FROM fuel_depots WHERE name = 'Temp FLS'"))
                await s.commit()
            await client.aclose()
            await engine.dispose()

    async def test_fuel_stocks_filters(self) -> None:
        try:
            client, engine = await _client()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        try:
            all_stocks = (await client.get("/api/v1/fuel-stocks")).json()
            assert len(all_stocks) >= 3

            by_depot = (await client.get("/api/v1/fuel-stocks?depot_id=depot-north")).json()
            assert by_depot and all(s["depot_id"] == "depot-north" for s in by_depot)

            by_type = (await client.get("/api/v1/fuel-stocks?fuel_type=diesel")).json()
            assert by_type and all(s["fuel_type"] == "diesel" for s in by_type)

            bad = await client.get("/api/v1/fuel-stocks?fuel_type=banana")
            assert bad.status_code == 422
        finally:
            await client.aclose()
            await engine.dispose()

    async def test_distribution_overview(self) -> None:
        try:
            client, engine = await _client()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        try:
            resp = await client.get("/api/v1/supply/overview")
            assert resp.status_code == 200
            body = resp.json()
            # Depots carry their stock rows.
            assert len(body["depots"]) >= 2
            assert any(d["stocks"] for d in body["depots"])
            # The seeded TANKER (fuel-supply-pl) is a mobile fuel truck.
            truck_ids = {t["instance_id"] for t in body["trucks"]}
            assert "inst-fuel-1" in truck_ids
            # A non-fuel unit is NOT counted as a truck.
            assert "inst-armor-1" not in truck_ids
            # Totals present and positive.
            assert body["total_depot_liters_by_type"]["diesel"] > 0
            assert body["total_truck_liters"] >= 3800.0
        finally:
            await client.aclose()
            await engine.dispose()
