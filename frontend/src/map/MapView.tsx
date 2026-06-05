// MapLibre GL map: offline basemap + hex tiles + APP-6 unit symbols + click-to-inspect,
// plus route/destination overlays for move planning. The map is created once and its
// sources are updated imperatively, so overlays (and live motion) never tear it down.

import { cellToLatLng } from 'h3-js'
import maplibregl from 'maplibre-gl'
import { Protocol } from 'pmtiles'
import { useEffect, useRef } from 'react'
import {
  ROUTE,
  SELECTED_UNIT,
  SELECTED_UNIT_RING,
  ZONE_BLOCKED_FILL,
  ZONE_BLOCKED_LINE,
  ZONE_COMBAT_FILL,
  ZONE_COMBAT_LINE,
  ZONE_THREAT_FILL,
  ZONE_THREAT_LINE,
} from './colors'
import { DEPOT_SIDC, GAUGE_SEGMENTS, depotGauges, depotIconKey } from './depotSymbol'
import { fuelBarColor, fuelBarKey, fuelFraction } from './unitFuelBar'
import { ALL_EVENT_ICONS } from './eventIcons'
import { formatMgrs, gridLabels, gridLines, squareCornersFromCenter, toMgrs } from './mgrsGrid'
import 'maplibre-gl/dist/maplibre-gl.css'
import type {
  CombatEvent,
  DepotFuel,
  EnemyUnit,
  Obstacle,
  Theater,
  Tile,
  UnitInstance,
  UnitType,
} from '../api/types'
import { PMTILES_PATH } from '../config'
import { buildBasemapStyle } from './basemapStyle'
import {
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
import { sidcToCanvas, sidcToImage } from './symbols'

let protocolRegistered = false
function ensureProtocol(): void {
  if (protocolRegistered) return
  maplibregl.addProtocol('pmtiles', new Protocol().tile)
  protocolRegistered = true
}

export interface MapViewProps {
  theater: Theater
  tiles: Tile[]
  units: UnitInstance[]
  unitTypes: UnitType[]
  routeGeometry: number[][] | null
  destination: { lat: number; lon: number } | null
  planning: boolean
  livePositions: Record<string, { lat: number; lon: number; fuel_l?: number }>
  activeRoutes: number[][][]
  obstacles: Obstacle[]
  obstacleMode: boolean
  combatEvents: CombatEvent[]
  highlightEventId: string | null
  enemyUnits: EnemyUnit[]
  depots: DepotFuel[]
  /** When set, ease the map to this depot (locate). v2 Wave 11 F5. */
  locateDepotId?: string | null
  rendezvous: { lat: number; lon: number } | null
  adviceArrow: { from: { lat: number; lon: number }; to: { lat: number; lon: number } } | null
  adviceDest: { lat: number; lon: number } | null
  highlightH3: string | null
  selectedUnitId: string | null
  /** OF-8 per-unit fuel bars on the map (v2 Wave 11 F7); off → no bars rendered. */
  showUnitFuelBars?: boolean
  selectedCell: { lat: number; lon: number } | null
  gridPrecisionM: number
  onSelectCell: (lat: number, lon: number) => void
  onSelectUnit: (id: string) => void
  onPickDestination: (lat: number, lon: number) => void
  onPlaceObstacle: (lat: number, lon: number) => void
  onRemoveObstacle: (id: string) => void
  depotMode: boolean
  onPlaceDepot: (lat: number, lon: number) => void
  onClearSelection: () => void
}

const EMPTY = { type: 'FeatureCollection' as const, features: [] }


function setData(map: maplibregl.Map, id: string, data: GeoJSON.GeoJSON): void {
  const src = map.getSource(id) as maplibregl.GeoJSONSource | undefined
  src?.setData(data)
}

/** Add all sources (empty) and layers once, in render order (tiles → route → dest → units). */
function initLayers(map: maplibregl.Map): void {
  map.addSource('tiles', { type: 'geojson', data: EMPTY })
  map.addLayer({
    id: 'tiles-fill',
    type: 'fill',
    source: 'tiles',
    paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.5 },
  })
  // Threat overlay: red, opacity ramped by threat_level (0 → transparent, 5 → strong).
  map.addLayer({
    id: 'tiles-threat',
    type: 'fill',
    source: 'tiles',
    paint: {
      'fill-color': '#ff3030',
      'fill-opacity': ['interpolate', ['linear'], ['get', 'threat_level'], 0, 0, 1, 0.12, 5, 0.55],
    },
  })
  map.addLayer({
    id: 'tiles-outline',
    type: 'line',
    source: 'tiles',
    // Crisp neighbour separation on the light base — a clear mid-grey hairline.
    paint: { 'line-color': '#6b7280', 'line-width': 0.8, 'line-opacity': 0.7 },
  })
  // Yellow highlight border for the sector referenced by a clicked chatter message.
  // Sector locate-highlight (chatter / supply / advice): the MGRS square of the referenced location
  // (v2 Wave 9 — was an H3 hex outline; hex retired from the UX).
  map.addSource('sector-highlight', { type: 'geojson', data: EMPTY })
  map.addLayer({
    id: 'sector-highlight',
    type: 'line',
    source: 'sector-highlight',
    paint: { 'line-color': '#ffd23f', 'line-width': 3 },
  })

  // MGRS-cell ambient threat shading (v2 Wave 9) — replaces the hex threat wash. Red, opacity
  // ramped by the cell's max threat. Drawn under the grid + combat squares.
  map.addSource('cell-threat', { type: 'geojson', data: EMPTY })
  map.addLayer({
    id: 'cell-threat',
    type: 'fill',
    source: 'cell-threat',
    paint: {
      'fill-color': '#ff3030',
      'fill-opacity': ['interpolate', ['linear'], ['get', 'threat'], 0, 0, 1, 0.12, 5, 0.55],
    },
  })

  // MGRS coordinate grid (Wave 2): lines + per-square labels (canvas-rasterized icon-image, so no
  // glyphs are needed). Hidden until the MGRS layout is active.
  map.addSource('mgrs-grid', { type: 'geojson', data: EMPTY })
  map.addLayer({
    id: 'mgrs-grid-line',
    type: 'line',
    source: 'mgrs-grid',
    layout: { visibility: 'none' },
    paint: {
      'line-color': '#5a5346',
      'line-opacity': 0.55,
      'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.4, 13, 1.0, 16, 1.8],
    },
  })
  map.addSource('mgrs-labels', { type: 'geojson', data: EMPTY })
  map.addLayer({
    id: 'mgrs-labels',
    type: 'symbol',
    source: 'mgrs-labels',
    layout: {
      visibility: 'none',
      'icon-image': ['get', 'icon'],
      'icon-size': 1,
      'icon-allow-overlap': false,
      'icon-ignore-placement': false,
    },
  })

  // Located combat-event threat squares (v2 Wave 3): MGRS-aligned squares coloured by zone
  // (combat → red, blocked → light-yellow, threat → amber), opacity ramped by estimated_threat.
  // Drawn above the grid but below routes/units so symbols stay legible.
  map.addSource('combat-events', { type: 'geojson', data: EMPTY })
  map.addLayer({
    id: 'combat-events-fill',
    type: 'fill',
    source: 'combat-events',
    paint: {
      'fill-color': [
        'match',
        ['get', 'zone'],
        'combat',
        ZONE_COMBAT_FILL,
        'blocked',
        ZONE_BLOCKED_FILL,
        ZONE_THREAT_FILL,
      ],
      'fill-opacity': [
        'interpolate',
        ['linear'],
        ['get', 'estimated_threat'],
        0,
        0.18,
        5,
        0.5,
      ],
    },
  })
  map.addLayer({
    id: 'combat-events-outline',
    type: 'line',
    source: 'combat-events',
    paint: {
      'line-color': [
        'match',
        ['get', 'zone'],
        'combat',
        ZONE_COMBAT_LINE,
        'blocked',
        ZONE_BLOCKED_LINE,
        ZONE_THREAT_LINE,
      ],
      'line-width': 1.5,
      'line-opacity': 0.9,
    },
  })
  // Category glyph at each square's centre (offline-rasterized; F3 event-hover-icons).
  for (const ic of ALL_EVENT_ICONS) {
    if (!map.hasImage(ic.key)) map.addImage(ic.key, glyphImage(ic.glyph))
  }
  map.addLayer({
    id: 'combat-events-icons',
    type: 'symbol',
    source: 'combat-events',
    layout: {
      'symbol-placement': 'point',
      'icon-image': ['get', 'icon'],
      'icon-size': 1,
      'icon-allow-overlap': true,
    },
  })
  // Bright highlight outline for a combat square located from the chatter log (F4 click-to-locate).
  map.addLayer({
    id: 'combat-events-highlight',
    type: 'line',
    source: 'combat-events',
    filter: ['==', ['get', 'id'], ''],
    paint: { 'line-color': '#ffd23f', 'line-width': 3.5, 'line-opacity': 0.95 },
  })

  // Selected MGRS cell outline (v2 Wave 9 inspection) — the cell the operator clicked.
  map.addSource('selected-cell', { type: 'geojson', data: EMPTY })
  map.addLayer({
    id: 'selected-cell',
    type: 'line',
    source: 'selected-cell',
    paint: { 'line-color': '#1d4ed8', 'line-width': 2.5, 'line-opacity': 0.9 },
  })

  map.addSource('active-routes', { type: 'geojson', data: EMPTY })
  map.addLayer({
    id: 'active-routes-line',
    type: 'line',
    source: 'active-routes',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': ROUTE, 'line-width': 3, 'line-opacity': 0.45, 'line-dasharray': [2, 2] },
  })

  map.addSource('route', { type: 'geojson', data: EMPTY })
  map.addLayer({
    id: 'route-line',
    type: 'line',
    source: 'route',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': ROUTE, 'line-width': 4, 'line-opacity': 0.85 },
  })

  map.addSource('destination', { type: 'geojson', data: EMPTY })
  map.addLayer({
    id: 'destination-point',
    type: 'circle',
    source: 'destination',
    paint: {
      'circle-radius': 7,
      'circle-color': ROUTE,
      'circle-stroke-width': 2,
      'circle-stroke-color': '#0e1116',
    },
  })

  map.addSource('units', { type: 'geojson', data: EMPTY })
  // Selected-unit halo (bright yellow for visibility), drawn under the icon; filter from selectedUnitId.
  map.addLayer({
    id: 'units-selected',
    type: 'circle',
    source: 'units',
    filter: ['==', ['get', 'id'], ''],
    paint: {
      'circle-radius': 18,
      'circle-color': SELECTED_UNIT,
      'circle-opacity': 0.55,
      'circle-stroke-width': 2.5,
      'circle-stroke-color': SELECTED_UNIT_RING,
    },
  })
  map.addLayer({
    id: 'units',
    type: 'symbol',
    source: 'units',
    layout: { 'icon-image': ['get', 'sidc'], 'icon-size': 1, 'icon-allow-overlap': true },
  })

  // Per-unit fuel bars (v2 Wave 11 F7): a small colour-coded bar below each unit symbol. Two
  // layers off one source so the selected unit's bar draws on top of overlapping ones.
  map.addSource('unit-fuel-bars', { type: 'geojson', data: EMPTY })
  const fuelBarLayout: maplibregl.SymbolLayerSpecification['layout'] = {
    'icon-image': ['get', 'key'],
    'icon-size': 1,
    'icon-allow-overlap': true,
    'icon-anchor': 'top',
    'icon-offset': [0, 16],
  }
  map.addLayer({
    id: 'unit-fuel-bars',
    type: 'symbol',
    source: 'unit-fuel-bars',
    filter: ['!=', ['get', 'id'], ''],
    layout: fuelBarLayout,
  })
  map.addLayer({
    id: 'unit-fuel-bars-selected',
    type: 'symbol',
    source: 'unit-fuel-bars',
    filter: ['==', ['get', 'id'], ''],
    layout: fuelBarLayout,
  })

  // Enemy units (v2 Wave 3): red APP-6 hostile symbols, rendered through the same SIDC pipeline
  // but on a separate, non-orderable layer.
  map.addSource('enemy-units', { type: 'geojson', data: EMPTY })
  map.addLayer({
    id: 'enemy-units',
    type: 'symbol',
    source: 'enemy-units',
    layout: { 'icon-image': ['get', 'sidc'], 'icon-size': 1, 'icon-allow-overlap': true },
  })

  map.addSource('obstacles', { type: 'geojson', data: EMPTY })
  map.addLayer({
    id: 'obstacles',
    type: 'circle',
    source: 'obstacles',
    paint: {
      'circle-radius': 8,
      'circle-color': '#ff3030',
      'circle-opacity': 0.85,
      'circle-stroke-width': 2,
      'circle-stroke-color': '#0e1116',
    },
  })

  // Fuel depots (OF-8 supply overlay): NATO sustainment symbol + per-fuel gauges (composited icon).
  map.addSource('depots', { type: 'geojson', data: EMPTY })
  map.addLayer({
    id: 'depots',
    type: 'symbol',
    source: 'depots',
    layout: {
      'icon-image': ['get', 'icon'],
      'icon-size': 1,
      'icon-allow-overlap': true,
      'icon-anchor': 'bottom',
    },
  })

  // Refuel rendezvous marker: amber ring.
  map.addSource('rendezvous', { type: 'geojson', data: EMPTY })
  map.addLayer({
    id: 'rendezvous-point',
    type: 'circle',
    source: 'rendezvous',
    paint: {
      'circle-radius': 11,
      'circle-color': 'rgba(255,176,32,0.15)',
      'circle-stroke-width': 3,
      'circle-stroke-color': '#ffb020',
    },
  })

  // Advice movement axis: a NATO-style "axis of advance" arrow (shaft line + arrowhead fill).
  map.addSource('advice-arrow', { type: 'geojson', data: EMPTY })
  map.addLayer({
    id: 'advice-arrow-line',
    type: 'line',
    source: 'advice-arrow',
    filter: ['==', ['geometry-type'], 'LineString'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#ffd23f', 'line-width': 3.5, 'line-opacity': 0.95 },
  })
  map.addLayer({
    id: 'advice-arrow-head',
    type: 'fill',
    source: 'advice-arrow',
    filter: ['==', ['geometry-type'], 'Polygon'],
    paint: { 'fill-color': '#ffd23f', 'fill-opacity': 0.95 },
  })

  // Advice destination marker (also the only indicator for no-movement buy recommendations).
  map.addSource('advice-dest', { type: 'geojson', data: EMPTY })
  map.addLayer({
    id: 'advice-dest-point',
    type: 'circle',
    source: 'advice-dest',
    paint: {
      'circle-radius': 7,
      'circle-color': '#ffd23f',
      'circle-stroke-width': 2,
      'circle-stroke-color': '#0e1116',
    },
  })
}

function syncUnits(
  map: maplibregl.Map,
  units: UnitInstance[],
  unitTypes: UnitType[],
  live: Record<string, { lat: number; lon: number }>,
): void {
  const sidcByType: Record<string, string> = {}
  for (const ut of unitTypes) sidcByType[ut.id] = ut.sidc
  for (const sidc of new Set(Object.values(sidcByType))) {
    if (sidc && !map.hasImage(sidc)) {
      const img = sidcToImage(sidc)
      if (img) map.addImage(sidc, img.data)
    }
  }
  setData(map, 'units', unitsToGeoJSON(units, sidcByType, live))
}

// --- Per-unit fuel bars (v2 Wave 11 F7) ---------------------------------------------------

const FUEL_BAR_W = 30
const FUEL_BAR_H = 7

/** A small colour-coded fuel bar (track + proportional fill) as offline ImageData. */
function fuelBarImage(fraction: number): ImageData {
  const canvas = document.createElement('canvas')
  canvas.width = FUEL_BAR_W
  canvas.height = FUEL_BAR_H
  const ctx = canvas.getContext('2d')
  if (!ctx) return new ImageData(FUEL_BAR_W, FUEL_BAR_H)
  ctx.fillStyle = 'rgba(14,17,22,0.75)'
  ctx.fillRect(0, 0, FUEL_BAR_W, FUEL_BAR_H)
  const inset = 1
  const fillW = Math.round((FUEL_BAR_W - inset * 2) * fraction)
  ctx.fillStyle = fuelBarColor(fraction)
  ctx.fillRect(inset, inset, fillW, FUEL_BAR_H - inset * 2)
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'
  ctx.lineWidth = 1
  ctx.strokeRect(0.5, 0.5, FUEL_BAR_W - 1, FUEL_BAR_H - 1)
  return ctx.getImageData(0, 0, FUEL_BAR_W, FUEL_BAR_H)
}

/** Build fuel-bar point features for every unit that has fuel telemetry. */
function unitFuelBarsToGeoJSON(
  units: UnitInstance[],
  unitTypes: UnitType[],
  live: Record<string, { lat: number; lon: number; fuel_l?: number }>,
): GeoJSON.FeatureCollection {
  const capByType: Record<string, number> = {}
  for (const ut of unitTypes) capByType[ut.id] = ut.fuel.capacity_liters
  const features: GeoJSON.Feature[] = []
  for (const u of units) {
    const liveU = live[u.id]
    const current = liveU?.fuel_l ?? u.current_fuel_liters
    const fraction = fuelFraction(current, capByType[u.unit_type_id] ?? 0)
    if (fraction === null) continue
    const lon = liveU?.lon ?? u.lon
    const lat = liveU?.lat ?? u.lat
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: { id: u.id, key: fuelBarKey(fraction) },
    })
  }
  return { type: 'FeatureCollection', features }
}

