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

    # Async SQLAlchemy database URL (PostgreSQL + PostGIS via asyncpg).
    database_url: str = "postgresql+asyncpg://battlefuel:battlefuel@localhost:5432/battlefuel"

    # Provider the factory builds for map tiles (Wave 2 ships "db").
    tile_provider: str = "db"

    # Provider the factory builds for placed unit instances (Wave 2 ships "db").
    unit_instance_provider: str = "db"

    # Provider the factory builds for routing (Wave 3 ships "pgrouting").
    routing_provider: str = "pgrouting"

    # Provider the factory builds for move orders (Wave 3 ships "db").
    move_order_provider: str = "db"

    # Scripted "incoming sector info" tile feed (Wave 4): "scripted" or "none".
    tile_feed_provider: str = "scripted"

    # Provider the factory builds for manual obstacles (Wave 4 ships "db").
    obstacle_provider: str = "db"

    # Provider the factory builds for fuel depots + stock (Wave 5 ships "db").
    supply_provider: str = "db"

    # Provider the factory builds for refuel orders (Wave 5 ships "db").
    refuel_order_provider: str = "db"

    # Refuel truck-selection strategy (Wave 5 ships "nearest"; "ortools" arrives in Wave 6).
    refuel_recommender: str = "nearest"

    # Random event engine (Wave 4): master toggle + mean interval between events in game-seconds.
    game_mode: bool = True
    event_mean_interval_game_s: float = 120.0

    # Simulation game-time scale (1 real second = sim_time_scale game seconds).
    sim_time_scale: float = 60.0
    # Simulation tick interval in real seconds.
    sim_tick_seconds: float = 1.0

    # Browser origins allowed to call the API (CORS). Dev defaults to the Vite server.
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]


def get_settings() -> Settings:
    """Return a freshly-read :class:`Settings` instance.

    Kept as a function (not a module-level singleton) so tests can mutate the
    environment and observe the change without import-order surprises.
    """

    return Settings()
