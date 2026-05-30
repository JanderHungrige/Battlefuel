"""The seeded NATO unit-type catalog (Feature 3: seed-unit-catalog).

Every value here is **illustrative/approximate**, chosen to make the game playable
and internally consistent — not authoritative or operational. Fuel volumes and burn
rates are unit-aggregate figures at the stated echelon.

SIDCs are 20-digit MIL-STD-2525D / APP-6(D) codes built by :func:`_sidc` for a
friendly land unit; the exact entity codes are provisional (see the feature doc's
open-research note) but are valid input for the ``milsymbol`` renderer in Wave 2.
"""

from __future__ import annotations

from app.domain.unit import (
    ArmorClass,
    CombatProfile,
    Echelon,
    FuelProfile,
    FuelType,
    MovementProfile,
    NatoUnitType,
    ReconLevel,
    UnitType,
)

# 2525D echelon amplifier codes (positions 9-10).
_ECHELON_CODE: dict[Echelon, str] = {
    Echelon.TEAM: "11",
    Echelon.SQUAD: "12",
    Echelon.SECTION: "13",
    Echelon.PLATOON: "14",
    Echelon.COMPANY: "15",
    Echelon.BATTALION: "16",
    Echelon.BRIGADE: "18",
    Echelon.DIVISION: "21",
}

# 2525D entity codes (positions 11-16) — provisional main-icon mapping.
_ENTITY_CODE: dict[NatoUnitType, str] = {
    NatoUnitType.ARMOR: "120500",
    NatoUnitType.MECHANIZED_INFANTRY: "121102",
    NatoUnitType.INFANTRY: "121100",
    NatoUnitType.ARTILLERY: "130300",
    NatoUnitType.RECONNAISSANCE: "160600",
    NatoUnitType.LOGISTICS: "140000",
    NatoUnitType.FUEL_SUPPLY: "140600",
    NatoUnitType.ENGINEER: "150100",
    NatoUnitType.AIR_DEFENSE: "130100",
    NatoUnitType.SIGNAL: "150400",
    NatoUnitType.MEDICAL: "140900",
    NatoUnitType.HEADQUARTERS: "110000",
}


def _sidc(unit_type: NatoUnitType, echelon: Echelon) -> str:
    """Build a 20-digit friendly land-unit SIDC for the given type and echelon."""
    # 10=version, 0=context(reality), 3=affiliation(friend), 10=land-unit set,
    # 0=status, 0=HQ/TF/dummy, <echelon>, <entity>, 0000=no modifiers.
    return f"10031000{_ECHELON_CODE[echelon]}{_ENTITY_CODE[unit_type]}0000"


def _unit(
    unit_id: str,
    name: str,
    unit_type: NatoUnitType,
    echelon: Echelon,
    recon: ReconLevel,
    *,
    fuel: FuelProfile,
    movement: MovementProfile,
    combat: CombatProfile,
    description: str,
) -> UnitType:
    return UnitType(
        id=unit_id,
        name=name,
        nato_unit_type=unit_type,
        echelon=echelon,
        sidc=_sidc(unit_type, echelon),
        recon_level=recon,
        fuel=fuel,
        movement=movement,
        combat=combat,
        description=description,
    )


