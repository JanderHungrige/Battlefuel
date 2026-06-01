"""Obstacle domain models (Wave 4, manual-obstacles)."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class Obstacle(BaseModel):
    """A placed obstacle that blocks an H3 cell for routing."""

    model_config = ConfigDict(frozen=True)

    id: str
    h3_index: str
    kind: str = "manual"


class ObstacleCreate(BaseModel):
    """Request to place an obstacle at a map location."""

    model_config = ConfigDict(extra="forbid")

    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    kind: str = Field(default="manual", max_length=40)
