"""Turn raw routing paths into commander-facing route options (Wave 3, route-planning-api).

Computes per-unit duration (road speed) and fuel (normal consumption) on top of each
`RoutePath`, for the fastest and safest metrics.
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.route import RouteMetric, RouteMode, RouteOption, RoutePath
from app.domain.unit import UnitType
from app.domain.unit_instance import UnitInstance
from app.providers.routing import RoutingProvider, build_routing_provider_for_mode

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


def pick_route_option(
    metric: RouteMetric, road: RouteOption | None, offroad: RouteOption | None
) -> RouteOption | None:
    """Choose between a road and an off-road option for the hybrid mode (v2 Wave 10).

    FAST → the lower duration. SAFE → the lower threat, then the lower duration. ``None`` inputs
    are skipped; returns ``None`` only when both are missing.
    """
    candidates = [o for o in (road, offroad) if o is not None]
    if not candidates:
        return None
    if metric is RouteMetric.SAFE:
        return min(candidates, key=lambda o: (o.threat_max, o.duration_s))
    return min(candidates, key=lambda o: o.duration_s)


async def _build_for_provider(
    session: AsyncSession,
    provider: RoutingProvider,
    instance: UnitInstance,
    unit_type: UnitType,
    dest_lat: float,
    dest_lon: float,
    metric: RouteMetric,
    label: str,
    *,
    speed_kph: float,
    start_fuel_l: float,
) -> RouteOption | None:
    """Plan one metric with one provider and layer duration/fuel, or None if no path."""
    path = await provider.shortest_path(
        session, instance.lat, instance.lon, dest_lat, dest_lon, metric
    )
    if path is None:
        return None
    return build_option(
        path,
        label=label,
        speed_road_kph=speed_kph,
        consumption_normal_lph=unit_type.fuel.consumption_normal_lph,
        start_fuel_l=start_fuel_l,
    )


async def plan_routes(
    session: AsyncSession,
    routing: RoutingProvider,
    instance: UnitInstance,
    unit_type: UnitType,
    dest_lat: float,
    dest_lon: float,
    *,
    mode: RouteMode = RouteMode.ROAD,
) -> list[RouteOption]:
    """Compute fastest + safest route options from the unit's position to the destination.

    ``mode`` selects the router and the speed: ``road`` uses the injected road provider at road
    speed; ``offroad`` and ``direct`` use the terrain / straight-line routers at off-road speed;
    ``hybrid`` returns, per metric, the better of the road and off-road options.
    """
    road_kph = unit_type.movement.speed_road_kph
    offroad_kph = unit_type.movement.speed_offroad_kph
    start_fuel = (
        instance.current_fuel_liters
        if instance.current_fuel_liters is not None
        else unit_type.fuel.capacity_liters
    )
    options: list[RouteOption] = []
    for metric, label in _METRICS:
        if mode is RouteMode.HYBRID:
            road_opt = await _build_for_provider(
                session,
                routing,
                instance,
                unit_type,
                dest_lat,
                dest_lon,
                metric,
                label,
                speed_kph=road_kph,
                start_fuel_l=start_fuel,
            )
            off_opt = await _build_for_provider(
                session,
                build_routing_provider_for_mode(RouteMode.OFFROAD),
                instance,
                unit_type,
                dest_lat,
                dest_lon,
                metric,
                label,
                speed_kph=offroad_kph,
                start_fuel_l=start_fuel,
            )
            best = pick_route_option(metric, road_opt, off_opt)
            if best is not None:
                options.append(best)
            continue
        provider = routing if mode is RouteMode.ROAD else build_routing_provider_for_mode(mode)
        speed_kph = offroad_kph if mode in (RouteMode.OFFROAD, RouteMode.DIRECT) else road_kph
        opt = await _build_for_provider(
            session,
            provider,
            instance,
            unit_type,
            dest_lat,
            dest_lon,
            metric,
            label,
            speed_kph=speed_kph,
            start_fuel_l=start_fuel,
        )
        if opt is not None:
            options.append(opt)
    return options
