"""Drawn-edge domain models (v2 Wave 20 F4, connect-drawn-to-graph)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

DrawKind = Literal["road", "path"]
ConnectChoice = Literal["first", "last", "both", "none"]


class DrawnEdge(BaseModel):
    """A persisted operator-drawn edge injected into the routing graph."""

    model_config = ConfigDict(frozen=True)

    id: str
    kind: DrawKind
    coordinates: list[list[float]]
    connect_start: bool
    connect_end: bool


class DrawnEdgeCreate(BaseModel):
    """Request to draw a road/path and connect it to the graph.

    ``coordinates`` are ``[lon, lat]`` pairs (>= 2). ``connect`` chooses which endpoint(s) get a
    straight connector to the nearest existing graph vertex.
    """

    model_config = ConfigDict(extra="forbid")

    kind: DrawKind
    coordinates: list[list[float]] = Field(min_length=2)
    connect: ConnectChoice

    @field_validator("coordinates")
    @classmethod
    def _validate_coords(cls, coords: list[list[float]]) -> list[list[float]]:
        for pt in coords:
            if len(pt) != 2:
                raise ValueError("each coordinate must be a [lon, lat] pair")
            lon, lat = pt
            if not -180.0 <= lon <= 180.0:
                raise ValueError(f"lon out of range: {lon}")
            if not -90.0 <= lat <= 90.0:
                raise ValueError(f"lat out of range: {lat}")
        return coords
