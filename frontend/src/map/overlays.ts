// Pure helpers that turn API data into GeoJSON for the map overlays, plus the
// terrain colour scheme. Kept free of MapLibre/canvas so they are unit-testable.

import type { FeatureCollection } from 'geojson'
import { cellToLatLng } from 'h3-js'
import type {
  BBox,
  CombatEvent,
  DepotFuel,
  EnemyUnit,
  Obstacle,
  TerrainType,
  Tile,
  UnitInstance,
} from '../api/types'
import { depotIconKey } from './depotSymbol'
import { iconForEvent } from './eventIcons'
import { cellIdFor, squareCornersFromCenter } from './mgrsGrid'

// Light classic terrain tints — soft, distinct fills that read on the parchment basemap (45).
export const TERRAIN_COLORS: Record<TerrainType, string> = {
  open: '#dfe3c8',
  forest: '#bcd2a6',
  urban: '#cfcdd6',
  water: '#a9cce3',
  farmland: '#e6e2a8',
  wetland: '#bcdcd2',
  military: '#e0bcbc',
  unknown: '#d7d3c8',
}

/**
 * theater bbox → a MapLibre `maxBounds` tuple `[[west,south],[east,north]]`, padded outward by
 * `padDeg` degrees. A generous pad (~6 km) frames the theater while still allowing the operator to
 * zoom out comfortably around it. Pure (no canvas).
 */
export function paddedBounds(bbox: BBox, padDeg = 0.06): [[number, number], [number, number]] {
  return [
    [bbox.west - padDeg, bbox.south - padDeg],
    [bbox.east + padDeg, bbox.north + padDeg],
  ]
}

/** Tiles → polygon FeatureCollection (boundary rings are closed here). */
export function tilesToGeoJSON(tiles: Tile[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: tiles.map((t) => ({
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[...t.boundary, t.boundary[0]]],
      },
      properties: {
        h3_index: t.h3_index,
        terrain: t.terrain,
        threat_level: t.threat_level,
        road_condition: t.road_condition,
        intel_level: t.intel_level,
        color: TERRAIN_COLORS[t.terrain] ?? TERRAIN_COLORS.unknown,
      },
    })),
  }
}

/**
 * Unit instances → point FeatureCollection carrying the APP-6 SIDC for rendering.
 * `live` overrides a unit's coordinates with its current simulated position (if present).
 */
export function unitsToGeoJSON(
  units: UnitInstance[],
  sidcByType: Record<string, string>,
  live?: Record<string, { lat: number; lon: number }>,
): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: units.map((u) => {
      const pos = live?.[u.id]
      const lon = pos ? pos.lon : u.lon
      const lat = pos ? pos.lat : u.lat
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lon, lat] },
        properties: {
          id: u.id,
          name: u.name,
          status: u.status,
          sidc: sidcByType[u.unit_type_id] ?? '',
          moving: pos != null,
        },
      }
    }),
  }
}

/**
 * Located combat events → Polygon FeatureCollection, one MGRS-grid-aligned square per event at its
 * `precision_m` (v2 Wave 3, threat-mgrs-squares). Properties carry `zone` + `estimated_threat` for
 * styling and `category`/`event`/`sender` for the F3 hover / F4 chatter consumers.
 */
export function combatEventsToGeoJSON(events: CombatEvent[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: events.map((ev) => ({
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [squareCornersFromCenter(ev.lat, ev.lon, ev.precision_m)],
      },
      properties: {
        id: ev.id,
        zone: ev.zone,
        estimated_threat: ev.estimated_threat,
        category: ev.category,
        event: ev.event,
        sender: ev.sender,
        precision_m: ev.precision_m,
        icon: iconForEvent(ev.category, ev.event).key,
      },
    })),
  }
}

/**
 * Enemy units → point FeatureCollection carrying the hostile APP-6 SIDC (v2 Wave 3). Rendered red
 * by milsymbol via the same icon pipeline as friendly units, on a separate (non-orderable) layer.
 */
export function enemyUnitsToGeoJSON(enemies: EnemyUnit[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: enemies.map((e) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [e.lon, e.lat] },
      properties: { id: e.id, name: e.name, sidc: e.sidc, echelon: e.echelon },
    })),
  }
}

