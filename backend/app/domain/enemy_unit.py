"""Domain model for an enemy unit (v2 Wave 3, enemy-red-nato-units).

A read-only, located hostile unit rendered as a red APP-6 symbol. Carries its own 20-digit hostile
SIDC (standard identity 6) so the frontend renders it through the existing milsymbol pipeline
without a separate unit-type catalog. Spawn-via-chatter is Wave 4; scenario placement is Wave 7.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class EnemyUnit(BaseModel):
    """A placed hostile unit on the map (render-only this wave)."""

    id: str
    name: str = Field(min_length=1, description="Enemy designation / callsign")
    sidc: str = Field(min_length=20, max_length=20, description="20-digit hostile APP-6 SIDC")
    lat: float
    lon: float
    echelon: str | None = Field(default=None, description="Display echelon, e.g. 'company'")


# APP-6 standard-identity (affiliation) digit position in a 20-digit SIDC: 3 = friend, 6 = hostile.
_AFFILIATION_INDEX = 3


def to_hostile_sidc(sidc: str) -> str:
    """A friendly unit-type SIDC rendered hostile: flip the affiliation digit (index 3, '3'→'6').

    Lets the scenario creator place a red force from the same unit-type catalog as blue (v2 Wave 22
    F1) — the picked type's friendly SIDC becomes its hostile twin.
    """
    if len(sidc) > _AFFILIATION_INDEX:
        return sidc[:_AFFILIATION_INDEX] + "6" + sidc[_AFFILIATION_INDEX + 1 :]
    return sidc


def enemy_unit_frame(unit: EnemyUnit) -> dict[str, object]:
    """The ``enemy_unit`` WebSocket frame for a chatter-driven sighting (v2 Wave 4).

    Additive frame type — existing consumers are untouched; the frontend reduces it into the
    live enemy-unit map and renders a red APP-6 hostile symbol.
    """
    return {
        "type": "enemy_unit",
        "id": unit.id,
        "name": unit.name,
        "sidc": unit.sidc,
        "lat": unit.lat,
        "lon": unit.lon,
        "echelon": unit.echelon,
    }


def enemy_unit_removed_frame(event_id: str) -> dict[str, object]:
    """The ``enemy_unit_removed`` frame: a chatter-driven sighting whose threat event has ended
    (v2 unify-threat-chatter). The frontend drops it from the live enemy-sighting map."""
    return {"type": "enemy_unit_removed", "id": event_id}
