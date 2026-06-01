"""Create move orders from a routing request (Wave 3, move-orders)."""

from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.move_order import MoveOrder, MoveOrderStatus
from app.domain.route import RouteMetric
from app.domain.unit import UnitType
from app.domain.unit_instance import UnitInstance
from app.providers.move_orders import MoveOrderProvider
from app.providers.routing import RoutingProvider
from app.services.route_planner import build_option


async def create_move_order(
    session: AsyncSession,
    routing: RoutingProvider,
    orders: MoveOrderProvider,
    instance: UnitInstance,
    unit_type: UnitType,
    dest_lat: float,
    dest_lon: float,
    metric: RouteMetric,
) -> MoveOrder | None:
    """Plan the chosen-metric route and persist a pending move order. None if unroutable."""
    start_fuel = (
        instance.current_fuel_liters
        if instance.current_fuel_liters is not None
        else unit_type.fuel.capacity_liters
    )
    path = await routing.shortest_path(
        session, instance.lat, instance.lon, dest_lat, dest_lon, metric
    )
    if path is None:
        return None
    option = build_option(
        path,
        label=metric.value,
        speed_road_kph=unit_type.movement.speed_road_kph,
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
