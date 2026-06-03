import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Recommendation, TileMutationRequest } from './api/types'
import { AdvisorPanel } from './components/AdvisorPanel'
import { ChatterLog } from './components/ChatterLog'
import { GridLayoutControl } from './components/GridLayoutControl'
import { InspectPanel, type InspectCell } from './components/InspectPanel'
import { MoveRoutesPanel } from './components/MoveRoutesPanel'
import { ObstacleKindPicker } from './components/ObstacleKindPicker'
import type { ObstacleKind } from './components/obstacleKinds'
import { RoleToggle } from './components/RoleToggle'
import { SupplyPanel } from './components/SupplyPanel'
import { UnitOverview } from './components/UnitOverview'
import { OSM_ATTRIBUTION } from './config'
import { canShow, type Role } from './roles'
import { useObstacleOps } from './hooks/useObstacleOps'
import { useSimSocket } from './hooks/useSimSocket'
import { useAdviceMarker } from './hooks/useAdviceMarker'
import { useAdvisor } from './hooks/useAdvisor'
import { useMovePlanning } from './hooks/useMovePlanning'
import { useSupply } from './hooks/useSupply'
import { useSupplyOrders } from './hooks/useSupplyOrders'
import { useTheaterData } from './hooks/useTheaterData'
import { useUnitOverview } from './hooks/useUnitOverview'
import { aggregateCell } from './map/cellSituation'
import { MapView, type GridLayout } from './map/MapView'
import { cellIdFor, cellMgrsLabel, DEFAULT_PRECISION_M, GRID_PRECISIONS } from './map/mgrsGrid'

