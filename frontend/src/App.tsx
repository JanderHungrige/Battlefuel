import { useCallback, useEffect, useMemo, useState } from 'react'
import { ApiError, api } from './api/client'
import type { RouteMetric, RouteOption, Theater, Tile, UnitInstance, UnitType } from './api/types'
import { InspectPanel } from './components/InspectPanel'
import { MoveRoutesPanel } from './components/MoveRoutesPanel'
import { ThreatAlerts } from './components/ThreatAlerts'
import { OSM_ATTRIBUTION } from './config'
import { useObstacleOps } from './hooks/useObstacleOps'
import { useSimSocket } from './hooks/useSimSocket'
import { MapView } from './map/MapView'
import { TERRAIN_COLORS } from './map/overlays'

function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 422) return 'No route to that destination.'
    if (e.status === 404) return 'Unit not found.'
    if (e.status === 409) return 'Unit type not in catalog.'
    return e.message
  }
  return e instanceof Error ? e.message : String(e)
}

export default function App() {
  const [theater, setTheater] = useState<Theater | null>(null)
  const [tiles, setTiles] = useState<Tile[]>([])
  const [units, setUnits] = useState<UnitInstance[]>([])
  const [unitTypes, setUnitTypes] = useState<UnitType[]>([])
  const [error, setError] = useState<string | null>(null)

  const [selectedTileH3, setSelectedTileH3] = useState<string | null>(null)
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null)

  // Move planning.
  const [destination, setDestination] = useState<{ lat: number; lon: number } | null>(null)
  const [routeOptions, setRouteOptions] = useState<RouteOption[]>([])
  const [selectedMetric, setSelectedMetric] = useState<RouteMetric | null>(null)
  const [planLoading, setPlanLoading] = useState(false)
  const [planError, setPlanError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  // Live movement: routes confirmed this session, keyed by unit instance id.
  const [activeRoutes, setActiveRoutes] = useState<Record<string, number[][]>>({})
  const { positions: live, tileUpdates, tileAlerts } = useSimSocket()

  // Operator ops: manual obstacles + tile edits (+ obstacle-placement mode toggle).
  const { obstacles, placeObstacle, removeObstacle, mutateTile } = useObstacleOps()
  const [obstacleMode, setObstacleMode] = useState(false)

  useEffect(() => {
    let active = true
    Promise.all([api.getTheater(), api.getTiles(), api.getUnitInstances(), api.getUnitTypes()])
      .then(([t, ti, u, ut]) => {
        if (!active) return
        setTheater(t)
        setTiles(ti)
        setUnits(u)
        setUnitTypes(ut)
      })
      .catch((e: unknown) => {
        if (active) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      active = false
    }
  }, [])

  // Tiles merged with their latest live tile_update (threat/road/etc.), for the overlay + inspect.
  const displayedTiles = useMemo(() => {
    if (Object.keys(tileUpdates).length === 0) return tiles
    return tiles.map((t) => {
      const u = tileUpdates[t.h3_index]
      return u
        ? {
            ...t,
            terrain: u.terrain,
            threat_level: u.threat_level,
            road_condition: u.road_condition,
            intel_level: u.intel_level,
            weather: u.weather,
            cover: u.cover,
          }
        : t
    })
  }, [tiles, tileUpdates])

  const selectedTile = useMemo(
    () => displayedTiles.find((t) => t.h3_index === selectedTileH3),
    [displayedTiles, selectedTileH3],
  )
  const selectedUnit = useMemo(
    () => units.find((u) => u.id === selectedUnitId),
    [units, selectedUnitId],
  )
  const selectedUnitType = useMemo(
    () => unitTypes.find((ut) => ut.id === selectedUnit?.unit_type_id),
    [unitTypes, selectedUnit],
  )
  const routeGeometry = useMemo(
    () => routeOptions.find((o) => o.metric === selectedMetric)?.geometry ?? null,
    [routeOptions, selectedMetric],
  )

  // Live marker positions (keep through arrival; a cancelled unit reverts to its base point).
  const livePositions = useMemo(() => {
    const out: Record<string, { lat: number; lon: number }> = {}
    for (const u of Object.values(live)) {
      if (u.status !== 'cancelled') out[u.instance_id] = { lat: u.lat, lon: u.lon }
    }
    return out
  }, [live])
  // Draw confirmed routes, dropping any whose unit the sim reports finished/cancelled.
  const activeRouteGeometries = useMemo(
    () =>
      Object.entries(activeRoutes)
        .filter(([instId]) => {
          const u = live[instId]
          return !(u && (u.status === 'complete' || u.status === 'cancelled'))
        })
        .map(([, geom]) => geom),
    [activeRoutes, live],
  )
  const selectedLive = selectedUnitId ? live[selectedUnitId] : undefined

  const resetPlanning = useCallback(() => {
    setDestination(null)
    setRouteOptions([])
    setSelectedMetric(null)
    setPlanError(null)
    setPlanLoading(false)
  }, [])

  const clear = useCallback(() => {
    setSelectedTileH3(null)
    setSelectedUnitId(null)
    resetPlanning()
  }, [resetPlanning])

  const pickDestination = useCallback(
    (lat: number, lon: number) => {
      if (!selectedUnitId) return
      setDestination({ lat, lon })
      setRouteOptions([])
      setSelectedMetric(null)
      setPlanError(null)
      setPlanLoading(true)
      api
        .planRoute({ instance_id: selectedUnitId, dest_lat: lat, dest_lon: lon })
        .then((opts) => {
          setRouteOptions(opts)
          setSelectedMetric(opts[0]?.metric ?? null)
        })
        .catch((e: unknown) => setPlanError(errorMessage(e)))
        .finally(() => setPlanLoading(false))
    },
    [selectedUnitId],
  )

  const confirmMove = useCallback(() => {
    if (!selectedUnitId || !destination || !selectedMetric) return
    setConfirming(true)
    setPlanError(null)
    api
      .createMoveOrder({
        instance_id: selectedUnitId,
        dest_lat: destination.lat,
        dest_lon: destination.lon,
        metric: selectedMetric,
      })
      .then((order) => api.confirmMoveOrder(order.id))
      .then((order) => {
        setActiveRoutes((prev) => ({ ...prev, [order.instance_id]: order.geometry }))
        clear()
      })
      .catch((e: unknown) => setPlanError(errorMessage(e)))
      .finally(() => setConfirming(false))
  }, [selectedUnitId, destination, selectedMetric, clear])

  const ready = theater !== null

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">BattleFuel</span>
        {theater && <span className="theater">{theater.name}</span>}
        {theater && (
          <button
            className={`mode-toggle${obstacleMode ? ' active' : ''}`}
            data-testid="obstacle-mode-toggle"
            onClick={() => setObstacleMode((m) => !m)}
          >
            {obstacleMode ? '🚧 Obstacle mode: ON' : 'Obstacle mode'}
          </button>
        )}
        <span className="spacer" />
        <span className="attribution">{OSM_ATTRIBUTION}</span>
      </header>
      <main className="map-area">
        {error && <div className="status error">Failed to load: {error}</div>}
        {!error && !ready && <div className="status">Loading theater…</div>}
        {ready && theater && (
          <>
            <MapView
              theater={theater}
              tiles={displayedTiles}
              units={units}
              unitTypes={unitTypes}
              routeGeometry={routeGeometry}
              destination={destination}
              planning={selectedUnitId !== null}
              livePositions={livePositions}
              activeRoutes={activeRouteGeometries}
              obstacles={obstacles}
              obstacleMode={obstacleMode}
              onPlaceObstacle={placeObstacle}
              onRemoveObstacle={removeObstacle}
              onSelectTile={(h3) => {
                setSelectedUnitId(null)
                resetPlanning()
                setSelectedTileH3(h3)
              }}
              onSelectUnit={(id) => {
                setSelectedTileH3(null)
                resetPlanning()
                setSelectedUnitId(id)
              }}
              onPickDestination={pickDestination}
              onClearSelection={clear}
            />
            <TerrainLegend />
            <ThreatAlerts alerts={tileAlerts} />
            {selectedUnit && (
              <MoveRoutesPanel
                unitName={selectedUnit.name}
                loading={planLoading}
                error={planError}
                options={routeOptions}
                selectedMetric={selectedMetric}
                confirming={confirming}
                onSelectOption={setSelectedMetric}
                onConfirm={confirmMove}
                onCancel={clear}
              />
            )}
            <InspectPanel
              tile={selectedTile}
              unit={selectedUnit}
              unitType={selectedUnitType}
              live={
                selectedLive
                  ? {
                      fuel_l: selectedLive.fuel_l,
                      progress_m: selectedLive.progress_m,
                      distance_m: selectedLive.distance_m,
                      status: selectedLive.status,
                    }
                  : undefined
              }
              onMutateTile={mutateTile}
              onClose={clear}
            />
          </>
        )}
      </main>
    </div>
  )
}

function TerrainLegend() {
  return (
    <div className="legend" data-testid="legend">
      {Object.entries(TERRAIN_COLORS).map(([terrain, color]) => (
        <span key={terrain} className="legend-item">
          <span className="legend-swatch" style={{ background: color }} />
          {terrain}
        </span>
      ))}
    </div>
  )
}
