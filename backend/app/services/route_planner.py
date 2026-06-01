"""Turn raw routing paths into commander-facing route options (Wave 3, route-planning-api).

Computes per-unit duration (road speed) and fuel (normal consumption) on top of each
`RoutePath`, for the fastest and safest metrics.
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.route import RouteMetric, RouteOption, RoutePath
from app.domain.unit import UnitType
from app.domain.unit_instance import UnitInstance
from app.providers.routing import RoutingProvider

_METRICS: tuple[tuple[RouteMetric, str], ...] = (
    (RouteMetric.FAST, "fastest"),
    (RouteMetric.SAFE, "safest"),
)


def build_option(
    path: RoutePath,
    *,
    label: str,
    speed_road_kph: float,
    consumption_normal_lph: float,
    start_fuel_l: float,
) -> RouteOption:
    """Layer duration + fuel onto a path. Pure (no I/O).

    Duration uses the terrain-aware ``effective_distance_m`` (Σ time_cost) and fuel uses
    ``fuel_distance_m`` (Σ fuel_factor·time_cost), so the estimate matches the sim's live burn.
    Paths computed before annotation (sums == 0) fall back to real distance.
    """
    effective_m = path.effective_distance_m if path.effective_distance_m > 0 else path.distance_m
    fuel_basis_m = path.fuel_distance_m if path.fuel_distance_m > 0 else path.distance_m
    duration_h = (effective_m / 1000.0) / speed_road_kph if speed_road_kph > 0 else 0.0
    fuel_consumed = (
        consumption_normal_lph * (fuel_basis_m / 1000.0) / speed_road_kph
        if speed_road_kph > 0
        else 0.0
    )
    remaining = start_fuel_l - fuel_consumed
    return RouteOption(
        label=label,
        metric=path.metric,
        geometry=path.geometry,
        distance_m=round(path.distance_m, 1),
        duration_s=round(duration_h * 3600, 1),
        threat_max=path.threat_max,
        threat_avg=round(path.threat_avg, 3),
        fuel_consumed_l=round(fuel_consumed, 1),
        fuel_remaining_l=round(max(0.0, remaining), 1),
        sufficient_fuel=remaining >= 0,
    )


async def plan_routes(
    session: AsyncSession,
    routing: RoutingProvider,
    instance: UnitInstance,
    unit_type: UnitType,
    dest_lat: float,
    dest_lon: float,
) -> list[RouteOption]:
    """Compute fastest + safest route options from the unit's position to the destination."""
    start_fuel = (
        instance.current_fuel_liters
        if instance.current_fuel_liters is not None
        else unit_type.fuel.capacity_liters
    )
    options: list[RouteOption] = []
    for metric, label in _METRICS:
        path = await routing.shortest_path(
            session, instance.lat, instance.lon, dest_lat, dest_lon, metric
        )
        if path is None:
            continue
        options.append(
            build_option(
                path,
                label=label,
                speed_road_kph=unit_type.movement.speed_road_kph,
                consumption_normal_lph=unit_type.fuel.consumption_normal_lph,
                start_fuel_l=start_fuel,
            )
        )
    return options
