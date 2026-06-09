import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from './api/client'
import { errorMessage } from './api/errors'
import type { Recommendation, TileMutationRequest } from './api/types'
import { AdvisorPanel } from './components/AdvisorPanel'
import { ChatterLog } from './components/ChatterLog'
import { GridLayoutControl } from './components/GridLayoutControl'
import { HaltBanner } from './components/HaltBanner'
import { InspectPanel, type InspectCell } from './components/InspectPanel'
import { MoveRoutesPanel } from './components/MoveRoutesPanel'
import { firstHaltedUnit } from './lib/halt'
import { ObstacleKindPicker } from './components/ObstacleKindPicker'
import type { ObstacleKind } from './components/obstacleKinds'
import { RoleToggle } from './components/RoleToggle'
import { InfoDocsPanel } from './components/InfoDocsPanel'
import { FuelRunPanel } from './components/FuelRunPanel'
import { PlanRendezvousPanel } from './components/PlanRendezvousPanel'
import { RendezvousReminderBanner } from './components/RendezvousReminderBanner'
import { LandingPage } from './components/LandingPage'
import { OrderHistoryPanel } from './components/OrderHistoryPanel'
import { SupplyPanel } from './components/SupplyPanel'
import { UnitOverview } from './components/UnitOverview'
import { OSM_ATTRIBUTION } from './config'
import { LOGISTIC_SITE_TYPES, logisticSiteLabel } from './lib/logisticSite'
import { shouldRefuelOnClick } from './lib/refuelOnClick'
import { canShow, type Role } from './roles'
import { useObstacleOps } from './hooks/useObstacleOps'
import { useSimSocket } from './hooks/useSimSocket'
import { useAdviceMarker } from './hooks/useAdviceMarker'
import { useAdvisor } from './hooks/useAdvisor'
import { useMovePlanning } from './hooks/useMovePlanning'
import { useFuelPlatforms } from './hooks/useFuelPlatforms'
import { useInfoDocs } from './hooks/useInfoDocs'
import { useFuelRun } from './hooks/useFuelRun'
import { usePlanRendezvous } from './hooks/usePlanRendezvous'
import { useMoveRefuelStop } from './hooks/useMoveRefuelStop'
import { useRendezvousArchive } from './hooks/useRendezvousArchive'
import { type SupplyTab, dimDepots, dimmedUnitIds } from './lib/supplyFocus'
import { useOrderHistory } from './hooks/useOrderHistory'
import { useSupply } from './hooks/useSupply'
import { useSupplyOrders } from './hooks/useSupplyOrders'
import { useTheaterData } from './hooks/useTheaterData'
import { useUnitOverview } from './hooks/useUnitOverview'
import { aggregateCell } from './map/cellSituation'
import { MapView } from './map/MapView'
import { cellIdFor, cellMgrsLabel, DEFAULT_PRECISION_M, GRID_PRECISIONS } from './map/mgrsGrid'