function syncUnitFuelBars(
  map: maplibregl.Map,
  units: UnitInstance[],
  unitTypes: UnitType[],
  live: Record<string, { lat: number; lon: number; fuel_l?: number }>,
  enabled: boolean,
): void {
  if (!enabled) {
    setData(map, 'unit-fuel-bars', EMPTY)
    return
  }
  const data = unitFuelBarsToGeoJSON(units, unitTypes, live)
  // Register one image per distinct fill bucket present (bounded set).
  for (const f of data.features) {
    const key = String(f.properties?.key ?? '')
    if (key && !map.hasImage(key)) {
      const bucket = Number(key.split(':')[1])
      map.addImage(key, fuelBarImage(bucket / 10))
    }
  }
  setData(map, 'unit-fuel-bars', data)
}

/** Register each hostile SIDC image (red milsymbol) and push the enemy-unit points. */
function syncEnemyUnits(map: maplibregl.Map, enemies: EnemyUnit[]): void {
  for (const sidc of new Set(enemies.map((e) => e.sidc))) {
    if (sidc && !map.hasImage(sidc)) {
      const img = sidcToImage(sidc)
      if (img) map.addImage(sidc, img.data)
    }
  }
  setData(map, 'enemy-units', enemyUnitsToGeoJSON(enemies))
}

