"""Plan a move with a refuel stop on the way (v2 Wave 13 F6).

When a unit is planning a move to a destination, this inserts the nearest compatible tanker as a
rendezvous **on the way** — preferring a meeting cell outside a threat tile — and stitches it into
the move (``unit → rendezvous → dest``) while dispatching the tanker and wiring the refuel. The
existing co-location transfer (W12) tops the unit off when they meet; the unit then continues to
its destination. Reuses ``create_move_order`` / ``create_move_order_waypoints`` and the F1 pattern.
"""

from __future__ import annotations

import uuid

import h3
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.move_order import MoveOrder, MoveOrderStatus
from app.domain.refuel import RefuelOrder, RefuelOrderStatus
from app.domain.route import RouteMetric, RouteMode, RouteOption
from app.domain.unit import NatoUnitType
from app.domain.unit_instance import UnitInstance
from app.providers.base import UnitDataProvider
from app.providers.move_orders import MoveOrderProvider
from app.providers.refuel_orders import RefuelOrderProvider
from app.providers.routing import RoutingProvider
from app.providers.tiles import TileDataProvider
from app.providers.unit_instances import UnitInstanceProvider
from app.services.move_order_service import create_move_order, create_move_order_waypoints
from app.services.route_planner import plan_routes, plan_waypoint_routes
from app.services.sim import THREAT_L5, haversine_m
from app.services.tile_grid import DEFAULT_RESOLUTION, cell_center

# Cap how many tanker options the operator clicks through (the nearest few).
MAX_REFUEL_OPTIONS = 4


class MoveRefuelResult:
    """The orders a move-with-refuel starts, plus the chosen rendezvous cell."""

    def __init__(
        self,
        sector_lat: float,
        sector_lon: float,
        sector_h3: str,
        unit_move_order: MoveOrder,
        tanker_move_order: MoveOrder,
        refuel_order: RefuelOrder,
    ) -> None:
        self.sector_lat = sector_lat
        self.sector_lon = sector_lon
        self.sector_h3 = sector_h3
        self.unit_move_order = unit_move_order
        self.tanker_move_order = tanker_move_order
        self.refuel_order = refuel_order


def _compatible_tankers(
    unit: UnitInstance,
    instances: list[UnitInstance],
    units: UnitDataProvider,
    fuel_type: object,
) -> list[UnitInstance]:
    """Fuelled FUEL_SUPPLY instances of the unit's fuel type, nearest first (great-circle)."""
    candidates: list[UnitInstance] = []
    for inst in instances:
        if inst.id == unit.id:
            continue
        t = units.get_unit(inst.unit_type_id)
        if t is None or t.nato_unit_type is not NatoUnitType.FUEL_SUPPLY:
            continue
        if t.fuel.fuel_type is not fuel_type:
            continue
        if (inst.current_fuel_liters or 0.0) <= 0.0:
            continue
        candidates.append(inst)
    candidates.sort(key=lambda t: haversine_m(unit.lon, unit.lat, t.lon, t.lat))
    return candidates


def _option_for(routes: list[RouteOption], metric: RouteMetric) -> RouteOption | None:
    if not routes:
        return None
    for opt in routes:
        if opt.metric is metric:
            return opt
    return routes[0]


class MoveRefuelOption:
    """One previewed refuel-stop choice: a tanker + the stitched unit route + the tanker's leg."""

    def __init__(
        self,
        truck_id: str,
        truck_name: str,
        sector_lat: float,
        sector_lon: float,
        sector_h3: str,
        unit_geometry: list[list[float]],
        tanker_geometry: list[list[float]],
        unit_fuel_l: float,
        tanker_fuel_l: float,
        threat_max: int,
    ) -> None:
        self.truck_id = truck_id
        self.truck_name = truck_name
        self.sector_lat = sector_lat
        self.sector_lon = sector_lon
        self.sector_h3 = sector_h3
        self.unit_geometry = unit_geometry
        self.tanker_geometry = tanker_geometry
        self.unit_fuel_l = unit_fuel_l
        self.tanker_fuel_l = tanker_fuel_l
        self.threat_max = threat_max


async def _rendezvous_cell(
    session: AsyncSession, tiles: TileDataProvider, tanker: UnitInstance
) -> str:
    """The tanker's cell, nudged to the nearest non-threat ring-1 neighbour if it sits in threat."""
    cell = tanker.h3_index or h3.latlng_to_cell(tanker.lat, tanker.lon, DEFAULT_RESOLUTION)
    tile = await tiles.get_tile(session, cell)
    if tile is None or tile.threat_level < THREAT_L5:
        return cell
    best: tuple[float, str] | None = None
    for nb in h3.grid_disk(cell, 1):
        if nb == cell:
            continue
        nb_tile = await tiles.get_tile(session, nb)
        if nb_tile is None or nb_tile.threat_level >= THREAT_L5:
            continue
        clat, clon = cell_center(nb)
        d = haversine_m(tanker.lon, tanker.lat, clon, clat)
        if best is None or d < best[0]:
            best = (d, nb)
    return best[1] if best is not None else cell


