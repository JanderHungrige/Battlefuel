"""DB tests for scenario save/load (v2 Wave 22 F5, scenario-save-load).

Saves the current hand-built state, reloads it, and checks the restored state matches the snapshot.
The reload restores an equivalent state (new ids), so the DB is left populated; the test scenario
row is cleaned up.
"""

from __future__ import annotations

import pytest
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import Settings
from app.services.scenario_service import (
    build_snapshot,
    delete_scenario,
    list_scenarios,
    load_scenario,
    save_scenario,
)

_NAME = "__pytest_scenario__"


async def _count(session: object, table: str) -> int:
    return int((await session.execute(text(f"SELECT count(*) FROM {table}"))).scalar_one())  # type: ignore[attr-defined]


@pytest.mark.db
class TestScenarioRoundtrip:
    async def _maker(self) -> tuple[async_sessionmaker, object]:
        engine = create_async_engine(Settings().database_url)
        return async_sessionmaker(engine, expire_on_commit=False), engine

    async def test_save_load_roundtrip(self) -> None:
        try:
            maker, engine = await self._maker()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        try:
            async with maker() as session:
                snap = await build_snapshot(session)
                assert len(snap.units) > 0, "expected seeded units to snapshot"
                n_units, n_threats = len(snap.units), len(snap.threats)

                summary = await save_scenario(session, _NAME)
                assert summary.name == _NAME
                assert any(s.id == summary.id for s in await list_scenarios(session))

                # Reload replaces the live state with an equivalent one.
                assert await load_scenario(session, summary.id) is True
                after = await build_snapshot(session)
                assert len(after.units) == n_units
                assert len(after.threats) == n_threats

                # Unknown id → False; cleanup deletes the row.
                assert await load_scenario(session, "scn-nope") is False
                assert await delete_scenario(session, summary.id) is True
                assert not any(s.id == summary.id for s in await list_scenarios(session))
        finally:
            await engine.dispose()
