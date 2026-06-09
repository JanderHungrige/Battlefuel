"""Create move orders from a routing request (Wave 3, move-orders)."""

from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.move_order import MoveOrder, MoveOrderStatus
from app.domain.route import RouteMetric, RouteMode
from app.domain.unit import UnitType
from app.domain.unit_instance import UnitInstance
from app.providers.move_orders import MoveOrderProvider
from app.providers.routing import RoutingProvider, build_routing_provider_for_mode
from app.services.route_planner import (
    aggregate_leg_options,
    build_option,
    leg_modes_for,
    plan_legs_per_mode,
    stitch_paths,
)


async def create_move_order(
    session: AsyncSession,
    routing: RoutingProvider,
    orders: MoveOrderProvider,
    instance: UnitInstance,
    unit_type: UnitType,
    dest_lat: float,
    dest_lon: float,
    metric: RouteMetric,
    *,
    mode: RouteMode = RouteMode.ROAD,
) -> MoveOrder | None:
    """Plan the chosen-metric route and persist a pending move order. None if unroutable.

    ``mode`` selects the router and speed: ``road`` (default) uses the injected road provider at
    road speed; ``offroad`` uses the terrain A* router at the unit's off-road / by-foot speed.
    """
    provider = routing if mode is RouteMode.ROAD else build_routing_provider_for_mode(mode)
    speed_kph = (
        unit_type.movement.speed_offroad_kph
        if mode is RouteMode.OFFROAD
        else unit_type.movement.speed_road_kph
    )
    start_fuel = (
        instance.current_fuel_liters
        if instance.current_fuel_liters is not None
        else unit_type.fuel.capacity_liters
    )
    path = await provider.shortest_path(
        session, instance.lat, instance.lon, dest_lat, dest_lon, metric
    )
    if path is None:
        return None
    option = build_option(
        path,
        label=metric.value,
        speed_road_kph=speed_kph,
        consumption_normal_lph=unit_type.fuel.consumption_normal_lph,
        start_fuel_l=start_fuel,
    )
    order = MoveOrder(
        id=uuid.uuid4().hex,
        instance_id=instance.id,
        status=MoveOrderStatus.PENDING,
        metric=metric,
        distance_m=option.distance_m,
        duration_s=option.duration_s,
        fuel_consumed_l=option.fuel_consumed_l,
        progress_m=0.0,
        geometry=path.geometry,
    )
    return await orders.create(session, order)


async def create_move_order_waypoints(
    session: AsyncSession,
    routing: RoutingProvider,
    orders: MoveOrderProvider,
    instance: UnitInstance,
    unit_type: UnitType,
    waypoints: list[tuple[float, float]],
    metric: RouteMetric,
    *,
    mode: RouteMode = RouteMode.ROAD,
    modes: list[RouteMode] | None = None,
) -> MoveOrder | None:
    """Plan the legs through ``waypoints`` (each leg with its own ``modes`` entry, or ``mode`` for
    all), stitch them, and persist a pending move order whose geometry is the full multi-leg path
    (v2 Wave 10; per-leg modes v2 W16 F3). None if unroutable."""
    if not waypoints:
        return None
    leg_modes = leg_modes_for(modes, mode, len(waypoints))
    start_fuel = (
        instance.current_fuel_liters
        if instance.current_fuel_liters is not None
        else unit_type.fuel.capacity_liters
    )
    legs = await plan_legs_per_mode(
        session, routing, unit_type, instance.lat, instance.lon, waypoints, leg_modes, metric
    )
    if legs is None:
        return None
    path = stitch_paths([p for p, _ in legs])
    if path is None:
        return None
    option = aggregate_leg_options(
        legs,
        label=metric.value,
        metric=metric,
        consumption_normal_lph=unit_type.fuel.consumption_normal_lph,
        start_fuel_l=start_fuel,
    )
    if option is None:
        return None
    order = MoveOrder(
        id=uuid.uuid4().hex,
        instance_id=instance.id,
        status=MoveOrderStatus.PENDING,
        metric=metric,
        distance_m=option.distance_m,
        duration_s=option.duration_s,
        fuel_consumed_l=option.fuel_consumed_l,
        progress_m=0.0,
        geometry=path.geometry,
    )
    return await orders.create(session, order)
