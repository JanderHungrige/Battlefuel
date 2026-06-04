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


def stitch_paths(paths: list[RoutePath]) -> RoutePath | None:
    """Concatenate ordered route legs into one path (v2 Wave 10, waypoint-routing).

    Drops a leg's first point when it duplicates the previous leg's last (the shared waypoint),
    sums distance/effective/fuel, takes the max threat and the distance-weighted average threat.
    Returns None if there are no legs.
    """
    legs = [p for p in paths if p is not None]
    if not legs:
        return None
    geometry: list[list[float]] = []
    for leg in legs:
        pts = leg.geometry
        if geometry and pts and pts[0] == geometry[-1]:
            pts = pts[1:]
        geometry.extend([list(p) for p in pts])
    distance = sum(p.distance_m for p in legs)
    effective = sum(p.effective_distance_m for p in legs)
    fuel = sum(p.fuel_distance_m for p in legs)
    threat_avg = (
        sum(p.threat_avg * p.distance_m for p in legs) / distance
        if distance > 0
        else max((p.threat_avg for p in legs), default=0.0)
    )
    return RoutePath(
        metric=legs[0].metric,
        geometry=geometry,
        distance_m=distance,
        effective_distance_m=effective,
        fuel_distance_m=fuel,
        threat_max=max(p.threat_max for p in legs),
        threat_avg=threat_avg,
        degraded=any(p.degraded for p in legs),
    )


def waypoint_provider_and_speed(
    routing: RoutingProvider, unit_type: UnitType, mode: RouteMode
) -> tuple[RoutingProvider, float]:
    """Pick the router + speed for waypoint legs. road/hybrid use the injected road provider;
    offroad/direct use their terrain router at off-road speed. (Per-leg hybrid best-of is not
    applied for waypoint routes — they use roads where the operator did not force terrain.)"""
    if mode is RouteMode.OFFROAD or mode is RouteMode.DIRECT:
        return build_routing_provider_for_mode(mode), unit_type.movement.speed_offroad_kph
    return routing, unit_type.movement.speed_road_kph


async def plan_legs(
    session: AsyncSession,
    provider: RoutingProvider,
    start_lat: float,
    start_lon: float,
    waypoints: list[tuple[float, float]],
    metric: RouteMetric,
) -> list[RoutePath] | None:
    """Plan each leg start→wp1→…→wpN for one metric. None if any leg is unroutable."""
    legs: list[RoutePath] = []
    cur_lat, cur_lon = start_lat, start_lon
    for wlat, wlon in waypoints:
        leg = await provider.shortest_path(session, cur_lat, cur_lon, wlat, wlon, metric)
        if leg is None:
            return None
        legs.append(leg)
        cur_lat, cur_lon = wlat, wlon
    return legs


async def plan_waypoint_routes(
    session: AsyncSession,
    routing: RoutingProvider,
    instance: UnitInstance,
    unit_type: UnitType,
    waypoints: list[tuple[float, float]],
    *,
    mode: RouteMode = RouteMode.ROAD,
) -> list[RouteOption]:
    """Fastest + safest options for a multi-leg waypoint route (v2 Wave 10, waypoint-routing)."""
    if not waypoints:
        return []
    provider, speed_kph = waypoint_provider_and_speed(routing, unit_type, mode)
    start_fuel = (
        instance.current_fuel_liters
        if instance.current_fuel_liters is not None
        else unit_type.fuel.capacity_liters
    )
    options: list[RouteOption] = []
    for metric, label in _METRICS:
        legs = await plan_legs(session, provider, instance.lat, instance.lon, waypoints, metric)
        if legs is None:
            continue
        stitched = stitch_paths(legs)
        if stitched is None:
            continue
        options.append(
            build_option(
                stitched,
                label=label,
                speed_road_kph=speed_kph,
                consumption_normal_lph=unit_type.fuel.consumption_normal_lph,
                start_fuel_l=start_fuel,
            )
        )
    return options
