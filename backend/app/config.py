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

    # Scripted "incoming sector info" tile feed: superseded by the catalog EventEngine
    # (unify-threat-chatter), so disabled by default. "scripted" or "none".
    tile_feed_provider: str = "none"

    # Scripted OF-8 strategic-support message feed (Wave 5): "scripted" or "none".
    strategic_feed_provider: str = "scripted"

    # Combat-event CSV catalog: the single source the EventEngine fires from, and the F7 obstacle
    # picker reads. "csv_catalog" or "none".
    combat_event_catalog_provider: str = "csv_catalog"
    combat_event_catalog_path: str = "data/combat_zone_events.csv"

    # Enemy-unit provider (v2 Wave 3): "seed" (Hohenfels stub) or "none".
    enemy_unit_provider: str = "seed"

    # Provider the factory builds for manual obstacles (Wave 4 ships "db").
    obstacle_provider: str = "db"

    # Provider the factory builds for fuel depots + stock (Wave 5 ships "db").
    supply_provider: str = "db"

    # Provider the factory builds for refuel orders (Wave 5 ships "db").
    refuel_order_provider: str = "db"

    # Refuel truck-selection strategy (Wave 5 ships "nearest"; "ortools" arrives in Wave 6).
    refuel_recommender: str = "nearest"

    # Provider the factory builds for buy orders (Wave 5 ships "db").
    buy_order_provider: str = "db"

    # Provider the factory builds for fuel-management platforms (v2 Wave 11 ships "db").
    fuel_platform_provider: str = "db"

    # Provider the factory builds for scheduled rendezvous orders (v2 Wave 13 ships "db").
    rendezvous_order_provider: str = "db"

    # Default fuel-procurement lead time in game-seconds (overridable per buy order).
    buy_order_lead_time_game_s: float = 600.0

    # Catalog event engine (unify-threat-chatter): master toggle + mean interval between located
    # events. 900 game-s ≈ 15 real-s at sim_time_scale=60. Each event reverts (threat/road restored,
    # last_event cleared, enemy removed) after event_revert_game_s, so threats disappear over time.
    game_mode: bool = True
    event_mean_interval_game_s: float = 900.0
    event_revert_game_s: float = 3600.0

    # Light-threat decay (v2 Wave 14): each decay interval (game-seconds), every tile at threat
    # 1..light_threat_max has threat_decay_chance of dropping one level — a gradual, probabilistic
    # fade (not a synchronized purge), so transient light threats (e.g. drone sightings) clear over
    # time while the contested east stays populated.
    threat_decay_interval_game_s: float = 600.0
    threat_decay_chance: float = 0.2
    light_threat_max: int = 2

    # Simulation game-time scale (1 real second = sim_time_scale game seconds).
    sim_time_scale: float = 60.0
    # Simulation tick interval in real seconds.
    sim_tick_seconds: float = 1.0
    # Max metres a unit advances per broadcast frame. A tick's movement is split into sub-steps
    # of at most this distance so on-screen movement is smooth (v2 Wave 10, smaller-movement-ticks).
    sim_max_step_m: float = 200.0

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
