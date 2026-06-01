import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from './api/client'
import { errorMessage } from './api/errors'
import type { RouteMetric, RouteOption, Theater, Tile, UnitInstance, UnitType } from './api/types'
import { ChatterLog } from './components/ChatterLog'
import { InspectPanel } from './components/InspectPanel'
import { MoveRoutesPanel } from './components/MoveRoutesPanel'
import { ObstacleKindPicker } from './components/ObstacleKindPicker'
import type { ObstacleKind } from './components/obstacleKinds'
import { RoleToggle } from './components/RoleToggle'
import { SupplyPanel } from './components/SupplyPanel'
import { TerrainLegend } from './components/TerrainLegend'
import { OSM_ATTRIBUTION } from './config'
import { canShow, type Role } from './roles'
import { useObstacleOps } from './hooks/useObstacleOps'
import { useSimSocket } from './hooks/useSimSocket'
import { useSupply } from './hooks/useSupply'
import { useSupplyOrders } from './hooks/useSupplyOrders'
import { MapView } from './map/MapView'

export default function App() {
  const [role, setRole] = useState<Role>('OF4')
  const [theater, setTheater] = useState<Theater | null>(null)
  const [tiles, setTiles] = useState<Tile[]>([])
  const [units, setUnits] = useState<UnitInstance[]>([])
  const [unitTypes, setUnitTypes] = useState<UnitType[]>([])
  const [error, setError] = useState<string | null>(null)

  const [selectedTileH3, setSelectedTileH3] = useState<string | null>(null)
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null)
  const [highlightH3, setHighlightH3] = useState<string | null>(null)

  // Move planning.
  const [destination, setDestination] = useState<{ lat: number; lon: number } | null>(null)
  const [routeOptions, setRouteOptions] = useState<RouteOption[]>([])
  const [selectedMetric, setSelectedMetric] = useState<RouteMetric | null>(null)
  const [planLoading, setPlanLoading] = useState(false)
  const [planError, setPlanError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  const [activeRoutes, setActiveRoutes] = useState<Record<string, number[][]>>({})
  const { positions: live, tileUpdates, chatter, pushChatter, supplyTick } = useSimSocket()

  // OF-8 supply: distribution data + order actions.
  const supply = useSupply(role === 'OF8', supplyTick)
  const supplyOrders = useSupplyOrders(units, pushChatter, supply.refetch)

  // Operator ops: obstacles + tile edits + the obstacle-placement mode and chosen kind.
  const { obstacles, placeObstacle, removeObstacle, mutateTile } = useObstacleOps()
  const [obstacleMode, setObstacleMode] = useState(false)
  const [obstacleKind, setObstacleKind] = useState<ObstacleKind>('minefield')

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

  // Tiles merged with their latest live tile_update (threat/road/situation/etc.).
  const displayedTiles = useMemo(() => {
    if (Object.keys(tileUpdates).length === 0) return tiles
    return tiles.map((t) => {
      const u = tileUpdates[t.h3_index]
      return u ? { ...t, ...u, h3_index: t.h3_index, boundary: t.boundary } : t
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

  const livePositions = useMemo(() => {
    const out: Record<string, { lat: number; lon: number }> = {}
    for (const u of Object.values(live)) {
      if (u.status !== 'cancelled') out[u.instance_id] = { lat: u.lat, lon: u.lon }
    }
    return out
  }, [live])
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
    setHighlightH3(null)
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
    const name = selectedUnit?.name ?? selectedUnitId
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
        pushChatter(`Move order confirmed: ${name} (${order.metric})`, 'order')
        clear()
      })
      .catch((e: unknown) => setPlanError(errorMessage(e)))
      .finally(() => setConfirming(false))
  }, [selectedUnitId, selectedUnit, destination, selectedMetric, clear, pushChatter])

  const ready = theater !== null
  // Obstacle placement is an OF-4 tactical tool; never active in the OF-8 supply view.
  const obstacleActive = canShow(role, 'obstacleMode') && obstacleMode

  // Refuel targets: placed units that are not themselves fuel trucks.
  const refuelTargets = useMemo(
    () =>
      units
        .filter((u) => {
          const t = unitTypes.find((ut) => ut.id === u.unit_type_id)
          return t != null && t.nato_unit_type !== 'fuel_supply'
        })
        .map((u) => ({ id: u.id, name: u.name })),
    [units, unitTypes],
  )

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">BattleFuel</span>
        {theater && <span className="theater">{theater.name}</span>}
        {theater && <RoleToggle role={role} onChange={setRole} />}
        {theater && canShow(role, 'obstacleMode') && (
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
              obstacleMode={obstacleActive}
              depots={canShow(role, 'depotOverlay') ? supply.depots : []}
              rendezvous={canShow(role, 'supplyPanel') ? supplyOrders.rendezvous : null}
              highlightH3={supplyOrders.truckHighlightH3 ?? highlightH3}
              onPlaceObstacle={(lat, lon) => placeObstacle(lat, lon, obstacleKind)}
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
            {canShow(role, 'terrainLegend') && <TerrainLegend />}
            <ChatterLog messages={chatter} onSelect={setHighlightH3} />
            {canShow(role, 'supplyPanel') && (
              <SupplyPanel
                overview={supply.overview}
                depots={supply.depots}
                refuelTargets={refuelTargets}
                recommendation={supplyOrders.recommendation}
                busy={supplyOrders.busy}
                message={supplyOrders.message}
                onBuy={supplyOrders.placeBuy}
                onRefuel={supplyOrders.placeRefuel}
                onConfirmRefuel={supplyOrders.confirmRefuel}
                onCancelRefuel={supplyOrders.cancelRefuel}
              />
            )}
            {obstacleActive && (
              <ObstacleKindPicker selected={obstacleKind} onSelect={setObstacleKind} />
            )}
            {canShow(role, 'moveRoutes') && selectedUnit && (
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
