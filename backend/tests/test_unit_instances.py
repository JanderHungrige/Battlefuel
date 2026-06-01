"""Tests for placed unit instances (Wave 2 Feature 4)."""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import Settings
from app.db import get_session
from app.domain.unit_instance import InstanceStatus, UnitInstance
from app.main import create_app
from app.providers.unit_instances import (
    DbUnitInstanceProvider,
    UnknownInstanceProviderError,
    build_unit_instance_provider,
)
from app.services.instance_seed import SEED_PLACEMENTS, seed_unit_instances


def _instance(**overrides: object) -> UnitInstance:
    base: dict[str, object] = dict(
        id="inst-x",
        name="TEST",
        unit_type_id="armor-tank-coy",
        lat=49.22,
        lon=11.85,
        h3_index="8800000000fffff",
        status=InstanceStatus.OPERATIONAL,
        current_fuel_liters=100.0,
    )
    base.update(overrides)
    return UnitInstance(**base)  # type: ignore[arg-type]


class TestSchema:
    def test_has_telemetry_true_when_fuel_present(self) -> None:
        assert _instance(current_fuel_liters=500.0).has_telemetry is True

    def test_has_telemetry_false_when_fuel_none(self) -> None:
        assert _instance(current_fuel_liters=None).has_telemetry is False


class TestFactory:
    def test_builds_db_provider(self) -> None:
        provider = build_unit_instance_provider(Settings(unit_instance_provider="db"))
        assert isinstance(provider, DbUnitInstanceProvider)

    def test_unknown_provider_raises(self) -> None:
        with pytest.raises(UnknownInstanceProviderError):
            build_unit_instance_provider(Settings(unit_instance_provider="nope"))


async def _seeded_maker() -> tuple[async_sessionmaker[AsyncSession], object]:
    engine = create_async_engine(Settings().database_url)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as session:
        await seed_unit_instances(session)
    return maker, engine


@pytest.mark.db
class TestProviderDb:
    async def test_lists_and_gets_instances(self) -> None:
        try:
            maker, engine = await _seeded_maker()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        try:
            async with maker() as session:
                instances = await DbUnitInstanceProvider().list_instances(session)
                assert len(instances) == len(SEED_PLACEMENTS)
                one = await DbUnitInstanceProvider().get_instance(session, "inst-armor-1")
                assert one is not None and one.unit_type_id == "armor-tank-coy"
                assert await DbUnitInstanceProvider().get_instance(session, "nope") is None
        finally:
            await engine.dispose()

    async def test_unit_without_telemetry_has_none_fuel(self) -> None:
        try:
            maker, engine = await _seeded_maker()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        try:
            async with maker() as session:
                recon = await DbUnitInstanceProvider().get_instance(session, "inst-recon-1")
                assert recon is not None
                assert recon.current_fuel_liters is None
                assert recon.has_telemetry is False
        finally:
            await engine.dispose()


@pytest.mark.db
class TestApi:
    async def _client(self) -> tuple[AsyncClient, object]:
        maker, engine = await _seeded_maker()

        async def _override() -> AsyncIterator[AsyncSession]:
            async with maker() as session:
                yield session

        app = create_app()
        app.dependency_overrides[get_session] = _override
        return AsyncClient(transport=ASGITransport(app=app), base_url="http://test"), engine

    async def test_list_get_404(self) -> None:
        try:
            client, engine = await self._client()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        try:
            listing = await client.get("/api/v1/unit-instances")
            assert listing.status_code == 200
            assert len(listing.json()) == len(SEED_PLACEMENTS)
            one = await client.get("/api/v1/unit-instances/inst-fuel-1")
            assert one.status_code == 200
            assert one.json()["name"] == "TANKER"
            assert (await client.get("/api/v1/unit-instances/missing")).status_code == 404
        finally:
            await client.aclose()
            await engine.dispose()