const DIESEL_COLOR = '#3a8f4f'
const JP8_COLOR = '#d39a2b'

/** Draw a 4-segment fuel bar; the first `filled` segments are colour-coded, the rest greyed. */
function gaugeBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  filled: number,
  color: string,
): void {
  const seg = w / GAUGE_SEGMENTS
  for (let i = 0; i < GAUGE_SEGMENTS; i++) {
    ctx.fillStyle = i < filled ? color : 'rgba(20,18,14,0.22)'
    ctx.fillRect(x + i * seg + 0.5, y, seg - 1, h)
    ctx.strokeStyle = 'rgba(20,18,14,0.6)'
    ctx.lineWidth = 0.5
    ctx.strokeRect(x + i * seg + 0.5, y, seg - 1, h)
  }
}

/** Composite a depot's NATO sustainment symbol + diesel/JP8 fuel gauges into one offline icon. */
function depotImage(d: DepotFuel): { width: number; height: number; data: Uint8ClampedArray } {
  const sym = sidcToCanvas(DEPOT_SIDC, 24)
  const symW = sym?.width ?? 24
  const symH = sym?.height ?? 24
  const w = Math.max(40, symW)
  const barH = 5
  const gap = 2
  const barsTop = symH + 3
  const h = barsTop + barH * 2 + gap
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }
  if (sym) ctx.drawImage(sym, (w - symW) / 2, 0)
  const g = depotGauges(d.stocks)
  const barW = 34
  const bx = (w - barW) / 2
  gaugeBar(ctx, bx, barsTop, barW, barH, g.diesel, DIESEL_COLOR)
  gaugeBar(ctx, bx, barsTop + barH + gap, barW, barH, g.jp8, JP8_COLOR)
  return ctx.getImageData(0, 0, w, h)
}