async def plan_move_refuel_options(
    session: AsyncSession,
    routing: RoutingProvider,
    instances: UnitInstanceProvider,
    units: UnitDataProvider,
    tiles: TileDataProvider,
    *,
    instance_id: str,
    dest_lat: float,
    dest_lon: float,
    metric: RouteMetric,
    mode: RouteMode = RouteMode.ROAD,
) -> list[MoveRefuelOption]:
    """Preview the nearest few refuel-stop choices WITHOUT dispatching: for each candidate tanker,
    the stitched unit route (unit → rendezvous → dest) + the tanker's leg + fuel/threat. The
    operator clicks through these and confirms one (which then executes). ``LookupError`` (→ 404)
    for an unknown unit (v2 W13 correction)."""
    unit = await instances.get_instance(session, instance_id)
    if unit is None:
        raise LookupError(f"unit {instance_id!r} not found")
    unit_type = units.get_unit(unit.unit_type_id)
    if unit_type is None:
        raise LookupError("unit type missing from catalog")

    fuel_type = unit_type.fuel.fuel_type
    tankers = _compatible_tankers(
        unit, list(await instances.list_instances(session)), units, fuel_type
    )[:MAX_REFUEL_OPTIONS]
    options: list[MoveRefuelOption] = []
    for tanker in tankers:
        tanker_type = units.get_unit(tanker.unit_type_id)
        if tanker_type is None:
            continue
        cell = await _rendezvous_cell(session, tiles, tanker)
        rdv_lat, rdv_lon = cell_center(cell)
        unit_routes = await plan_waypoint_routes(
            session, routing, unit, unit_type, [(rdv_lat, rdv_lon), (dest_lat, dest_lon)], mode=mode
        )
        tanker_routes = await plan_routes(
            session, routing, tanker, tanker_type, rdv_lat, rdv_lon, mode=mode
        )
        u = _option_for(unit_routes, metric)
        t = _option_for(tanker_routes, metric)
        if u is None or t is None:
            continue
        options.append(
            MoveRefuelOption(
                truck_id=tanker.id,
                truck_name=tanker.name,
                sector_lat=rdv_lat,
                sector_lon=rdv_lon,
                sector_h3=cell,
                unit_geometry=u.geometry,
                tanker_geometry=t.geometry,
                unit_fuel_l=u.fuel_consumed_l,
                tanker_fuel_l=t.fuel_consumed_l,
                threat_max=max(u.threat_max, t.threat_max),
            )
        )
    return options


async def plan_move_with_refuel(
    session: AsyncSession,
    routing: RoutingProvider,
    move_orders: MoveOrderProvider,
    refuel_orders: RefuelOrderProvider,
    instances: UnitInstanceProvider,
    units: UnitDataProvider,
    tiles: TileDataProvider,
    *,
    instance_id: str,
    dest_lat: float,
    dest_lon: float,
    metric: RouteMetric,
    mode: RouteMode = RouteMode.ROAD,
    truck_id: str | None = None,
) -> MoveRefuelResult | None:
    """Stitch a refuel stop into a unit's move and dispatch it. Uses the chosen ``truck_id`` when
    given (the operator's pick from the options), else the nearest compatible tanker. ``None`` if no
    tanker / unroutable; ``LookupError`` (→ 404) for an unknown unit."""
    unit = await instances.get_instance(session, instance_id)
    if unit is None:
        raise LookupError(f"unit {instance_id!r} not found")
    unit_type = units.get_unit(unit.unit_type_id)
    if unit_type is None:
        raise LookupError("unit type missing from catalog")

    fuel_type = unit_type.fuel.fuel_type
    tankers = _compatible_tankers(
        unit, list(await instances.list_instances(session)), units, fuel_type
    )
    tanker = (
        next((t for t in tankers if t.id == truck_id), None)
        if truck_id is not None
        else (tankers[0] if tankers else None)
    )
    if tanker is None:
        return None
    tanker_type = units.get_unit(tanker.unit_type_id)
    if tanker_type is None:
        return None

    cell = await _rendezvous_cell(session, tiles, tanker)
    rdv_lat, rdv_lon = cell_center(cell)

    # Unit: unit → rendezvous → destination (refuel stop stitched in).
    unit_move = await create_move_order_waypoints(
        session,
        routing,
        move_orders,
        unit,
        unit_type,
        [(rdv_lat, rdv_lon), (dest_lat, dest_lon)],
        metric,
        mode=mode,
    )
    if unit_move is None:
        return None
    # Tanker drives to the rendezvous.
    tanker_move = await create_move_order(
        session, routing, move_orders, tanker, tanker_type, rdv_lat, rdv_lon, metric, mode=mode
    )
    if tanker_move is None:
        await move_orders.set_status(session, unit_move.id, MoveOrderStatus.CANCELLED)
        return None

    refuel: RefuelOrder | None = await refuel_orders.create(
        session,
        RefuelOrder(
            id=uuid.uuid4().hex,
            unit_id=unit.id,
            truck_id=tanker.id,
            depot_id=None,
            fuel_type=fuel_type,
            status=RefuelOrderStatus.PENDING,
            rendezvous_lat=rdv_lat,
            rendezvous_lon=rdv_lon,
            rendezvous_h3=cell,
        ),
    )
    if refuel is None:
        await move_orders.set_status(session, unit_move.id, MoveOrderStatus.CANCELLED)
        await move_orders.set_status(session, tanker_move.id, MoveOrderStatus.CANCELLED)
        return None

    unit_move = (
        await move_orders.set_status(session, unit_move.id, MoveOrderStatus.ACTIVE) or unit_move
    )
    tanker_move = (
        await move_orders.set_status(session, tanker_move.id, MoveOrderStatus.ACTIVE) or tanker_move
    )
    refuel = await refuel_orders.set_status(session, refuel.id, RefuelOrderStatus.ACTIVE) or refuel
    return MoveRefuelResult(rdv_lat, rdv_lon, cell, unit_move, tanker_move, refuel)
