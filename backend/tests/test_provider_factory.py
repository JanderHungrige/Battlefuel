"""Tests for the provider factory (Feature 2: data-source-factory)."""

from __future__ import annotations

from collections.abc import Iterator, Sequence

import pytest

from app.config import Settings
from app.domain.unit import UnitType
from app.providers import factory as factory_mod
from app.providers.base import UnitDataProvider
from app.providers.factory import (
    UnknownProviderError,
    available_providers,
    build_unit_provider,
    register_provider,
)


class _DummyProvider(UnitDataProvider):
    def list_units(self) -> Sequence[UnitType]:
        return []

    def get_unit(self, unit_id: str) -> UnitType | None:
        return None


@pytest.fixture(autouse=True)
def _isolate_registry() -> Iterator[None]:
    """Snapshot and restore the global registry around each test."""
    saved = dict(factory_mod._REGISTRY)
    try:
        yield
    finally:
        factory_mod._REGISTRY.clear()
        factory_mod._REGISTRY.update(saved)


def test_builds_the_provider_named_in_settings() -> None:
    register_provider("dummy", _DummyProvider)
    provider = build_unit_provider(Settings(unit_provider="dummy"))
    assert isinstance(provider, _DummyProvider)


def test_unknown_provider_raises_with_available_list() -> None:
    register_provider("dummy", _DummyProvider)
    with pytest.raises(UnknownProviderError) as exc:
        build_unit_provider(Settings(unit_provider="does-not-exist"))
    assert "does-not-exist" in str(exc.value)
    assert "dummy" in str(exc.value)


def test_available_providers_is_sorted() -> None:
    register_provider("zebra", _DummyProvider)
    register_provider("alpha", _DummyProvider)
    names = available_providers()
    assert names == sorted(names)
    assert {"alpha", "zebra"} <= set(names)


def test_registration_overwrites_same_name() -> None:
    class _Other(_DummyProvider):
        pass

    register_provider("dup", _DummyProvider)
    register_provider("dup", _Other)
    assert isinstance(build_unit_provider(Settings(unit_provider="dup")), _Other)


def test_factory_falls_back_to_env_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    register_provider("envprov", _DummyProvider)
    monkeypatch.setenv("BATTLEFUEL_UNIT_PROVIDER", "envprov")
    # No settings passed → factory reads from the environment.
    assert isinstance(build_unit_provider(), _DummyProvider)
