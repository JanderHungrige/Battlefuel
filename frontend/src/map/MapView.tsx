// MapLibre GL map: offline basemap + hex tile overlay + APP-6 unit symbols + click-to-inspect.

import maplibregl from 'maplibre-gl'
import { Protocol } from 'pmtiles'
import { useEffect, useRef } from 'react'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { Theater, Tile, UnitInstance, UnitType } from '../api/types'
import { PMTILES_PATH } from '../config'
import { buildBasemapStyle } from './basemapStyle'
import { tilesToGeoJSON, unitsToGeoJSON } from './overlays'
import { sidcToImage } from './symbols'

let protocolRegistered = false
function ensureProtocol(): void {
  if (protocolRegistered) return
  maplibregl.addProtocol('pmtiles', new Protocol().tile)
  protocolRegistered = true
}

interface MapViewProps {
  theater: Theater
  tiles: Tile[]
  units: UnitInstance[]
  unitTypes: UnitType[]
  onSelectTile: (h3Index: string) => void
  onSelectUnit: (id: string) => void
  onClearSelection: () => void
}

function addOverlays(map: maplibregl.Map, props: MapViewProps): void {
  // Hex tiles.
  map.addSource('tiles', { type: 'geojson', data: tilesToGeoJSON(props.tiles) })
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

  // Unit symbols (APP-6 via milsymbol).
  const sidcByType: Record<string, string> = {}
  for (const ut of props.unitTypes) sidcByType[ut.id] = ut.sidc
  for (const sidc of new Set(Object.values(sidcByType))) {
    if (sidc && !map.hasImage(sidc)) {
      const img = sidcToImage(sidc)
      if (img) map.addImage(sidc, img.data)
    }
  }
  map.addSource('units', { type: 'geojson', data: unitsToGeoJSON(props.units, sidcByType) })
  map.addLayer({
    id: 'units',
    type: 'symbol',
    source: 'units',
    layout: { 'icon-image': ['get', 'sidc'], 'icon-size': 1, 'icon-allow-overlap': true },
  })
}

function wireInteraction(map: maplibregl.Map, props: MapViewProps): void {
  map.on('click', (e) => {
    const units = map.queryRenderedFeatures(e.point, { layers: ['units'] })
    if (units.length > 0) {
      props.onSelectUnit(String(units[0].properties?.id))
      return
    }
    const tiles = map.queryRenderedFeatures(e.point, { layers: ['tiles-fill'] })
    if (tiles.length > 0) {
      props.onSelectTile(String(tiles[0].properties?.h3_index))
      return
    }
    props.onClearSelection()
  })
  for (const layer of ['units', 'tiles-fill']) {
    map.on('mouseenter', layer, () => (map.getCanvas().style.cursor = 'pointer'))
    map.on('mouseleave', layer, () => (map.getCanvas().style.cursor = ''))
  }
}

export function MapView(props: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)

  useEffect(() => {
    if (containerRef.current === null || mapRef.current !== null) return
    ensureProtocol()
    const archiveUrl = `${window.location.origin}${PMTILES_PATH}`
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildBasemapStyle(archiveUrl),
      center: [props.theater.center_lon, props.theater.center_lat],
      zoom: props.theater.default_zoom,
      attributionControl: { compact: true },
    })
    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    map.on('load', () => {
      addOverlays(map, props)
      wireInteraction(map, props)
    })
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [props])

  return (
    <div ref={containerRef} data-testid="map-container" style={{ width: '100%', height: '100%' }} />
  )
}