/** Register a composited image per distinct depot fill, then push the depot points. */
function syncDepots(map: maplibregl.Map, depots: DepotFuel[]): void {
  for (const d of depots) {
    const key = depotIconKey(d)
    if (!map.hasImage(key)) map.addImage(key, depotImage(d))
  }
  setData(map, 'depots', depotsToGeoJSON(depots))
}

/** Rasterise a short label to a small pill image (offline — same technique as unit icons). */
function labelImage(text: string): { width: number; height: number; data: Uint8ClampedArray } {
  const pad = 4
  const fontPx = 12
  const measure = document.createElement('canvas').getContext('2d')
  const font = `${fontPx}px system-ui, -apple-system, sans-serif`
  if (measure) measure.font = font
  const width = Math.ceil((measure?.measureText(text).width ?? text.length * 7) + pad * 2)
  const height = fontPx + pad * 2
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return { width, height, data: new Uint8ClampedArray(width * height * 4) }
  ctx.font = font
  ctx.textBaseline = 'middle'
  ctx.fillStyle = 'rgba(244,241,232,0.72)'
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = '#3a352b'
  ctx.fillText(text, pad, height / 2 + 0.5)
  return ctx.getImageData(0, 0, width, height)
}

/** Rasterise a category glyph into a small dark disc icon (offline — same technique as labels). */
function glyphImage(glyph: string): { width: number; height: number; data: Uint8ClampedArray } {
  const d = 22
  const canvas = document.createElement('canvas')
  canvas.width = d
  canvas.height = d
  const ctx = canvas.getContext('2d')
  if (!ctx) return { width: d, height: d, data: new Uint8ClampedArray(d * d * 4) }
  ctx.beginPath()
  ctx.arc(d / 2, d / 2, d / 2 - 1, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(20,18,14,0.82)'
  ctx.fill()
  ctx.lineWidth = 1.5
  ctx.strokeStyle = 'rgba(244,241,232,0.9)'
  ctx.stroke()
  ctx.fillStyle = '#f4f1e8'
  ctx.font = 'bold 12px system-ui, -apple-system, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(glyph, d / 2, d / 2 + 0.5)
  return ctx.getImageData(0, 0, d, d)
}

/**
 * Repaint the MGRS grid for the current precision. MGRS is the only grid (v2 Wave 9 — hex retired):
 * the H3 `tiles` layers stay only as the invisible data substrate (tiles-fill at opacity 0 is the
 * click target; the outline + hex threat wash are hidden — ambient threat is the MGRS cell-threat
 * shading).
 */
function applyMgrsGrid(map: maplibregl.Map, theater: Theater, precisionM: number): void {
  const lines: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: gridLines(theater.bbox, precisionM) } },
    ],
  }
  setData(map, 'mgrs-grid', lines)
  const labelFeatures: GeoJSON.Feature[] = gridLabels(theater.bbox, precisionM).map((l) => {
    const icon = `mgrs:${l.label}`
    if (!map.hasImage(icon)) map.addImage(icon, labelImage(l.label))
    return { type: 'Feature', properties: { icon }, geometry: { type: 'Point', coordinates: [l.lon, l.lat] } }
  })
  setData(map, 'mgrs-labels', { type: 'FeatureCollection', features: labelFeatures })
  map.setLayoutProperty('mgrs-grid-line', 'visibility', 'visible')
  map.setLayoutProperty('mgrs-labels', 'visibility', 'visible')
  // tiles-fill stays present at opacity 0 so a click still resolves a location for the MGRS cell.
  map.setPaintProperty('tiles-fill', 'fill-opacity', 0)
  map.setLayoutProperty('tiles-outline', 'visibility', 'none')
  map.setLayoutProperty('tiles-threat', 'visibility', 'none')
}

