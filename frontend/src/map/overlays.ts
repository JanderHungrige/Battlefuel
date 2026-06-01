// Pure helpers that turn API data into GeoJSON for the map overlays, plus the
// terrain colour scheme. Kept free of MapLibre/canvas so they are unit-testable.

import type { FeatureCollection } from 'geojson'
import type { TerrainType, Tile, UnitInstance } from '../api/types'

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
        color: TERRAIN_COLORS[t.terrain] ?? TERRAIN_COLORS.unknown,
      },
    })),
  }
}

/** Unit instances → point FeatureCollection carrying the APP-6 SIDC for rendering. */
export function unitsToGeoJSON(
  units: UnitInstance[],
  sidcByType: Record<string, string>,
): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: units.map((u) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [u.lon, u.lat] },
      properties: {
        id: u.id,
        name: u.name,
        status: u.status,
        sidc: sidcByType[u.unit_type_id] ?? '',
      },
    })),
  }
}
