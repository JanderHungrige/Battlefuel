// Pure helpers that turn API data into GeoJSON for the map overlays, plus the
// terrain colour scheme. Kept free of MapLibre/canvas so they are unit-testable.

import type { FeatureCollection } from 'geojson'
import { cellToLatLng } from 'h3-js'
import type { Obstacle, TerrainType, Tile, UnitInstance } from '../api/types'

export const TERRAIN_COLORS: Record<TerrainType, string> = {
  open: '#3c4a30',
  forest: '#1f3d2a',
  urban: '#4a4a52',
  water: '#15324f',
  farmland: '#5b5a2c',
  wetland: '#27514f',
  military: '#5a2f2f',
  unknown: '#333941',
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
