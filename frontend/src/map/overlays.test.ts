import { describe, expect, it } from 'vitest'
import type { Tile, UnitInstance } from '../api/types'
import { TERRAIN_COLORS, tilesToGeoJSON, unitsToGeoJSON } from './overlays'

const tile: Tile = {
  h3_index: '8811aa',
  resolution: 8,
  center_lat: 49.22,
  center_lon: 11.85,
  terrain: 'forest',
  threat_level: 2,
  intel_level: 'low',
  weather: 'clear',
  road_condition: 'clear',
  cover: 'none',
  boundary: [
    [11.84, 49.22],
    [11.85, 49.23],
    [11.86, 49.22],
  ],
}

const unit: UnitInstance = {
  id: 'inst-1',
  name: 'TIGER',
  unit_type_id: 'armor-tank-coy',
  lat: 49.23,
  lon: 11.86,
  h3_index: '8811bb',
  status: 'operational',
  current_fuel_liters: 15000,
}

describe('tilesToGeoJSON', () => {
  it('produces a closed polygon ring with terrain color', () => {
    const fc = tilesToGeoJSON([tile])
    expect(fc.features).toHaveLength(1)
    const geom = fc.features[0].geometry
    expect(geom.type).toBe('Polygon')
    const ring = geom.type === 'Polygon' ? geom.coordinates[0] : []
    expect(ring[0]).toEqual(ring[ring.length - 1]) // closed
    expect(fc.features[0].properties?.color).toBe(TERRAIN_COLORS.forest)
  })
})

describe('unitsToGeoJSON', () => {
  it('maps unit type to SIDC and uses point geometry', () => {
    const fc = unitsToGeoJSON([unit], { 'armor-tank-coy': '10031000151205000000' })
    expect(fc.features[0].geometry).toEqual({ type: 'Point', coordinates: [11.86, 49.23] })
    expect(fc.features[0].properties?.sidc).toBe('10031000151205000000')
  })

  it('falls back to empty sidc for unknown type', () => {
    const fc = unitsToGeoJSON([unit], {})
    expect(fc.features[0].properties?.sidc).toBe('')
  })
})