/** Live MGRS coordinate readout (to 1 m) following the cursor, shown in either layout. */
function wireReadout(map: maplibregl.Map, el: HTMLElement): void {
  map.on('mousemove', (e) => {
    el.textContent = formatMgrs(toMgrs(e.lngLat.lat, e.lngLat.lng, 5))
  })
}

function wireInteraction(map: maplibregl.Map, propsRef: { current: MapViewProps }): void {
  map.on('click', (e) => {
    const p = propsRef.current
    if (p.depotMode) {
      p.onPlaceDepot(e.lngLat.lat, e.lngLat.lng)
      return
    }
    if (p.obstacleMode) {
      const hitObs = map.queryRenderedFeatures(e.point, { layers: ['obstacles'] })
      if (hitObs.length > 0) {
        p.onRemoveObstacle(String(hitObs[0].properties?.id))
        return
      }
      p.onPlaceObstacle(e.lngLat.lat, e.lngLat.lng)
      return
    }
    const hitUnits = map.queryRenderedFeatures(e.point, { layers: ['units'] })
    if (hitUnits.length > 0) {
      p.onSelectUnit(String(hitUnits[0].properties?.id))
      return
    }
    if (p.planning) {
      p.onPickDestination(e.lngLat.lat, e.lngLat.lng)
      return
    }
    const hitTiles = map.queryRenderedFeatures(e.point, { layers: ['tiles-fill'] })
    if (hitTiles.length > 0) {
      // MGRS-native inspection: resolve the cell from the click coordinate (v2 Wave 9).
      p.onSelectCell(e.lngLat.lat, e.lngLat.lng)
      return
    }
    p.onClearSelection()
  })
  for (const layer of ['units', 'tiles-fill']) {
    map.on('mouseenter', layer, () => (map.getCanvas().style.cursor = 'pointer'))
    map.on('mouseleave', layer, () => (map.getCanvas().style.cursor = ''))
  }
}

