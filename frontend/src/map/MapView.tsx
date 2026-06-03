// MapLibre GL map: offline basemap + hex tiles + APP-6 unit symbols + click-to-inspect,
// plus route/destination overlays for move planning. The map is created once and its
// sources are updated imperatively, so overlays (and live motion) never tear it down.

import { cellToLatLng } from 'h3-js'
import maplibregl from 'maplibre-gl'
import { Protocol } from 'pmtiles'
import { useEffect, useRef } from 'react'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { FuelDepot, Obstacle, Theater, Tile, UnitInstance, UnitType } from '../api/types'
import { PMTILES_PATH } from '../config'
import { buildBasemapStyle } from './basemapStyle'
import {
  activeRoutesToGeoJSON,
  adviceArrowToGeoJSON,
  depotsToGeoJSON,
  destinationToGeoJSON,
  obstaclesToGeoJSON,
  paddedBounds,
  routeToGeoJSON,
  tilesToGeoJSON,
  unitsToGeoJSON,
} from './overlays'
import { sidcToImage } from './symbols'

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
  livePositions: Record<string, { lat: number; lon: number }>
  activeRoutes: number[][][]
  obstacles: Obstacle[]
  obstacleMode: boolean
  depots: FuelDepot[]
  rendezvous: { lat: number; lon: number } | null
  adviceArrow: { from: { lat: number; lon: number }; to: { lat: number; lon: number } } | null
  adviceDest: { lat: number; lon: number } | null
  highlightH3: string | null
  onSelectTile: (h3Index: string) => void
  onSelectUnit: (id: string) => void
  onPickDestination: (lat: number, lon: number) => void
  onPlaceObstacle: (lat: number, lon: number) => void
  onRemoveObstacle: (id: string) => void
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
  map.addLayer({
    id: 'tiles-highlight',
    type: 'line',
    source: 'tiles',
    filter: ['==', ['get', 'h3_index'], ''],
    paint: { 'line-color': '#ffd23f', 'line-width': 3 },
  })

  map.addSource('active-routes', { type: 'geojson', data: EMPTY })
  map.addLayer({
    id: 'active-routes-line',
    type: 'line',
    source: 'active-routes',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#00e5cc', 'line-width': 3, 'line-opacity': 0.45, 'line-dasharray': [2, 2] },
  })

  map.addSource('route', { type: 'geojson', data: EMPTY })
  map.addLayer({
    id: 'route-line',
    type: 'line',
    source: 'route',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#00e5cc', 'line-width': 4, 'line-opacity': 0.85 },
  })

  map.addSource('destination', { type: 'geojson', data: EMPTY })
  map.addLayer({
    id: 'destination-point',
    type: 'circle',
    source: 'destination',
    paint: {
      'circle-radius': 7,
      'circle-color': '#00e5cc',
      'circle-stroke-width': 2,
      'circle-stroke-color': '#0e1116',
    },
  })

  map.addSource('units', { type: 'geojson', data: EMPTY })
  map.addLayer({
    id: 'units',
    type: 'symbol',
    source: 'units',
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

  // Fuel depots (OF-8 supply overlay): amber diamonds.
  map.addSource('depots', { type: 'geojson', data: EMPTY })
  map.addLayer({
    id: 'depots',
    type: 'circle',
    source: 'depots',
    paint: {
      'circle-radius': 9,
      'circle-color': '#ffb020',
      'circle-opacity': 0.9,
      'circle-stroke-width': 2,
      'circle-stroke-color': '#0e1116',
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

function wireInteraction(map: maplibregl.Map, propsRef: { current: MapViewProps }): void {
  map.on('click', (e) => {
    const p = propsRef.current
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
      p.onSelectTile(String(hitTiles[0].properties?.h3_index))
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

export function MapView(props: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
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
      syncUnits(map, p.units, p.unitTypes, p.livePositions)
      setData(map, 'active-routes', activeRoutesToGeoJSON(p.activeRoutes))
      setData(map, 'route', routeToGeoJSON(p.routeGeometry))
      setData(map, 'destination', destinationToGeoJSON(p.destination))
      setData(map, 'obstacles', obstaclesToGeoJSON(p.obstacles))
      setData(map, 'depots', depotsToGeoJSON(p.depots))
      setData(map, 'rendezvous', destinationToGeoJSON(p.rendezvous))
      setData(map, 'advice-arrow', adviceArrowToGeoJSON(p.adviceArrow?.from, p.adviceArrow?.to))
      setData(map, 'advice-dest', destinationToGeoJSON(p.adviceDest))
      wireInteraction(map, propsRef)
      wireHover(map)
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
      syncUnits(mapRef.current, props.units, props.unitTypes, props.livePositions)
  }, [props.units, props.unitTypes, props.livePositions])
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
    if (readyRef.current && mapRef.current)
      setData(mapRef.current, 'depots', depotsToGeoJSON(props.depots))
  }, [props.depots])
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
    map.setFilter('tiles-highlight', ['==', ['get', 'h3_index'], props.highlightH3 ?? ''])
    if (props.highlightH3) {
      const [lat, lon] = cellToLatLng(props.highlightH3)
      map.easeTo({ center: [lon, lat], duration: 600 })
    }
  }, [props.highlightH3])

  return (
    <div ref={containerRef} data-testid="map-container" style={{ width: '100%', height: '100%' }} />
  )
}