/**
 * Ambient threat as shaded MGRS cells (v2 Wave 9, mgrs-threat-shading) — replaces the hex threat
 * wash. Groups tiles by their MGRS cell at `precisionM`, takes each cell's max threat, and emits one
 * square Polygon per cell with `threat > 0` (carrying `threat` for the opacity ramp).
 */
export function cellThreatToGeoJSON(tiles: Tile[], precisionM: number): FeatureCollection {
  const cells = new Map<string, { lat: number; lon: number; threat: number }>()
  for (const t of tiles) {
    const id = cellIdFor(t.center_lat, t.center_lon, precisionM)
    const prev = cells.get(id)
    if (prev === undefined) {
      cells.set(id, { lat: t.center_lat, lon: t.center_lon, threat: t.threat_level })
    } else if (t.threat_level > prev.threat) {
      prev.threat = t.threat_level
    }
  }
  return {
    type: 'FeatureCollection',
    features: [...cells.values()]
      .filter((c) => c.threat > 0)
      .map((c) => ({
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [squareCornersFromCenter(c.lat, c.lon, precisionM)],
        },
        properties: { threat: c.threat },
      })),
  }
}

/** Obstacles → point FeatureCollection at each blocked cell's center. */
export function obstaclesToGeoJSON(obstacles: Obstacle[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: obstacles.map((o) => {
      const [lat, lon] = cellToLatLng(o.h3_index)
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lon, lat] },
        properties: { id: o.id },
      }
    }),
  }
}

/**
 * Fuel depots → point FeatureCollection. Each feature references a composited icon (NATO sustainment
 * symbol + per-fuel gauges) by a fill-encoded key, so MapView can register/look up the right image
 * (v2 Wave 3, depot-nato-symbol-fuelbars).
 */
export function depotsToGeoJSON(depots: DepotFuel[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: depots.map((d) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [d.depot.lon, d.depot.lat] },
      properties: { id: d.depot.id, name: d.depot.name, icon: depotIconKey(d) },
    })),
  }
}

/**
 * A proposed-movement indicator (advice): a straight "axis of advance" arrow from a unit's
 * position to the suggested destination — a shaft LineString plus an arrowhead Polygon at the
 * destination, oriented along the bearing. Approximates the NATO movement-axis convention
 * (milsymbol covers unit icons, not tactical mission graphics). Empty collection when null.
 */
export function adviceArrowToGeoJSON(
  from: { lat: number; lon: number } | null | undefined,
  to: { lat: number; lon: number } | null | undefined,
): FeatureCollection {
  if (!from || !to) return { type: 'FeatureCollection', features: [] }

  // Work in a locally lon-scaled space so the arrowhead looks right at this latitude.
  const k = Math.cos((to.lat * Math.PI) / 180) || 1
  const dx = (to.lon - from.lon) * k
  const dy = to.lat - from.lat
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  const size = 0.004 // arrowhead length in latitude-degrees (~440 m)
  const baseX = to.lon * k - ux * size
  const baseY = to.lat - uy * size
  const px = -uy
  const py = ux
  const left: [number, number] = [(baseX + px * size * 0.5) / k, baseY + py * size * 0.5]
  const right: [number, number] = [(baseX - px * size * 0.5) / k, baseY - py * size * 0.5]

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [[from.lon, from.lat], [to.lon, to.lat]] },
        properties: { part: 'shaft' },
      },
      {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [[[to.lon, to.lat], left, right, [to.lon, to.lat]]] },
        properties: { part: 'head' },
      },
    ],
  }
}

/** Multiple active-route geometries → a LineString FeatureCollection. */
export function activeRoutesToGeoJSON(geometries: number[][][]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: geometries
      .filter((g) => g.length >= 2)
      .map((g) => ({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: g },
        properties: {},
      })),
  }
}

/** A planned/active route → a single LineString feature (empty collection when null). */
export function routeToGeoJSON(geometry: number[][] | null | undefined): FeatureCollection {
  if (!geometry || geometry.length < 2) {
    return { type: 'FeatureCollection', features: [] }
  }
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: geometry },
        properties: {},
      },
    ],
  }
}

/** A picked destination → a single Point feature (empty collection when null). */
export function destinationToGeoJSON(
  dest: { lat: number; lon: number } | null | undefined,
): FeatureCollection {
  if (!dest) return { type: 'FeatureCollection', features: [] }
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [dest.lon, dest.lat] },
        properties: {},
      },
    ],
  }
}