/** Right-click info popup showing a hex's attributes (terrain, threat, road, intel). */
function wireHover(map: maplibregl.Map): void {
  const popup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, className: 'hex-popup' })
  map.on('contextmenu', 'tiles-fill', (e) => {
    e.preventDefault()
    const props = e.features?.[0]?.properties
    if (!props) return
    popup
      .setLngLat(e.lngLat)
      .setHTML(
        `<b>${props.terrain}</b> · threat ${props.threat_level}/5<br>` +
          `road ${props.road_condition} · intel ${props.intel_level}`,
      )
      .addTo(map)
  })
}

/** Hover popup over a combat-event square: event, category, estimated threat, sender. */
function wireCombatHover(map: maplibregl.Map): void {
  const popup = new maplibregl.Popup({
    closeButton: false,
    closeOnClick: false,
    className: 'hex-popup',
  })
  map.on('mousemove', 'combat-events-fill', (e) => {
    const p = e.features?.[0]?.properties
    if (!p) return
    map.getCanvas().style.cursor = 'pointer'
    popup
      .setLngLat(e.lngLat)
      .setHTML(
        `<b>${p.event}</b><br>${p.category} · threat ${p.estimated_threat}/5<br>` +
          `<i>${p.sender}</i>`,
      )
      .addTo(map)
  })
  map.on('mouseleave', 'combat-events-fill', () => {
    map.getCanvas().style.cursor = ''
    popup.remove()
  })
}

