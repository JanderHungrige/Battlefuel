// Pure helpers that turn API data into GeoJSON for the map overlays, plus the
// terrain colour scheme. Kept free of MapLibre/canvas so they are unit-testable.

import type { FeatureCollection } from 'geojson'
import { cellToLatLng } from 'h3-js'
import type { BBox, FuelDepot, Obstacle, TerrainType, Tile, UnitInstance } from '../api/types'

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

/** Fuel depots → point FeatureCollection at each depot's location. */
export function depotsToGeoJSON(depots: FuelDepot[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: depots.map((d) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [d.lon, d.lat] },
      properties: { id: d.id, name: d.name },
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