SEED_UNITS: tuple[UnitType, ...] = (
    _unit(
        "hq-bn-main",
        "Battalion HQ (Main)",
        NatoUnitType.HEADQUARTERS,
        Echelon.BATTALION,
        ReconLevel.MEDIUM,
        fuel=FuelProfile(
            fuel_type=FuelType.DIESEL,
            capacity_liters=2400,
            consumption_normal_lph=70,
            consumption_combat_lph=95,
            consumption_idle_lph=18,
        ),
        movement=MovementProfile(
            speed_road_kph=70, speed_offroad_kph=35, speed_combat_kph=20, operational_range_km=600
        ),
        combat=CombatProfile(
            combat_power=15, armor_class=ArmorClass.LIGHT, crew=40, weight_tons=12
        ),
        description="Command and control element for a manoeuvre battalion.",
    ),
    _unit(
        "armor-tank-coy",
        "Tank Company",
        NatoUnitType.ARMOR,
        Echelon.COMPANY,
        ReconLevel.LOW,
        fuel=FuelProfile(
            fuel_type=FuelType.DIESEL,
            capacity_liters=18000,
            consumption_normal_lph=900,
            consumption_combat_lph=1600,
            consumption_idle_lph=120,
        ),
        movement=MovementProfile(
            speed_road_kph=60, speed_offroad_kph=40, speed_combat_kph=25, operational_range_km=450
        ),
        combat=CombatProfile(
            combat_power=90, armor_class=ArmorClass.HEAVY, crew=56, weight_tons=62
        ),
        description="Main battle tank company; high combat power, heavy fuel demand.",
    ),
    _unit(
        "mech-inf-coy",
        "Mechanized Infantry Company",
        NatoUnitType.MECHANIZED_INFANTRY,
        Echelon.COMPANY,
        ReconLevel.MEDIUM,
        fuel=FuelProfile(
            fuel_type=FuelType.DIESEL,
            capacity_liters=9000,
            consumption_normal_lph=520,
            consumption_combat_lph=860,
            consumption_idle_lph=70,
        ),
        movement=MovementProfile(
            speed_road_kph=70, speed_offroad_kph=45, speed_combat_kph=22, operational_range_km=500
        ),
        combat=CombatProfile(
            combat_power=65, armor_class=ArmorClass.MEDIUM, crew=120, weight_tons=28
        ),
        description="Infantry mounted in IFVs; balanced mobility and firepower.",
    ),
    _unit(
        "inf-coy",
        "Infantry Company (Light)",
        NatoUnitType.INFANTRY,
        Echelon.COMPANY,
        ReconLevel.MEDIUM,
        fuel=FuelProfile(
            fuel_type=FuelType.DIESEL,
            capacity_liters=1800,
            consumption_normal_lph=110,
            consumption_combat_lph=160,
            consumption_idle_lph=15,
        ),
        movement=MovementProfile(
            speed_road_kph=55, speed_offroad_kph=12, speed_combat_kph=6, operational_range_km=400
        ),
        combat=CombatProfile(combat_power=45, armor_class=ArmorClass.NONE, crew=130, weight_tons=4),
        description="Dismounted infantry with soft-skin transport; low fuel footprint.",
    ),
    _unit(
        "inf-squad-dismounted",
        "Infantry Squad (Dismounted)",
        NatoUnitType.INFANTRY,
        Echelon.SQUAD,
        ReconLevel.LOW,
        fuel=FuelProfile(
            fuel_type=FuelType.NONE,
            capacity_liters=0,
            consumption_normal_lph=0,
            consumption_combat_lph=0,
            consumption_idle_lph=0,
        ),
        movement=MovementProfile(
            speed_road_kph=6, speed_offroad_kph=4, speed_combat_kph=2, operational_range_km=40
        ),
        combat=CombatProfile(combat_power=8, armor_class=ArmorClass.NONE, crew=9, weight_tons=1),
        description="Foot-mobile squad with no organic fuel demand (endurance is None).",
    ),
    _unit(
        "arty-bty",
        "Artillery Battery (155mm SP)",
        NatoUnitType.ARTILLERY,
        Echelon.COMPANY,
        ReconLevel.LOW,
        fuel=FuelProfile(
            fuel_type=FuelType.DIESEL,
            capacity_liters=7600,
            consumption_normal_lph=420,
            consumption_combat_lph=540,
            consumption_idle_lph=60,
        ),
        movement=MovementProfile(
            speed_road_kph=55, speed_offroad_kph=30, speed_combat_kph=15, operational_range_km=380
        ),
        combat=CombatProfile(
            combat_power=80, armor_class=ArmorClass.MEDIUM, crew=90, weight_tons=42
        ),
        description="Self-propelled 155mm battery; long-range indirect fires.",
    ),
    _unit(
        "recon-troop",
        "Reconnaissance Troop",
        NatoUnitType.RECONNAISSANCE,
        Echelon.COMPANY,
        ReconLevel.HIGH,
        fuel=FuelProfile(
            fuel_type=FuelType.DIESEL,
            capacity_liters=5200,
            consumption_normal_lph=300,
            consumption_combat_lph=480,
            consumption_idle_lph=45,
        ),
        movement=MovementProfile(
            speed_road_kph=95, speed_offroad_kph=55, speed_combat_kph=35, operational_range_km=700
        ),
        combat=CombatProfile(
            combat_power=35, armor_class=ArmorClass.LIGHT, crew=60, weight_tons=18
        ),
        description="Fast, sensor-rich screening force; highest recon level.",
    ),
    _unit(
        "fuel-supply-pl",
        "Fuel Supply Platoon",
        NatoUnitType.FUEL_SUPPLY,
        Echelon.PLATOON,
        ReconLevel.NONE,
        fuel=FuelProfile(
            fuel_type=FuelType.DIESEL,
            capacity_liters=4000,
            consumption_normal_lph=180,
            consumption_combat_lph=240,
            consumption_idle_lph=25,
        ),
        movement=MovementProfile(
            speed_road_kph=65, speed_offroad_kph=20, speed_combat_kph=10, operational_range_km=650
        ),
        combat=CombatProfile(combat_power=5, armor_class=ArmorClass.NONE, crew=30, weight_tons=20),
        description="Bulk fuel distribution element; the supply chain's delivery arm.",
    ),
    _unit(
        "log-coy",
        "Logistics Company",
        NatoUnitType.LOGISTICS,
        Echelon.COMPANY,
        ReconLevel.LOW,
        fuel=FuelProfile(
            fuel_type=FuelType.DIESEL,
            capacity_liters=6000,
            consumption_normal_lph=300,
            consumption_combat_lph=380,
            consumption_idle_lph=40,
        ),
        movement=MovementProfile(
            speed_road_kph=65, speed_offroad_kph=22, speed_combat_kph=12, operational_range_km=600
        ),
        combat=CombatProfile(combat_power=8, armor_class=ArmorClass.NONE, crew=110, weight_tons=24),
        description="General supply, transport, and maintenance support.",
    ),
    _unit(
        "engineer-pl",
        "Engineer Platoon",
        NatoUnitType.ENGINEER,
        Echelon.PLATOON,
        ReconLevel.LOW,
        fuel=FuelProfile(
            fuel_type=FuelType.DIESEL,
            capacity_liters=3200,
            consumption_normal_lph=210,
            consumption_combat_lph=300,
            consumption_idle_lph=30,
        ),
        movement=MovementProfile(
            speed_road_kph=50, speed_offroad_kph=25, speed_combat_kph=12, operational_range_km=350
        ),
        combat=CombatProfile(
            combat_power=20, armor_class=ArmorClass.LIGHT, crew=35, weight_tons=30
        ),
        description="Mobility, counter-mobility, and survivability tasks (incl. minefields).",
    ),
    _unit(
        "air-defense-bty",
        "Air Defense Battery (SHORAD)",
        NatoUnitType.AIR_DEFENSE,
        Echelon.COMPANY,
        ReconLevel.MEDIUM,
        fuel=FuelProfile(
            fuel_type=FuelType.DIESEL,
            capacity_liters=5600,
            consumption_normal_lph=320,
            consumption_combat_lph=470,
            consumption_idle_lph=55,
        ),
        movement=MovementProfile(
            speed_road_kph=60, speed_offroad_kph=35, speed_combat_kph=18, operational_range_km=420
        ),
        combat=CombatProfile(
            combat_power=50, armor_class=ArmorClass.MEDIUM, crew=70, weight_tons=34
        ),
        description="Short-range air defense protecting the manoeuvre force.",
    ),
    _unit(
        "medical-pl",
        "Medical Platoon",
        NatoUnitType.MEDICAL,
        Echelon.PLATOON,
        ReconLevel.NONE,
        fuel=FuelProfile(
            fuel_type=FuelType.DIESEL,
            capacity_liters=2200,
            consumption_normal_lph=120,
            consumption_combat_lph=160,
            consumption_idle_lph=20,
        ),
        movement=MovementProfile(
            speed_road_kph=70, speed_offroad_kph=25, speed_combat_kph=12, operational_range_km=500
        ),
        combat=CombatProfile(combat_power=3, armor_class=ArmorClass.NONE, crew=28, weight_tons=10),
        description="Casualty collection, treatment, and evacuation.",
    ),
)