export function MapView(props: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const readoutRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const readyRef = useRef(false)
  const propsRef = useRef(props)

  // Keep the latest props reachable from map event handlers without re-creating the map.
  useEffect(() => {
    propsRef.current = props
  })

  // Create the map exactly once.
  useEffect(() => {
    if (containerRef.current === null || mapRef.current !== null) return
    ensureProtocol()
    const { theater } = propsRef.current
    const archiveUrl = `${window.location.origin}${PMTILES_PATH}`
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildBasemapStyle(archiveUrl),
      center: [theater.center_lon, theater.center_lat],
      zoom: theater.default_zoom,
      // Frame the theater: constrain panning to its bbox (padded) so the operator can't drift off.
      maxBounds: paddedBounds(theater.bbox),
      attributionControl: { compact: true },
    })
    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    map.on('load', () => {
      const p = propsRef.current
      initLayers(map)
      setData(map, 'tiles', tilesToGeoJSON(p.tiles))
      setData(map, 'cell-threat', cellThreatToGeoJSON(p.tiles, p.gridPrecisionM))
      syncUnits(map, p.units, p.unitTypes, p.livePositions)
      syncUnitFuelBars(map, p.units, p.unitTypes, p.livePositions, p.showUnitFuelBars ?? false)
      map.setFilter('unit-fuel-bars', ['!=', ['get', 'id'], p.selectedUnitId ?? ' '])
      map.setFilter('unit-fuel-bars-selected', ['==', ['get', 'id'], p.selectedUnitId ?? ''])
      syncEnemyUnits(map, p.enemyUnits)
      setData(map, 'active-routes', activeRoutesToGeoJSON(p.activeRoutes))
      setData(map, 'route', routeToGeoJSON(p.routeGeometry))
      setData(map, 'destination', destinationToGeoJSON(p.destination))
      setData(map, 'obstacles', obstaclesToGeoJSON(p.obstacles))
      setData(map, 'combat-events', combatEventsToGeoJSON(p.combatEvents))
      syncDepots(map, p.depots)
      setData(map, 'rendezvous', destinationToGeoJSON(p.rendezvous))
      setData(map, 'advice-arrow', adviceArrowToGeoJSON(p.adviceArrow?.from, p.adviceArrow?.to))
      setData(map, 'advice-dest', destinationToGeoJSON(p.adviceDest))
      wireInteraction(map, propsRef)
      wireHover(map)
      wireCombatHover(map)
      applyMgrsGrid(map, p.theater, p.gridPrecisionM)
      if (readoutRef.current) wireReadout(map, readoutRef.current)
      readyRef.current = true
    })
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
      readyRef.current = false
    }
  }, [])

  // Imperative source updates once the style is loaded.
  useEffect(() => {
    if (readyRef.current && mapRef.current) setData(mapRef.current, 'tiles', tilesToGeoJSON(props.tiles))
  }, [props.tiles])
  useEffect(() => {
    if (readyRef.current && mapRef.current)
      setData(mapRef.current, 'cell-threat', cellThreatToGeoJSON(props.tiles, props.gridPrecisionM))
  }, [props.tiles, props.gridPrecisionM])
  useEffect(() => {
    if (readyRef.current && mapRef.current) {
      syncUnits(mapRef.current, props.units, props.unitTypes, props.livePositions)
      syncUnitFuelBars(
        mapRef.current,
        props.units,
        props.unitTypes,
        props.livePositions,
        props.showUnitFuelBars ?? false,
      )
    }
  }, [props.units, props.unitTypes, props.livePositions, props.showUnitFuelBars])
  useEffect(() => {
    if (readyRef.current && mapRef.current)
      setData(mapRef.current, 'active-routes', activeRoutesToGeoJSON(props.activeRoutes))
  }, [props.activeRoutes])
  useEffect(() => {
    if (readyRef.current && mapRef.current)
      setData(mapRef.current, 'route', routeToGeoJSON(props.routeGeometry))
  }, [props.routeGeometry])
  useEffect(() => {
    if (readyRef.current && mapRef.current)
      setData(mapRef.current, 'destination', destinationToGeoJSON(props.destination))
  }, [props.destination])
  useEffect(() => {
    if (readyRef.current && mapRef.current)
      setData(mapRef.current, 'obstacles', obstaclesToGeoJSON(props.obstacles))
  }, [props.obstacles])
  useEffect(() => {
    if (readyRef.current && mapRef.current) syncEnemyUnits(mapRef.current, props.enemyUnits)
  }, [props.enemyUnits])
  useEffect(() => {
    if (readyRef.current && mapRef.current)
      setData(mapRef.current, 'combat-events', combatEventsToGeoJSON(props.combatEvents))
  }, [props.combatEvents])
  // Highlight + recentre only when the *selected event* changes — NOT on every combat_event frame
  // (combatEvents is a fresh array each render, so depending on it would re-focus on every tick).
  useEffect(() => {
    if (!readyRef.current || !mapRef.current) return
    const map = mapRef.current
    map.setFilter('combat-events-highlight', ['==', ['get', 'id'], props.highlightEventId ?? ''])
    if (props.highlightEventId) {
      const ev = propsRef.current.combatEvents.find((e) => e.id === props.highlightEventId)
      if (ev) map.easeTo({ center: [ev.lon, ev.lat], duration: 600 })
    }
  }, [props.highlightEventId])
  useEffect(() => {
    if (readyRef.current && mapRef.current) syncDepots(mapRef.current, props.depots)
  }, [props.depots])
  useEffect(() => {
    // Locate a supply point on the map (v2 Wave 11 F5).
    if (!readyRef.current || !mapRef.current || !props.locateDepotId) return
    const d = propsRef.current.depots.find((x) => x.depot.id === props.locateDepotId)
    if (d) mapRef.current.easeTo({ center: [d.depot.lon, d.depot.lat], duration: 600, zoom: 12 })
  }, [props.locateDepotId])
  useEffect(() => {
    if (readyRef.current && mapRef.current)
      setData(mapRef.current, 'rendezvous', destinationToGeoJSON(props.rendezvous))
  }, [props.rendezvous])
  useEffect(() => {
    if (readyRef.current && mapRef.current)
      setData(
        mapRef.current,
        'advice-arrow',
        adviceArrowToGeoJSON(props.adviceArrow?.from, props.adviceArrow?.to),
      )
  }, [props.adviceArrow])
  useEffect(() => {
    if (readyRef.current && mapRef.current)
      setData(mapRef.current, 'advice-dest', destinationToGeoJSON(props.adviceDest))
  }, [props.adviceDest])
  useEffect(() => {
    if (!readyRef.current || !mapRef.current) return
    const map = mapRef.current
    if (props.highlightH3) {
      const [lat, lon] = cellToLatLng(props.highlightH3)
      setData(map, 'sector-highlight', {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'Polygon',
              coordinates: [squareCornersFromCenter(lat, lon, props.gridPrecisionM)],
            },
          },
        ],
      })
      map.easeTo({ center: [lon, lat], duration: 600 })
    } else {
      setData(map, 'sector-highlight', EMPTY)
    }
  }, [props.highlightH3, props.gridPrecisionM])
  useEffect(() => {
    if (!readyRef.current || !mapRef.current) return
    const sel = props.selectedUnitId ?? ''
    mapRef.current.setFilter('units-selected', ['==', ['get', 'id'], sel])
    // Selected unit's fuel bar renders via the dedicated top layer (v2 Wave 11 F7).
    mapRef.current.setFilter('unit-fuel-bars', ['!=', ['get', 'id'], sel || ' '])
    mapRef.current.setFilter('unit-fuel-bars-selected', ['==', ['get', 'id'], sel])
  }, [props.selectedUnitId])
  useEffect(() => {
    if (!readyRef.current || !mapRef.current) return
    const c = props.selectedCell
    const data: GeoJSON.GeoJSON = c
      ? {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'Polygon',
                coordinates: [squareCornersFromCenter(c.lat, c.lon, props.gridPrecisionM)],
              },
            },
          ],
        }
      : EMPTY
    setData(mapRef.current, 'selected-cell', data)
  }, [props.selectedCell, props.gridPrecisionM])
  useEffect(() => {
    if (readyRef.current && mapRef.current)
      applyMgrsGrid(mapRef.current, props.theater, props.gridPrecisionM)
  }, [props.theater, props.gridPrecisionM])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} data-testid="map-container" style={{ width: '100%', height: '100%' }} />
      <div ref={readoutRef} className="mgrs-readout" data-testid="mgrs-readout" />
    </div>
  )
}