export default function App() {
  // Branded landing gate (v2 Wave 15): in-memory only (not persisted), so the landing + faux
  // security check show on every page load / refresh.
  const [entered, setEntered] = useState(false)
  const [role, setRole] = useState<Role>('OF4')
  const { theater, tiles, units, setUnits, unitTypes, enemyUnits, error } = useTheaterData()

  const [selectedCell, setSelectedCell] = useState<{ lat: number; lon: number } | null>(null)
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null)
  const [highlightH3, setHighlightH3] = useState<string | null>(null)
  const [highlightEventId, setHighlightEventId] = useState<string | null>(null)

  // Map grid: MGRS only (v2 Wave 9 — hex retired). Drawn precision is persisted.
  const [gridPrecisionM, setGridPrecisionM] = useState<number>(() => {
    const v = Number(localStorage.getItem('bf.gridPrecisionM'))
    return GRID_PRECISIONS.some((p) => p.m === v) ? v : DEFAULT_PRECISION_M
  })
  useEffect(() => {
    localStorage.setItem('bf.gridPrecisionM', String(gridPrecisionM))
  }, [gridPrecisionM])

  const {
    positions: live,
    tileUpdates,
    combatEvents,
    chatter,
    strategic,
    pushChatter,
    supplyTick,
    rendezvousReminder,
  } = useSimSocket()

  // Operator ops: obstacles + tile edits + the obstacle-placement mode and chosen kind.
  const { obstacles, placeObstacle, removeObstacle, mutateTile } = useObstacleOps()
  const [obstacleMode, setObstacleMode] = useState(false)
  const [obstacleKind, setObstacleKind] = useState<ObstacleKind>('minefield')
  const [depotMode, setDepotMode] = useState(false)
  // Site type for the next placed depot ('' = plain depot/marker); v2 Wave 11 F5.
  const [depotSiteType, setDepotSiteType] = useState('')
  // Depot the operator asked to locate on the map (v2 Wave 11 F5).
  const [locatePoint, setLocatePoint] = useState<{ lat: number; lon: number } | null>(null)
  // OF-8 on-map per-unit fuel bars (v2 Wave 11 F7); on by default.
  const [infoBarsOn, setInfoBarsOn] = useState(true)

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
  const fuelPlatforms = useFuelPlatforms(role === 'OF8')
  const orderHistory = useOrderHistory(role === 'OF8', supplyTick)
  const [orderHistoryOpen, setOrderHistoryOpen] = useState(false)
  // OF-8 active supply tab — drives per-tab map focus (dim irrelevant units) (v2 W13).
  const [supplyTab, setSupplyTab] = useState<SupplyTab>('overview')
  // Refuel-stop option picker (v2 W13): preview tanker options, confirm one to execute.
  const closeMovePanel = useCallback(() => {
    setSelectedUnitId(null)
    planning.resetPlanning()
  }, [planning])
  const refuelStop = useMoveRefuelStop(pushChatter, supply.refetch, closeMovePanel)
  // Rendezvous archive + reminder (v2 Wave 13 F4).
  const rdvArchive = useRendezvousArchive(role === 'OF8', supplyTick, pushChatter)
  const [dismissedReminders, setDismissedReminders] = useState<Set<string>>(new Set())
  const activeReminder =
    rendezvousReminder && !dismissedReminders.has(rendezvousReminder.order_id)
      ? rendezvousReminder
      : null
  const reminderName = useCallback(
    (id: string) => units.find((u) => u.id === id)?.name ?? id,
    [units],
  )
  const infoDocs = useInfoDocs(role === 'OF8')
  const [infoDocsOpen, setInfoDocsOpen] = useState(false)
  const roster = useUnitOverview(setUnits)
  const advisor = useAdvisor(pushChatter, supply.refetch, {
    instanceId: selectedUnitId,
    destination: planning.destination,
  })

  const livePositions = useMemo(() => {
    const out: Record<string, { lat: number; lon: number; fuel_l?: number }> = {}
    for (const u of Object.values(live)) {
      if (u.status !== 'cancelled') out[u.instance_id] = { lat: u.lat, lon: u.lon, fuel_l: u.fuel_l }
    }
    return out
  }, [live])
  const selectedLive = selectedUnitId ? live[selectedUnitId] : undefined
  const fuelRun = useFuelRun(units, unitTypes, supply.overview, livePositions, pushChatter, supply.refetch)
  // Plan rendezvous (v2 Wave 13 F3): truck → pick unit → pick sector → dual routes → order/schedule.
  const planRdv = usePlanRendezvous(units, pushChatter, supply.refetch)

  // A clicked advisor recommendation marked on the map: highlight + a movement arrow.
  const [selectedAdvice, setSelectedAdvice] = useState<Recommendation | null>(null)
  const adviceMarker = useAdviceMarker(selectedAdvice, units, livePositions, supply.depots)

  const clear = useCallback(() => {
    setSelectedCell(null)
    setSelectedUnitId(null)
    setHighlightH3(null)
    setHighlightEventId(null)
    setLocatePoint(null)
    planning.resetPlanning()
    planRdv.cancel()
    rdvArchive.clearSelection()
    refuelStop.cancel()
  }, [planning, planRdv, rdvArchive, refuelStop])

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

  // A halted unit (v2 Wave 10 F1/F4): offer "Proceed slowly" or "Re-route".
  const [proceeding, setProceeding] = useState(false)
  const [dismissedHalt, setDismissedHalt] = useState<string | null>(null)
  const halted = useMemo(() => firstHaltedUnit(live), [live])
  const haltedName = useMemo(
    () => units.find((u) => u.id === halted?.instanceId)?.name ?? halted?.instanceId ?? '',
    [units, halted],
  )
  const proceedHalted = useCallback(() => {
    if (!halted) return
    setProceeding(true)
    api
      .proceedMoveOrder(halted.orderId)
      .then(() => pushChatter(`Proceeding slowly: ${haltedName}`, 'order'))
      .catch((e: unknown) => pushChatter(errorMessage(e), 'status'))
      .finally(() => setProceeding(false))
  }, [halted, haltedName, pushChatter])
  // "Continue" — cross the threat tile at normal speed (v2 W13 F5).
  const continueHalted = useCallback(() => {
    if (!halted) return
    setProceeding(true)
    api
      .continueMoveOrder(halted.orderId)
      .then(() => pushChatter(`Continuing at normal speed: ${haltedName}`, 'order'))
      .catch((e: unknown) => pushChatter(errorMessage(e), 'status'))
      .finally(() => setProceeding(false))
  }, [halted, haltedName, pushChatter])
  const rerouteHalted = useCallback(() => {
    if (!halted) return
    setSelectedCell(null)
    setHighlightEventId(null)
    planning.resetPlanning()
    setSelectedUnitId(halted.instanceId)
  }, [halted, planning])
  // Start the refuel-stop option picker for the current move (no dispatch until Confirm) (v2 W13).
  const startRefuelStop = useCallback(() => {
    const dest = planning.destination
    if (!selectedUnitId || !dest || !planning.selectedMetric) return
    refuelStop.start(selectedUnitId, dest.lat, dest.lon, planning.selectedMetric, planning.mode)
  }, [selectedUnitId, planning.destination, planning.selectedMetric, planning.mode, refuelStop])

  // OF-8 map focus (v2 W13): orange-highlight the chosen Plan-rendezvous units, and dim units /
  // depots that are not relevant to the active supply tab.
  const isOf8 = canShow(role, 'supplyPanel')
  const truckIds = useMemo(
    () => (supply.overview?.trucks ?? []).map((t) => t.instance_id),
    [supply.overview],
  )
  const dimmedUnits = useMemo(
    () => (isOf8 ? dimmedUnitIds(supplyTab, units.map((u) => u.id), truckIds) : []),
    [isOf8, supplyTab, units, truckIds],
  )
  // Purple fleet halo on every fuel truck in OF-8, except those dimmed by the active tab (v2 W13).
  const fleetUnitIds = useMemo(() => {
    if (!isOf8) return []
    const dimmed = new Set(dimmedUnits)
    return truckIds.filter((id) => !dimmed.has(id))
  }, [isOf8, truckIds, dimmedUnits])
  // Rendezvous preview precedence: an active plan flow → a clicked archive order → an added refuel stop.
  const rdvRoutes =
    planRdv.phase !== 'idle'
      ? planRdv.previewRoutes
      : rdvArchive.selectedId
        ? rdvArchive.previewRoutes
        : refuelStop.previewRoutes
  const rdvMetric =
    planRdv.phase !== 'idle'
      ? planRdv.metric
      : rdvArchive.selectedId
        ? rdvArchive.previewMetric
        : (refuelStop.previewRoutes[0]?.metric ?? null)

  // Manually place a fuel depot — or a typed stocked logistic site (v2 Wave 10 F6 / W11 F5).
  const placeDepot = useCallback(
    (lat: number, lon: number) => {
      const tag = Math.round(lat * 1000) % 1000
      const name = depotSiteType
        ? `${depotSiteType.toUpperCase()} ${tag}`
        : `FWD depot ${tag}`
      api
        .createDepot({ name, lat, lon, site_type: depotSiteType || null })
        .then((d) => {
          pushChatter(`Logistic site placed: ${d.name}`, 'order')
          supply.refetch()
        })
        .catch((e: unknown) => pushChatter(errorMessage(e), 'status'))
    },
    [pushChatter, supply, depotSiteType],
  )

  // Locate a supply point on the map (v2 Wave 11 F5). Pulse the id so MapView re-eases each click.
  // Mark + locate any supply entity (depot, fuel truck, …) on the map. A fresh object each call
  // so re-clicking the same point still re-eases (v2 Wave 11).
  const locate = useCallback((lat: number, lon: number) => {
    setLocatePoint({ lat, lon })
  }, [])

  // Ask the Wave-6 redistribution advisor to propose a refuel for a low site (v2 Wave 11 F5).
  const proposeSiteRefuel = useCallback(
    (depotId: string) => {
      const name = supply.depots.find((d) => d.id === depotId)?.name ?? depotId
      api
        .getSiteRefuel(depotId)
        .then((res) => {
          pushChatter(`Refuel proposal — ${name}: ${res.summary}`, 'order')
          for (const r of res.recommendations) pushChatter(r.rationale, 'order')
        })
        .catch((e: unknown) => pushChatter(errorMessage(e), 'status'))
    },
    [pushChatter, supply.depots],
  )

  // Esc exits any active mode (planning / obstacle placement / depot placement / selection).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setObstacleMode(false)
      setDepotMode(false)
      clear()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [clear])

  const ready = theater !== null
  // Obstacle placement is an OF-4 tactical tool; never active in the OF-8 supply view.
  const obstacleActive = canShow(role, 'obstacleMode') && obstacleMode

  if (!entered) {
    return <LandingPage onEnter={() => setEntered(true)} />
  }

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">BattleFuel</span>
        {theater && <span className="theater">{theater.name}</span>}
        {theater && <RoleToggle role={role} onChange={setRole} />}
        {theater && <GridLayoutControl precisionM={gridPrecisionM} onPrecision={setGridPrecisionM} />}
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
        {theater && canShow(role, 'depotOverlay') && (
          <button
            className={`mode-toggle${depotMode ? ' active' : ''}`}
            data-testid="depot-mode-toggle"
            onClick={() => setDepotMode((m) => !m)}
          >
            {depotMode ? '⛽ Add depot: ON' : 'Add depot'}
          </button>
        )}
        {theater && canShow(role, 'depotOverlay') && depotMode && (
          <select
            className="site-type-select"
            data-testid="site-type-select"
            value={depotSiteType}
            onChange={(e) => setDepotSiteType(e.target.value)}
            title="Logistic site type for the next placed site"
          >
            <option value="">Plain depot</option>
            {LOGISTIC_SITE_TYPES.map((t) => (
              <option key={t} value={t}>
                {logisticSiteLabel(t)}
              </option>
            ))}
          </select>
        )}
        {theater && canShow(role, 'depotOverlay') && (
          <label className="info-bars-toggle" data-testid="info-bars-toggle">
            <input
              type="checkbox"
              checked={infoBarsOn}
              onChange={(e) => setInfoBarsOn(e.target.checked)}
            />
            Fuel bars
          </label>
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
              depotMode={depotMode && canShow(role, 'depotOverlay')}
              onPlaceDepot={placeDepot}
              combatEvents={Object.values(combatEvents)}
              highlightEventId={highlightEventId}
              enemyUnits={enemyUnits}
              depots={canShow(role, 'depotOverlay') ? (supply.overview?.depots ?? []) : []}
              locatePoint={locatePoint}
              fuelRunOptions={fuelRun.options}
              fuelRunMetric={fuelRun.metric}
              showUnitFuelBars={canShow(role, 'depotOverlay') && infoBarsOn}
              rendezvous={canShow(role, 'supplyPanel') ? supplyOrders.rendezvous : null}
              adviceArrow={adviceMarker.arrow}
              adviceDest={adviceMarker.dest}
              highlightH3={supplyOrders.truckHighlightH3 ?? adviceMarker.highlightH3 ?? highlightH3}
              selectedUnitId={selectedUnitId}
              selectedCell={selectedCell}
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
                // OF-8: clicking a refuelable unit starts a routed fuel run — find the nearest
                // fuelled truck, plan Safe/Fast routes (v2 Wave 12 F1, supersedes the W11 F6
                // one-click recommendation).
                if (
                  shouldRefuelOnClick(
                    role,
                    supplyOrders.refuelTargets.map((u) => u.id),
                    id,
                  )
                ) {
                  fuelRun.startUnitFirst(id)
                }
              }}
              fuelRunPickMode={fuelRun.phase === 'pick-target'}
              onPickFuelTarget={fuelRun.pickTarget}
              rendezvousRoutes={rdvRoutes}
              rendezvousMetric={rdvMetric}
              rendezvousPickUnit={planRdv.phase === 'pick-unit'}
              onPickRendezvousUnit={planRdv.pickUnit}
              rendezvousPickTruck={planRdv.phase === 'pick-truck'}
              onPickRendezvousTruck={planRdv.pickTruck}
              rendezvousPickSector={planRdv.phase === 'pick-sector'}
              onPickRendezvousSector={planRdv.pickSector}
              fleetUnitIds={fleetUnitIds}
              dimmedUnitIds={dimmedUnits}
              dimDepots={isOf8 && dimDepots(supplyTab)}
              onPickDestination={(lat, lon) =>
                planning.waypointMode
                  ? planning.addWaypoint(lat, lon)
                  : planning.pickDestination(lat, lon)
              }
              onClearSelection={clear}
            />
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
                unitTypes={unitTypes}
                refuelTargets={supplyOrders.refuelTargets}
                recommendation={supplyOrders.recommendation}
                busy={supplyOrders.busy}
                message={supplyOrders.message}
                platforms={fuelPlatforms.platforms}
                selectedPlatformId={fuelPlatforms.selectedId}
                onSelectPlatform={fuelPlatforms.setSelectedId}
                onAddPlatform={(name) => void fuelPlatforms.addPlatform(name)}
                onShowHistory={() => setOrderHistoryOpen(true)}
                onShowDocs={() => setInfoDocsOpen(true)}
                onLocate={locate}
                onProposeRefuel={proposeSiteRefuel}
                onCreateFuelRun={(truckId, truckName) => fuelRun.startTruckFirst(truckId, truckName)}
                onPlanRendezvous={(truckId, truckName) => planRdv.start(truckId, truckName)}
                onTabChange={setSupplyTab}
                onBuy={supplyOrders.placeBuy}
                onRefuel={supplyOrders.placeRefuel}
                onConfirmRefuel={supplyOrders.confirmRefuel}
                onCancelRefuel={supplyOrders.cancelRefuel}
              />
            )}
            {canShow(role, 'supplyPanel') && orderHistoryOpen && (
              <OrderHistoryPanel
                orders={orderHistory.orders}
                onClose={() => setOrderHistoryOpen(false)}
                rendezvousOrders={rdvArchive.orders}
                selectedRendezvousId={rdvArchive.selectedId}
                onSelectRendezvous={rdvArchive.select}
                onCancelRendezvous={rdvArchive.cancel}
              />
            )}
            {canShow(role, 'supplyPanel') && infoDocsOpen && (
              <InfoDocsPanel groups={infoDocs.groups} onClose={() => setInfoDocsOpen(false)} />
            )}
            {canShow(role, 'supplyPanel') && (
              <FuelRunPanel
                phase={fuelRun.phase}
                moverName={fuelRun.moverName}
                targetName={fuelRun.targetName}
                options={fuelRun.options}
                metric={fuelRun.metric}
                busy={fuelRun.busy}
                message={fuelRun.message}
                sourceKind={fuelRun.sourceKind}
                truckSourceName={fuelRun.truckSourceName}
                depotSourceName={fuelRun.depotSourceName}
                onSelectMetric={fuelRun.selectMetric}
                onSelectSource={fuelRun.selectSource}
                onConfirm={fuelRun.confirm}
                onCancel={fuelRun.cancel}
              />
            )}
            {(canShow(role, 'supplyPanel') || planRdv.phase !== 'idle') && (
              <PlanRendezvousPanel
                phase={planRdv.phase}
                truckName={planRdv.truckName}
                unitName={planRdv.unitName}
                truckRoutes={planRdv.truckRoutes}
                unitRoutes={planRdv.unitRoutes}
                metric={planRdv.metric}
                busy={planRdv.busy}
                message={planRdv.message}
                onSelectMetric={planRdv.selectMetric}
                onOrderNow={planRdv.orderNow}
                onSchedule={planRdv.schedule}
                onCancel={planRdv.cancel}
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
                mode={planning.mode}
                onSelectMode={planning.setMode}
                waypointMode={planning.waypointMode}
                waypointCount={planning.waypoints.length}
                onStartRouting={planning.startRouting}
                onRemoveLastWaypoint={planning.removeLastWaypoint}
                onEndRouting={planning.endRouting}
                confirming={planning.confirming}
                onSelectOption={planning.setSelectedMetric}
                onConfirm={() => planning.confirmMove(clear)}
                onAddRefuelStop={startRefuelStop}
                onPlanRendezvous={() =>
                  selectedUnitId && planRdv.startUnitFirst(selectedUnitId, selectedUnit.name)
                }
                refuelActive={refuelStop.active}
                refuelOptions={refuelStop.options}
                refuelIndex={refuelStop.index}
                refuelBusy={refuelStop.busy}
                refuelMessage={refuelStop.message}
                onRefuelSelect={refuelStop.select}
                onRefuelConfirm={refuelStop.confirm}
                onRefuelCancel={refuelStop.cancel}
                onCancel={clear}
              />
            )}
            {halted && halted.orderId !== dismissedHalt && (
              <HaltBanner
                halted={halted}
                unitName={haltedName}
                proceeding={proceeding}
                onProceed={proceedHalted}
                onContinue={continueHalted}
                onReroute={rerouteHalted}
                onDismiss={() => setDismissedHalt(halted.orderId)}
              />
            )}
            {canShow(role, 'supplyPanel') && activeReminder && (
              <RendezvousReminderBanner
                reminder={activeReminder}
                truckName={reminderName(activeReminder.truck_id)}
                unitName={reminderName(activeReminder.unit_id)}
                busy={rdvArchive.busy}
                onConfirm={() => {
                  rdvArchive.confirmLaunch(activeReminder.order_id)
                  setDismissedReminders((s) => new Set(s).add(activeReminder.order_id))
                }}
                onDismiss={() =>
                  setDismissedReminders((s) => new Set(s).add(activeReminder.order_id))
                }
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
