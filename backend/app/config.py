"""Application configuration.

Settings are read from environment variables prefixed with ``BATTLEFUEL_`` (or a
local ``.env`` file). The one setting that matters in Wave 1 is ``unit_provider``,
which selects the concrete :class:`~app.providers.base.UnitDataProvider` built by the
factory — the single swap point for seed data → real values → live streams.
"""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration, populated from the environment."""

    model_config = SettingsConfigDict(
        env_prefix="BATTLEFUEL_",
        env_file=".env",
        extra="ignore",
    )

    # Name of the unit data provider the factory should build (e.g. "seed").
    unit_provider: str = "seed"


def get_settings() -> Settings:
    """Return a freshly-read :class:`Settings` instance.

    Kept as a function (not a module-level singleton) so tests can mutate the
    environment and observe the change without import-order surprises.
    """

    return Settings()