export default function App() {
  const [role, setRole] = useState<Role>('OF4')
  const { theater, tiles, units, setUnits, unitTypes, enemyUnits, error } = useTheaterData()

  const [selectedCell, setSelectedCell] = useState<{ lat: number; lon: number } | null>(null)
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null)
  const [highlightH3, setHighlightH3] = useState<string | null>(null)
  const [highlightEventId, setHighlightEventId] = useState<string | null>(null)

  // Map grid: MGRS only (hex layout archived in code, not exposed). Drawn precision is persisted.
  const gridLayout: GridLayout = 'mgrs'
  const [gridPrecisionM, setGridPrecisionM] = useState<number>(() => {
    const v = Number(localStorage.getItem('bf.gridPrecisionM'))
    return GRID_PRECISIONS.some((p) => p.m === v) ? v : DEFAULT_PRECISION_M
  })
  useEffect(() => {
    localStorage.setItem('bf.gridPrecisionM', String(gridPrecisionM))
  }, [gridPrecisionM])

  const { positions: live, tileUpdates, combatEvents, chatter, strategic, pushChatter, supplyTick } =
    useSimSocket()

  // Operator ops: obstacles + tile edits + the obstacle-placement mode and chosen kind.
  const { obstacles, placeObstacle, removeObstacle, mutateTile } = useObstacleOps()
  const [obstacleMode, setObstacleMode] = useState(false)
  const [obstacleKind, setObstacleKind] = useState<ObstacleKind>('minefield')

  // Tiles merged with their latest live tile_update (threat/road/situation/etc.).
  const displayedTiles = useMemo(() => {
    if (Object.keys(tileUpdates).length === 0) return tiles
    return tiles.map((t) => {
      const u = tileUpdates[t.h3_index]
      return u ? { ...t, ...u, h3_index: t.h3_index, boundary: t.boundary } : t
    })
  }, [tiles, tileUpdates])

  // The clicked MGRS cell: aggregate the displayed tiles + units that fall in it (client-side).
  const selectedCellInfo = useMemo<InspectCell | null>(() => {
    if (!selectedCell) return null
    const cid = cellIdFor(selectedCell.lat, selectedCell.lon, gridPrecisionM)
    const tilesIn = displayedTiles.filter(
      (t) => cellIdFor(t.center_lat, t.center_lon, gridPrecisionM) === cid,
    )
    const unitsIn = units
      .filter((u) => {
        const p = live[u.id]
        const lat = p ? p.lat : u.lat
        const lon = p ? p.lon : u.lon
        return cellIdFor(lat, lon, gridPrecisionM) === cid
      })
      .map((u) => ({ id: u.id, name: u.name }))
    return {
      mgrs: cellMgrsLabel(selectedCell.lat, selectedCell.lon, gridPrecisionM),
      situation: aggregateCell(tilesIn),
      h3Indexes: tilesIn.map((t) => t.h3_index),
      units: unitsIn,
    }
  }, [selectedCell, displayedTiles, gridPrecisionM, units, live])

  const onMutateCell = useCallback(
    (h3Indexes: string[], mutation: TileMutationRequest) => {
      for (const h3 of h3Indexes) mutateTile(h3, mutation)
    },
    [mutateTile],
  )
  const selectedUnit = useMemo(
    () => units.find((u) => u.id === selectedUnitId),
    [units, selectedUnitId],
  )
  const selectedUnitType = useMemo(
    () => unitTypes.find((ut) => ut.id === selectedUnit?.unit_type_id),
    [unitTypes, selectedUnit],
  )

  // Move planning (destination, route options, confirm) lives in its own hook.
  const planning = useMovePlanning(selectedUnitId, selectedUnit?.name ?? null, live, pushChatter)

  // OF-8 supply + advisor + unit roster.
  const supply = useSupply(role === 'OF8', supplyTick)
  const supplyOrders = useSupplyOrders(units, unitTypes, pushChatter, supply.refetch)
  const roster = useUnitOverview(setUnits)
  const advisor = useAdvisor(pushChatter, supply.refetch, {
    instanceId: selectedUnitId,
    destination: planning.destination,
  })

  const livePositions = useMemo(() => {
    const out: Record<string, { lat: number; lon: number }> = {}
    for (const u of Object.values(live)) {
      if (u.status !== 'cancelled') out[u.instance_id] = { lat: u.lat, lon: u.lon }
    }
    return out
  }, [live])
  const selectedLive = selectedUnitId ? live[selectedUnitId] : undefined

  // A clicked advisor recommendation marked on the map: highlight + a movement arrow.
  const [selectedAdvice, setSelectedAdvice] = useState<Recommendation | null>(null)
  const adviceMarker = useAdviceMarker(selectedAdvice, units, livePositions, supply.depots)

  const clear = useCallback(() => {
    setSelectedCell(null)
    setSelectedUnitId(null)
    setHighlightH3(null)
    setHighlightEventId(null)
    planning.resetPlanning()
  }, [planning])

  // Click a tagged combat chatter line: focus its MGRS square (clearing any other selection), and
  // clicking the same line again toggles the highlight off. Clearing also happens via `clear`
  // (map-background click or closing any inspect panel).
  const locateEvent = useCallback(
    (id: string) => {
      setSelectedCell(null)
      setSelectedUnitId(null)
      setHighlightH3(null)
      planning.resetPlanning()
      setHighlightEventId((prev) => (prev === id ? null : id))
    },
    [planning],
  )

  const ready = theater !== null
  // Obstacle placement is an OF-4 tactical tool; never active in the OF-8 supply view.
  const obstacleActive = canShow(role, 'obstacleMode') && obstacleMode

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">BattleFuel</span>
        {theater && <span className="theater">{theater.name}</span>}
        {theater && <RoleToggle role={role} onChange={setRole} />}
        {theater && canShow(role, 'unitOverview') && (
          <button
            className={`mode-toggle${roster.open ? ' active' : ''}`}
            data-testid="unit-overview-toggle"
            onClick={roster.toggle}
          >
            Units
          </button>
        )}
        {theater && canShow(role, 'advisor') && (
          <button
            className={`mode-toggle${advisor.open ? ' active' : ''}`}
            data-testid="advisor-toggle"
            onClick={advisor.toggle}
          >
            Advisor
          </button>
        )}
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
              routeGeometry={planning.routeGeometry}
              destination={planning.destination}
              planning={selectedUnitId !== null}
              livePositions={livePositions}
              activeRoutes={planning.activeRouteGeometries}
              obstacles={obstacles}
              obstacleMode={obstacleActive}
              combatEvents={Object.values(combatEvents)}
              highlightEventId={highlightEventId}
              enemyUnits={enemyUnits}
              depots={canShow(role, 'depotOverlay') ? (supply.overview?.depots ?? []) : []}
              rendezvous={canShow(role, 'supplyPanel') ? supplyOrders.rendezvous : null}
              adviceArrow={adviceMarker.arrow}
              adviceDest={adviceMarker.dest}
              highlightH3={supplyOrders.truckHighlightH3 ?? adviceMarker.highlightH3 ?? highlightH3}
              selectedUnitId={selectedUnitId}
              selectedCell={selectedCell}
              gridLayout={gridLayout}
              gridPrecisionM={gridPrecisionM}
              onPlaceObstacle={(lat, lon) => placeObstacle(lat, lon, obstacleKind)}
              onRemoveObstacle={removeObstacle}
              onSelectCell={(lat, lon) => {
                setSelectedUnitId(null)
                setHighlightEventId(null)
                planning.resetPlanning()
                setSelectedCell({ lat, lon })
              }}
              onSelectUnit={(id) => {
                setSelectedCell(null)
                setHighlightEventId(null)
                planning.resetPlanning()
                setSelectedUnitId(id)
              }}
              onPickDestination={planning.pickDestination}
              onClearSelection={clear}
            />
            <GridLayoutControl precisionM={gridPrecisionM} onPrecision={setGridPrecisionM} />
            <ChatterLog messages={chatter} onSelect={setHighlightH3} onSelectEvent={locateEvent} />
            {canShow(role, 'strategicFeed') && (
              <ChatterLog
                messages={strategic}
                title="Strategic Support"
                className="chatter strategic-feed"
                testId="strategic-feed"
                emptyText="Awaiting strategic traffic…"
              />
            )}
            {canShow(role, 'supplyPanel') && (
              <SupplyPanel
                overview={supply.overview}
                depots={supply.depots}
                refuelTargets={supplyOrders.refuelTargets}
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
                loading={planning.planLoading}
                error={planning.planError}
                options={planning.routeOptions}
                selectedMetric={planning.selectedMetric}
                confirming={planning.confirming}
                onSelectOption={planning.setSelectedMetric}
                onConfirm={() => planning.confirmMove(clear)}
                onCancel={clear}
              />
            )}
            {canShow(role, 'advisor') && advisor.open && (
              <AdvisorPanel
                result={advisor.result}
                loading={advisor.loading}
                error={advisor.error}
                busy={advisor.busy}
                canRoute={selectedUnitId !== null && planning.destination !== null}
                onRequest={advisor.request}
                onApply={advisor.apply}
                onSelect={setSelectedAdvice}
                onClose={() => {
                  setSelectedAdvice(null)
                  advisor.toggle()
                }}
              />
            )}
            {canShow(role, 'unitOverview') && roster.open && (
              <UnitOverview
                units={units}
                unitTypes={unitTypes}
                onSetTelemetry={roster.setTelemetry}
                onClose={roster.toggle}
              />
            )}
            <InspectPanel
              cell={selectedCellInfo ?? undefined}
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
              onMutateCell={onMutateCell}
              onClose={clear}
            />
          </>
        )}
      </main>
    </div>
  )
}
