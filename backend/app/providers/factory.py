"""The provider factory and its registry.

Providers register themselves by name; :func:`build_unit_provider` looks up the
name from config and constructs the matching provider. Adding a new data source
means writing a provider and calling :func:`register_provider` — no edit to this
file, no change to any consumer. That is the swap point the project is built around.
"""

from __future__ import annotations

from collections.abc import Callable

from app.config import Settings, get_settings
from app.providers.base import UnitDataProvider

ProviderBuilder = Callable[[], UnitDataProvider]

_REGISTRY: dict[str, ProviderBuilder] = {}


class UnknownProviderError(ValueError):
    """Raised when config names a provider that is not registered."""


def register_provider(name: str, builder: ProviderBuilder) -> None:
    """Register ``builder`` under ``name`` (overwrites a prior registration)."""
    _REGISTRY[name] = builder


def available_providers() -> list[str]:
    """Return the sorted names of all registered providers."""
    return sorted(_REGISTRY)


def build_unit_provider(settings: Settings | None = None) -> UnitDataProvider:
    """Construct the unit provider named by ``settings.unit_provider``.

    Raises :class:`UnknownProviderError` if no provider is registered under that name.
    """
    settings = settings or get_settings()
    name = settings.unit_provider
    try:
        builder = _REGISTRY[name]
    except KeyError as exc:
        raise UnknownProviderError(
            f"unknown unit provider {name!r}; available: {available_providers()}"
        ) from exc
    return builder()
