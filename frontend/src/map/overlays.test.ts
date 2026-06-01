import { describe, expect, it } from 'vitest'
import type { Tile, UnitInstance } from '../api/types'
import { latLngToCell } from 'h3-js'
import {
  TERRAIN_COLORS,
  activeRoutesToGeoJSON,
  destinationToGeoJSON,
  obstaclesToGeoJSON,
  routeToGeoJSON,
  tilesToGeoJSON,
  unitsToGeoJSON,
} from './overlays'

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

  it('carries threat/road/intel in properties for the hover tooltip', () => {
    const props = tilesToGeoJSON([tile]).features[0].properties
    expect(props?.threat_level).toBe(2)
    expect(props?.road_condition).toBe('clear')
    expect(props?.intel_level).toBe('low')
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

  it('overrides position with the live simulated coordinates and flags it moving', () => {
    const fc = unitsToGeoJSON([unit], {}, { 'inst-1': { lat: 49.3, lon: 11.9 } })
    expect(fc.features[0].geometry).toEqual({ type: 'Point', coordinates: [11.9, 49.3] })
    expect(fc.features[0].properties?.moving).toBe(true)
  })

  it('keeps the seeded position and moving=false when no live update exists', () => {
    const fc = unitsToGeoJSON([unit], {}, { other: { lat: 0, lon: 0 } })
    expect(fc.features[0].geometry).toEqual({ type: 'Point', coordinates: [11.86, 49.23] })
    expect(fc.features[0].properties?.moving).toBe(false)
  })
})

describe('obstaclesToGeoJSON', () => {
  it('places a point at each obstacle cell center', () => {
    const cell = latLngToCell(49.2, 11.85, 8)
    const fc = obstaclesToGeoJSON([{ id: 'ob1', h3_index: cell, kind: 'manual' }])
    expect(fc.features).toHaveLength(1)
    expect(fc.features[0].geometry.type).toBe('Point')
    const [lon, lat] = fc.features[0].geometry.type === 'Point' ? fc.features[0].geometry.coordinates : [0, 0]
    expect(lon).toBeCloseTo(11.85, 1)
    expect(lat).toBeCloseTo(49.2, 1)
    expect(fc.features[0].properties?.id).toBe('ob1')
  })

  it('is empty when there are no obstacles', () => {
    expect(obstaclesToGeoJSON([]).features).toHaveLength(0)
  })
})

describe('activeRoutesToGeoJSON', () => {
  it('builds one LineString per route and drops degenerate ones', () => {
    const fc = activeRoutesToGeoJSON([
      [
        [11.84, 49.22],
        [11.86, 49.24],
      ],
      [[11.0, 49.0]], // too short — dropped
    ])
    expect(fc.features).toHaveLength(1)
    expect(fc.features[0].geometry.type).toBe('LineString')
  })
})

describe('routeToGeoJSON', () => {
  it('builds a LineString from [lon,lat] pairs', () => {
    const fc = routeToGeoJSON([
      [11.84, 49.22],
      [11.85, 49.23],
    ])
    expect(fc.features).toHaveLength(1)
    const geom = fc.features[0].geometry
    expect(geom.type).toBe('LineString')
    expect(geom.type === 'LineString' ? geom.coordinates[1] : []).toEqual([11.85, 49.23])
  })

  it('returns an empty collection for null or single-point geometry', () => {
    expect(routeToGeoJSON(null).features).toHaveLength(0)
    expect(routeToGeoJSON([[11.84, 49.22]]).features).toHaveLength(0)
  })
})

describe('destinationToGeoJSON', () => {
  it('builds a single Point at [lon,lat]', () => {
    const fc = destinationToGeoJSON({ lat: 49.23, lon: 11.86 })
    expect(fc.features).toHaveLength(1)
    expect(fc.features[0].geometry).toEqual({ type: 'Point', coordinates: [11.86, 49.23] })
  })

  it('returns an empty collection when null', () => {
    expect(destinationToGeoJSON(null).features).toHaveLength(0)
  })
})
