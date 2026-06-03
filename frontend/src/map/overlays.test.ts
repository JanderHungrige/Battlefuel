import { describe, expect, it } from 'vitest'
import type { CombatEvent, EnemyUnit, Tile, UnitInstance } from '../api/types'
import { latLngToCell } from 'h3-js'
import {
  TERRAIN_COLORS,
  activeRoutesToGeoJSON,
  adviceArrowToGeoJSON,
  cellThreatToGeoJSON,
  combatEventsToGeoJSON,
  depotsToGeoJSON,
  enemyUnitsToGeoJSON,
  destinationToGeoJSON,
  obstaclesToGeoJSON,
  paddedBounds,
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

describe('paddedBounds', () => {
  const bbox = { west: 11.78, south: 49.18, east: 11.92, north: 49.27 }

  it('returns [[w-pad,s-pad],[e+pad,n+pad]] as a maxBounds tuple', () => {
    expect(paddedBounds(bbox, 0.01)).toEqual([
      [11.77, 49.17],
      [11.93, 49.28],
    ])
  })

  it('defaults to a small pad and keeps SW before NE', () => {
    const [[w, s], [e, n]] = paddedBounds(bbox)
    expect(w).toBeLessThan(e)
    expect(s).toBeLessThan(n)
    expect(w).toBeLessThan(bbox.west) // padded outward
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

describe('depotsToGeoJSON', () => {
  it('emits one point per depot at [lon, lat] with id, name, and a fill-encoded icon key', () => {
    const fc = depotsToGeoJSON([
      {
        depot: { id: 'depot-main', name: 'Main Supply Point', h3_index: 'x', lat: 49.2, lon: 11.8 },
        stocks: [
          { depot_id: 'depot-main', fuel_type: 'diesel', quantity_liters: 5000, capacity_liters: 10000 },
          { depot_id: 'depot-main', fuel_type: 'jp8', quantity_liters: 10000, capacity_liters: 10000 },
        ],
      },
    ])
    expect(fc.features).toHaveLength(1)
    expect(fc.features[0].geometry).toEqual({ type: 'Point', coordinates: [11.8, 49.2] })
    expect(fc.features[0].properties).toMatchObject({
      id: 'depot-main',
      name: 'Main Supply Point',
      icon: 'depot:2-4', // diesel 50% → 2/4, jp8 100% → 4/4
    })
  })
})

describe('adviceArrowToGeoJSON', () => {
  it('is empty when either endpoint is missing', () => {
    expect(adviceArrowToGeoJSON(null, { lat: 49.2, lon: 11.8 }).features).toHaveLength(0)
    expect(adviceArrowToGeoJSON({ lat: 49.2, lon: 11.8 }, null).features).toHaveLength(0)
  })

  it('emits a shaft line and an arrowhead polygon tipped at the destination', () => {
    const from = { lat: 49.20, lon: 11.80 }
    const to = { lat: 49.25, lon: 11.90 }
    const fc = adviceArrowToGeoJSON(from, to)
    const shaft = fc.features.find((f) => f.properties?.part === 'shaft')
    const head = fc.features.find((f) => f.properties?.part === 'head')
    expect(shaft?.geometry.type).toBe('LineString')
    expect(head?.geometry.type).toBe('Polygon')
    // Shaft runs from the unit to the destination.
    const line = shaft!.geometry as { coordinates: number[][] }
    expect(line.coordinates[0]).toEqual([11.80, 49.20])
    expect(line.coordinates[1]).toEqual([11.90, 49.25])
    // Arrowhead tip sits on the destination (first ring point).
    const poly = head!.geometry as { coordinates: number[][][] }
    expect(poly.coordinates[0][0]).toEqual([11.90, 49.25])
    expect(poly.coordinates[0]).toHaveLength(4) // closed triangle
  })
})

const combatEvent = (over: Partial<CombatEvent> = {}): CombatEvent => ({
  type: 'combat_event',
  id: 'ied-1',
  category: 'Threat Events',
  event: 'IED / mine detected or detonated',
  lat: 49.215,
  lon: 11.835,
  precision_m: 100,
  estimated_threat: 4,
  sender: 'EOD 4-1 (52nd EOD)',
  zone: 'blocked',
  ...over,
})

describe('combatEventsToGeoJSON', () => {
  it('renders one closed-square polygon per event carrying zone + threat props', () => {
    const fc = combatEventsToGeoJSON([
      combatEvent(),
      combatEvent({ id: 'red-1', zone: 'combat', estimated_threat: 5, precision_m: 1000 }),
    ])
    expect(fc.features).toHaveLength(2)
    const f0 = fc.features[0]
    expect(f0.geometry.type).toBe('Polygon')
    const ring = (f0.geometry as { coordinates: number[][][] }).coordinates[0]
    expect(ring).toHaveLength(5)
    expect(ring[0]).toEqual(ring[4]) // closed
    expect(f0.properties).toMatchObject({ id: 'ied-1', zone: 'blocked', estimated_threat: 4 })
    expect(fc.features[1].properties).toMatchObject({ zone: 'combat', estimated_threat: 5 })
  })

  it('returns an empty collection for no events', () => {
    expect(combatEventsToGeoJSON([]).features).toEqual([])
  })
})

describe('enemyUnitsToGeoJSON', () => {
  const enemy: EnemyUnit = {
    id: 'enemy-mech-1',
    name: 'OPFOR MECH 1',
    sidc: '10061000151211020000',
    lat: 49.236,
    lon: 11.872,
    echelon: 'company',
  }

  it('emits one point per enemy carrying the hostile SIDC at [lon,lat]', () => {
    const fc = enemyUnitsToGeoJSON([enemy])
    expect(fc.features).toHaveLength(1)
    expect(fc.features[0].geometry).toEqual({ type: 'Point', coordinates: [11.872, 49.236] })
    expect(fc.features[0].properties).toMatchObject({ id: 'enemy-mech-1', sidc: '10061000151211020000' })
  })

  it('is empty when there are no enemy units', () => {
    expect(enemyUnitsToGeoJSON([]).features).toEqual([])
  })
})

describe('cellThreatToGeoJSON', () => {
  const tile = (lat: number, lon: number, threat: number): Tile => ({
    h3_index: `${lat}:${lon}`,
    resolution: 8,
    center_lat: lat,
    center_lon: lon,
    terrain: 'open',
    threat_level: threat,
    intel_level: 'none',
    weather: 'clear',
    road_condition: 'clear',
    cover: 'none',
    boundary: [],
  })

  it('emits one square per threatened MGRS cell, carrying the cell max threat', () => {
    // Two tiles in the same 1km cell (close together) → one square with the max threat.
    const fc = cellThreatToGeoJSON(
      [tile(49.215, 11.835, 2), tile(49.2152, 11.8352, 4), tile(49.25, 11.88, 1)],
      1000,
    )
    expect(fc.features).toHaveLength(2) // two distinct cells
    const threats = fc.features.map((f) => f.properties?.threat).sort()
    expect(threats).toEqual([1, 4]) // first cell took max(2,4)=4
    for (const f of fc.features) {
      expect(f.geometry.type).toBe('Polygon')
      const ring = (f.geometry as { coordinates: number[][][] }).coordinates[0]
      expect(ring).toHaveLength(5) // closed square
    }
  })

  it('omits zero-threat cells', () => {
    expect(cellThreatToGeoJSON([tile(49.21, 11.83, 0)], 1000).features).toEqual([])
  })
})
