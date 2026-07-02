import { describe, expect, it } from 'vitest'
import type { EnemyUnit, Tile, UnitInstance } from '../api/types'
import { latLngToCell } from 'h3-js'
import {
  TERRAIN_COLORS,
  activeRoutesToGeoJSON,
  adviceArrowToGeoJSON,
  cellThreatToGeoJSON,
  depotsToGeoJSON,
  drawnEdgeNodesToGeoJSON,
  drawnEdgesToGeoJSON,
  drawnLineToGeoJSON,
  drawnVerticesToGeoJSON,
  enemyDangerCellsToGeoJSON,
  enemyDangerCirclesToGeoJSON,
  enemyUnitsToGeoJSON,
  destinationToGeoJSON,
  graphEdgesToGeoJSON,
  graphNodesToGeoJSON,
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

describe('routing-graph overlay (v2 Wave 20 F2)', () => {
  it('edges become LineString features carrying threat, skipping degenerate ones', () => {
    const fc = graphEdgesToGeoJSON([
      { gid: 1, geometry: [[11.8, 49.2], [11.81, 49.21]], threat_level: 3 },
      { gid: 2, geometry: [[11.8, 49.2]], threat_level: 0 }, // <2 points → dropped
    ])
    expect(fc.features).toHaveLength(1)
    expect(fc.features[0].geometry.type).toBe('LineString')
    expect(fc.features[0].properties).toEqual({ threat: 3 })
  })

  it('nodes become Point features', () => {
    const fc = graphNodesToGeoJSON([{ id: 7, point: [11.85, 49.22] }])
    expect(fc.features).toHaveLength(1)
    expect(fc.features[0].geometry).toEqual({ type: 'Point', coordinates: [11.85, 49.22] })
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

  it('draws a closed danger ring polygon per enemy', () => {
    const fc = enemyDangerCirclesToGeoJSON([enemy])
    expect(fc.features).toHaveLength(1)
    const ring = (fc.features[0].geometry as { type: string; coordinates: number[][][] })
    expect(ring.type).toBe('Polygon')
    expect(ring.coordinates[0][0]).toEqual(ring.coordinates[0][ring.coordinates[0].length - 1])
    expect(fc.features[0].properties).toMatchObject({ id: 'enemy-mech-1' })
  })

  it('washes the covered 500 m cells as square polygons', () => {
    const fc = enemyDangerCellsToGeoJSON([enemy])
    expect(fc.features.length).toBeGreaterThan(0)
    for (const f of fc.features) {
      expect(f.geometry.type).toBe('Polygon')
      const ring = (f.geometry as { coordinates: number[][][] }).coordinates[0]
      expect(ring).toHaveLength(5) // closed square
    }
  })

  it('emits no danger geometry with no enemies', () => {
    expect(enemyDangerCirclesToGeoJSON([]).features).toEqual([])
    expect(enemyDangerCellsToGeoJSON([]).features).toEqual([])
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
    // Two tiles in the same 1km ambient cell (close together) → one square with the max threat.
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

  it('paints a located-event threat at its own grid code, independent of the displayed grid', () => {
    // Viewed at 1 km: a located 500 m threat still paints a 500 m square (smaller than ambient 1 km).
    const lonSpan = (f: { geometry: { coordinates: number[][][] } }): number => {
      const lons = f.geometry.coordinates[0].map((p) => p[0])
      return Math.max(...lons) - Math.min(...lons)
    }
    const ambient = cellThreatToGeoJSON([tile(49.215, 11.835, 3)], 1000).features[0]
    const located = cellThreatToGeoJSON(
      [
        {
          ...tile(49.215, 11.835, 3),
          last_event: {
            headline: 'mine',
            category: 'obstacle',
            sender: 'recon',
            supply_relevant: false,
            at_game_s: 0,
            precision_m: 500,
          },
        },
      ],
      1000,
    ).features[0]
    expect(lonSpan(located as never)).toBeLessThan(lonSpan(ambient as never) * 0.75)
  })
})

describe('drawnLineToGeoJSON', () => {
  it('returns no feature for fewer than 2 points', () => {
    expect(drawnLineToGeoJSON([]).features).toEqual([])
    expect(drawnLineToGeoJSON([{ lat: 49.2, lon: 11.8 }]).features).toEqual([])
  })

  it('builds one [lon,lat] LineString from the waypoints', () => {
    const fc = drawnLineToGeoJSON([
      { lat: 49.2, lon: 11.8 },
      { lat: 49.21, lon: 11.81 },
    ])
    expect(fc.features).toHaveLength(1)
    expect(fc.features[0].geometry.type).toBe('LineString')
    expect((fc.features[0].geometry as { coordinates: number[][] }).coordinates).toEqual([
      [11.8, 49.2],
      [11.81, 49.21],
    ])
  })
})

describe('drawnVerticesToGeoJSON', () => {
  it('emits one [lon,lat] Point per waypoint', () => {
    const fc = drawnVerticesToGeoJSON([
      { lat: 49.2, lon: 11.8 },
      { lat: 49.21, lon: 11.81 },
    ])
    expect(fc.features).toHaveLength(2)
    expect(fc.features.map((f) => (f.geometry as { coordinates: number[] }).coordinates)).toEqual([
      [11.8, 49.2],
      [11.81, 49.21],
    ])
  })
})

describe('drawnEdgesToGeoJSON (edit overlay)', () => {
  const edge = (id: string, coords: number[][]) => ({
    id,
    kind: 'road' as const,
    coordinates: coords,
    connect_start: true,
    connect_end: false,
  })

  it('makes one LineString per edge carrying id + kind, dropping degenerate ones', () => {
    const fc = drawnEdgesToGeoJSON([
      edge('a', [
        [11.8, 49.2],
        [11.81, 49.21],
      ]),
      edge('b', [[11.8, 49.2]]), // <2 points → dropped
    ])
    expect(fc.features).toHaveLength(1)
    expect(fc.features[0].geometry.type).toBe('LineString')
    expect(fc.features[0].properties).toEqual({ id: 'a', kind: 'road' })
  })

  it('drawnEdgeNodesToGeoJSON emits the first + last vertex per edge, carrying the owning id', () => {
    const fc = drawnEdgeNodesToGeoJSON([
      edge('a', [
        [11.8, 49.2],
        [11.805, 49.205],
        [11.81, 49.21],
      ]),
    ])
    expect(fc.features).toHaveLength(2)
    expect(fc.features.every((f) => f.properties?.id === 'a')).toBe(true)
    const pts = fc.features.map((f) => (f.geometry as { coordinates: number[] }).coordinates)
    expect(pts).toEqual([
      [11.8, 49.2],
      [11.81, 49.21],
    ])
  })
})
