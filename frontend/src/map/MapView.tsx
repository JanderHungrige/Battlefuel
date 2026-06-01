// MapLibre GL map: offline basemap + hex tiles + APP-6 unit symbols + click-to-inspect,
// plus route/destination overlays for move planning. The map is created once and its
// sources are updated imperatively, so overlays (and live motion) never tear it down.

import maplibregl from 'maplibre-gl'
import { Protocol } from 'pmtiles'
import { useEffect, useRef } from 'react'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { Theater, Tile, UnitInstance, UnitType } from '../api/types'
import { PMTILES_PATH } from '../config'
import { buildBasemapStyle } from './basemapStyle'
import {
  activeRoutesToGeoJSON,
  destinationToGeoJSON,
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
  onSelectTile: (h3Index: string) => void
  onSelectUnit: (id: string) => void
  onPickDestination: (lat: number, lon: number) => void
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
    paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.4 },
  })
  map.addLayer({
    id: 'tiles-outline',
    type: 'line',
    source: 'tiles',
    paint: { 'line-color': '#5b6675', 'line-width': 0.5, 'line-opacity': 0.5 },
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
      wireInteraction(map, propsRef)
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

  return (
    <div ref={containerRef} data-testid="map-container" style={{ width: '100%', height: '100%' }} />
  )
}
