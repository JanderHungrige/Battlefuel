"""Domain models for the fuel supply layer (Wave 5 Feature 1: fuel-supply-model).

A :class:`FuelDepot` is a fixed supply location; a :class:`FuelStock` is how much of one
fuel type that depot currently holds (and its capacity for that type). Mobile fuel trucks are
*not* modelled here — they are ordinary ``UnitInstance``s whose carried fuel is their
``current_fuel_liters``. These are the API/domain representations; persistence lives in
``models/supply.py`` and access goes through ``providers/supply.py``.
"""

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field

from app.domain.unit import FuelType


class LogisticSiteType(StrEnum):
    """NATO JLSG logistic site types (AJP-4.6, v2 Wave 11 F5).

    A plain depot has no site type (``site_type=None``); a typed site carries one of these.
    """

    BSA = "bsa"  # Brigade Support Area
    CSSBN = "cssbn"  # LCC Combat Service Support Battalion
    DOB = "dob"  # Deployable Operating Base (ACC)
    FLS = "fls"  # Forward Logistic Site (MCC)
    TLB = "tlb"  # Theatre Logistic Base


class FuelDepot(BaseModel):
    """A fixed fuel supply point in the theater (API representation)."""

    model_config = ConfigDict(frozen=True)

    id: str
    name: str = Field(min_length=1, description="Display name, e.g. 'Main Supply Point'")
    h3_index: str
    lat: float
    lon: float
    # NATO JLSG site type (v2 Wave 11 F5); None for a plain depot/marker.
    site_type: LogisticSiteType | None = None


class FuelStock(BaseModel):
    """How much of one fuel type a depot holds, and its capacity for that type."""

    model_config = ConfigDict(frozen=True)

    depot_id: str
    fuel_type: FuelType
    quantity_liters: float = Field(ge=0)
    capacity_liters: float = Field(ge=0)


class DepotFuel(BaseModel):
    """A depot together with its current per-fuel-type stock (overview aggregate)."""

    model_config = ConfigDict(frozen=True)

    depot: FuelDepot
    stocks: list[FuelStock]


class TruckFuel(BaseModel):
    """A mobile fuel truck's carried fuel (a ``UnitInstance`` of a FUEL_SUPPLY unit type)."""

    model_config = ConfigDict(frozen=True)

    instance_id: str
    name: str
    unit_type_id: str
    fuel_type: FuelType
    # None = no telemetry (excluded from the truck total, per the missing-telemetry model).
    current_fuel_liters: float | None = Field(default=None, ge=0)
    capacity_liters: float = Field(ge=0)
    lat: float
    lon: float
    h3_index: str


class SupplyOverview(BaseModel):
    """The OF-8 distribution picture: fixed-depot stock + mobile-truck fuel + totals."""

    model_config = ConfigDict(frozen=True)

    depots: list[DepotFuel]
    trucks: list[TruckFuel]
    total_depot_liters_by_type: dict[str, float]
    total_truck_liters: float
