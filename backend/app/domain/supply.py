"""Domain models for the fuel supply layer (Wave 5 Feature 1: fuel-supply-model).

A :class:`FuelDepot` is a fixed supply location; a :class:`FuelStock` is how much of one
fuel type that depot currently holds (and its capacity for that type). Mobile fuel trucks are
*not* modelled here — they are ordinary ``UnitInstance``s whose carried fuel is their
``current_fuel_liters``. These are the API/domain representations; persistence lives in
``models/supply.py`` and access goes through ``providers/supply.py``.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from app.domain.unit import FuelType


class FuelDepot(BaseModel):
    """A fixed fuel supply point in the theater (API representation)."""

    model_config = ConfigDict(frozen=True)

    id: str
    name: str = Field(min_length=1, description="Display name, e.g. 'Main Supply Point'")
    h3_index: str
    lat: float
    lon: float


class FuelStock(BaseModel):
    """How much of one fuel type a depot holds, and its capacity for that type."""

    model_config = ConfigDict(frozen=True)

    depot_id: str
    fuel_type: FuelType
    quantity_liters: float = Field(ge=0)
    capacity_liters: float = Field(ge=0)
