"""Domain model for a placed unit instance (Wave 2 Feature 4: unit-instances).

An instance is a concrete unit on the map: it references a Wave 1 ``UnitType`` (by id),
has a position (and the H3 tile it sits on), an operational status, and an optional current
fuel level. Fuel is *optional* on purpose — a ``None`` value models "no telemetry received",
which later surfaces a "request manual update" action. Movement/fuel burn is Wave 3.
"""

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field


class InstanceStatus(StrEnum):
    OPERATIONAL = "operational"
    DEGRADED = "degraded"
    NON_OPERATIONAL = "non_operational"
    UNKNOWN = "unknown"


class UnitInstance(BaseModel):
    """A unit placed in the theater (API representation)."""

    model_config = ConfigDict(frozen=True)

    id: str
    name: str = Field(min_length=1, description="Callsign / unit designation")
    unit_type_id: str = Field(description="References a UnitType.id from the catalog")
    lat: float
    lon: float
    h3_index: str
    status: InstanceStatus
    # None = no telemetry received (drives the 'request manual update' affordance).
    current_fuel_liters: float | None = Field(default=None, ge=0)

    @property
    def has_telemetry(self) -> bool:
        return self.current_fuel_liters is not None
