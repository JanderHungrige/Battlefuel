import { useCallback, useEffect, useMemo, useState } from 'react'
import { latLngToCell } from 'h3-js'
import { api } from './api/client'
import { errorMessage } from './api/errors'
import type {
  ChatterMessage,
  DrawConnect,
  Recommendation,
  Tile,
  TileMutationRequest,
} from './api/types'
import { AdvisorPanel } from './components/AdvisorPanel'
import { ChatterLog } from './components/ChatterLog'
import { ChatterFilterControls } from './components/ChatterFilterControls'
import {
  DEFAULT_CHATTER_FILTERS,
  filterChatter,
  type ChatterFilters,
} from './lib/chatterFilter'
import { supplyAdviceKind } from './lib/supplyAdvisorAction'
import { GridLayoutControl } from './components/GridLayoutControl'
import { HaltBanner } from './components/HaltBanner'
import { InspectPanel, type InspectCell } from './components/InspectPanel'
import { MoveRoutesPanel } from './components/MoveRoutesPanel'
import { firstHaltedUnit } from './lib/halt'
import { ObstacleCatalogPicker } from './components/ObstacleCatalogPicker'
import {
  DEFAULT_OBSTACLE_TEMPLATE,
  type ObstacleTemplate,
} from './lib/obstacleCatalog'
import { useCombatEventCatalog } from './hooks/useCombatEventCatalog'
import { RoleToggle } from './components/RoleToggle'
import { InfoDocsPanel } from './components/InfoDocsPanel'
import { FuelRunPanel } from './components/FuelRunPanel'
import { PlanRendezvousPanel } from './components/PlanRendezvousPanel'
import { RendezvousReminderBanner } from './components/RendezvousReminderBanner'
import { LandingPage } from './components/LandingPage'
import { TourButton } from './components/TourButton'
import type { TourActions } from './hooks/useTour'
import { OrderHistoryPanel } from './components/OrderHistoryPanel'
import { SupplyPanel } from './components/SupplyPanel'
import { UnitOverview } from './components/UnitOverview'
import { OSM_ATTRIBUTION } from './config'
import { LOGISTIC_SITE_TYPES, logisticSiteLabel } from './lib/logisticSite'
import { shouldRefuelOnClick } from './lib/refuelOnClick'
import { canShow, type Role } from './roles'
import { useObstacleOps } from './hooks/useObstacleOps'
import { useDrawGraph } from './hooks/useDrawGraph'
import { useDrawnEdges } from './hooks/useDrawnEdges'
import { DrawGraphPanel } from './components/DrawGraphPanel'
import { ConnectGraphPopup } from './components/ConnectGraphPopup'
import { DrawnEdgeEditPanel } from './components/DrawnEdgeEditPanel'
import { ForcePlacementPanel, type ForceSide } from './components/ForcePlacementPanel'
import type { ForceTab } from './lib/forceCatalog'
import { MultiCellThreatPanel } from './components/MultiCellThreatPanel'
import { ScenarioPanel } from './components/ScenarioPanel'
import { useScenarios } from './hooks/useScenarios'
import { cellsToH3Indexes, toggleCell } from './lib/multiCellSelect'
import { useRoutingGraph } from './hooks/useRoutingGraph'
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
  const { theater, tiles, units, setUnits, unitTypes, enemyUnits, setEnemyUnits, error } =
    useTheaterData()

  const [selectedCell, setSelectedCell] = useState<{ lat: number; lon: number } | null>(null)
  // Multi-cell selection for batch threat-setting (v2 Wave 22 F4): Shift/Ctrl-click accumulates.
  const [multiCells, setMultiCells] = useState<{ lat: number; lon: number }[]>([])
  // Optimistic tile edits (v2 Wave 22 fix): paint an operator threat/road change instantly, before
  // the PATCH + WS echo round-trips. Cleared per tile once the authoritative echo lands.
  const [optimisticTiles, setOptimisticTiles] = useState<Record<string, Partial<Tile>>>({})
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null)
  const [highlightH3, setHighlightH3] = useState<string | null>(null)

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
    enemySightings,
    chatter,
    strategic,
    pushChatter,
    supplyTick,
    rendezvousReminder,
  } = useSimSocket()

  // Operator ops: obstacles + tile edits + the obstacle-placement mode and chosen kind.
  const { obstacles, placeObstacle, removeObstacle, mutateTile } = useObstacleOps()
  const [obstacleMode, setObstacleMode] = useState(false)
  // Obstacle template chosen from the searchable combat-event catalog (v2 Wave 4 F7).
  const [obstacleTemplate, setObstacleTemplate] = useState<ObstacleTemplate>(
    DEFAULT_OBSTACLE_TEMPLATE,
  )
  const catalogItems = useCombatEventCatalog(obstacleMode)
  const [depotMode, setDepotMode] = useState(false)
  // Site type for the next placed depot ('' = plain depot/marker); v2 Wave 11 F5.
  const [depotSiteType, setDepotSiteType] = useState('')
  // Scenario creator force placement (v2 Wave 22 F1): mode + chosen side / tab / unit type.
  const [forcePlaceMode, setForcePlaceMode] = useState(false)
  const [forceSide, setForceSide] = useState<ForceSide>('blue')
  const [forceTab, setForceTab] = useState<ForceTab>('troops')
  const [forceTypeId, setForceTypeId] = useState<string | null>(null)
  // The force selected on the map for deletion (magenta halo + panel "Delete unit"); v2 W22 F1.
  const [selectedForce, setSelectedForce] = useState<{ side: ForceSide; id: string } | null>(null)
  // Scenario save/load panel (v2 Wave 22 F5): list fetched while open.
  const [scenarioOpen, setScenarioOpen] = useState(false)
  const { scenarios, refetch: refetchScenarios } = useScenarios(scenarioOpen)
  // Supply entity the operator asked to locate on the map (v2 Wave 11 F5). Carries the entity id +
  // kind so the purple halo can fade with the entity (OF-8 per-tab dimming) and clear on delete.
  const [located, setLocated] = useState<
    { lat: number; lon: number; kind: 'depot' | 'truck'; id: string } | null
  >(null)
  // OF-8 on-map per-unit fuel bars (v2 Wave 11 F7); on by default.
  const [infoBarsOn, setInfoBarsOn] = useState(true)

  // Unified chatter filter (Wave 4 F4): mode + threat threshold (default ≥3).
  const [chatterFilters, setChatterFilters] = useState<ChatterFilters>(DEFAULT_CHATTER_FILTERS)
  const filteredChatter = useMemo(
    () => filterChatter(chatter, chatterFilters),
    [chatter, chatterFilters],
  )
  // Map-cell hover detail toggle (unify F6): off (default) → grid number only.
  const [hoverDetails, setHoverDetails] = useState(false)
  // Routing-graph overlay toggle (v2 Wave 20 F2) — fetched once when first enabled.
  const [showGraph, setShowGraph] = useState(false)
  // Bumped after a drawn edge is injected so the overlay refetches and shows it (v2 Wave 20 F4).
  const [graphReload, setGraphReload] = useState(0)
  const routingGraph = useRoutingGraph(showGraph, graphReload)
  // Draw-graph tool (v2 Wave 20 F3): hand-author a road/path onto the map (OF-4).
  const draw = useDrawGraph()
  const [drawBusy, setDrawBusy] = useState(false)
  // Edit-graph mode (v2 Wave 20 F5/F6): select + remove operator-drawn edges (OF-4, drawn-only).
  const [editGraph, setEditGraph] = useState(false)
  const [selectedDrawnId, setSelectedDrawnId] = useState<string | null>(null)
  // Bumped to refetch the drawn-edges edit overlay after a create (F4) / remove (F6).
  const [drawnReload, setDrawnReload] = useState(0)
  const [removeBusy, setRemoveBusy] = useState(false)
  const drawnEdges = useDrawnEdges(editGraph, drawnReload)
  const selectedDrawn = useMemo(
    () => drawnEdges?.find((e) => e.id === selectedDrawnId) ?? null,
    [drawnEdges, selectedDrawnId],
  )
  // Seed hostile force merged with live chatter-driven sightings (v2 Wave 4 F6); dedup by id,
  // a dynamic sighting wins over a seed unit with the same id.
  const allEnemyUnits = useMemo(() => {
    const byId: Record<string, (typeof enemyUnits)[number]> = {}
    for (const e of enemyUnits) byId[e.id] = e
    for (const e of Object.values(enemySightings)) byId[e.id] = e
    return Object.values(byId)
  }, [enemyUnits, enemySightings])

  // Tiles merged with any pending optimistic operator edit FIRST, then the authoritative live
  // tile_update. So an edit paints instantly, and once the WS echo (or a later sim change) for that
  // cell lands it overrides the optimistic value — no reconciliation needed.
  const displayedTiles = useMemo(() => {
    if (Object.keys(tileUpdates).length === 0 && Object.keys(optimisticTiles).length === 0) {
      return tiles
    }
    return tiles.map((t) => {
      const u = tileUpdates[t.h3_index]
      const o = optimisticTiles[t.h3_index]
      if (!u && !o) return t
      return { ...t, ...(o ?? {}), ...(u ?? {}), h3_index: t.h3_index, boundary: t.boundary }
    })
  }, [tiles, tileUpdates, optimisticTiles])

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
      // Paint the edit immediately (optimistic), then persist via PATCH; the WS echo reconciles.
      setOptimisticTiles((prev) => {
        const next = { ...prev }
        for (const h3 of h3Indexes) next[h3] = { ...next[h3], ...mutation }
        return next
      })
      for (const h3 of h3Indexes) mutateTile(h3, mutation)
    },
    [mutateTile],
  )

  // Every H3 tile across the multi-selected cells, and a batch threat-set over them (v2 W22 F4).
  const multiCellH3 = useMemo(
    () => cellsToH3Indexes(multiCells, displayedTiles, gridPrecisionM),
    [multiCells, displayedTiles, gridPrecisionM],
  )
  const setMultiThreat = useCallback(
    (level: number) => {
      onMutateCell(multiCellH3, { threat_level: level })
      pushChatter(`Set threat ${level} on ${multiCells.length} cell(s)`, 'order')
    },
    [onMutateCell, multiCellH3, multiCells.length, pushChatter],
  )

  // Place an obstacle from the selected catalog template (v2 Wave 4 F7): drop the obstacle, then
  // apply the template's tile defaults (situation/threat/road) to the containing H3 cell — the
  // tile_update WS echo refreshes the map. Operator can still edit the cell afterwards.
  const placeObstacleFromTemplate = useCallback(
    (lat: number, lon: number) => {
      placeObstacle(lat, lon, obstacleTemplate.kind)
      const res = tiles[0]?.resolution
      if (res !== undefined) mutateTile(latLngToCell(lat, lon, res), obstacleTemplate.mutation)
    },
    [placeObstacle, mutateTile, obstacleTemplate, tiles],
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
  // Strategic Support feed (OF-8): closeable + reopenable from the topbar (default open).
  const [strategicOpen, setStrategicOpen] = useState(true)
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
    setMultiCells([])
    setSelectedUnitId(null)
    setHighlightH3(null)
    setLocated(null)
    planning.resetPlanning()
    planRdv.cancel()
    rdvArchive.clearSelection()
    refuelStop.cancel()
  }, [planning, planRdv, rdvArchive, refuelStop])

  // The purple locate halo is an OF-8 concept (depots / fuel fleet). Leaving OF-8 hides those
  // markers, so the halo must go with them — otherwise it lingers (and shows fully, since
  // locateDimmed is OF-8-only) on OF-4 (v2 Wave 17 F1).
  const changeRole = useCallback((r: Role) => {
    setRole(r)
    if (r !== 'OF8') setLocated(null)
  }, [])

  // Toggle the draw-graph tool (v2 Wave 20 F3): same kind → exit; otherwise clear any other mode/
  // selection and start drawing. Drawing is exclusive with obstacle/depot placement + planning.
  const toggleDraw = useCallback(
    (kind: 'road' | 'path') => {
      if (draw.mode === kind) {
        draw.cancel()
        return
      }
      clear()
      setObstacleMode(false)
      setDepotMode(false)
      setEditGraph(false)
      setForcePlaceMode(false)
      setSelectedDrawnId(null)
      draw.start(kind)
    },
    [draw, clear],
  )

  // Toggle Edit-graph mode (v2 Wave 20 F5): exclusive with drawing / obstacle / depot placement.
  const toggleEditGraph = useCallback(() => {
    setEditGraph((on) => {
      const next = !on
      if (next) {
        clear()
        setObstacleMode(false)
        setDepotMode(false)
        setForcePlaceMode(false)
        draw.cancel()
      }
      setSelectedDrawnId(null)
      return next
    })
  }, [clear, draw])

  // Toggle scenario force-placement (v2 Wave 22 F1): exclusive with the other map-edit modes.
  const toggleForcePlace = useCallback(() => {
    setSelectedForce(null)
    setForcePlaceMode((on) => {
      const next = !on
      if (next) {
        clear()
        setObstacleMode(false)
        setDepotMode(false)
        setEditGraph(false)
        setSelectedDrawnId(null)
        draw.cancel()
      }
      return next
    })
  }, [clear, draw])

  // Place the selected force at a clicked point: blue → unit instance, red → hostile (v2 Wave 22 F1).
  const placeForce = useCallback(
    (lat: number, lon: number) => {
      if (!forceTypeId) {
        pushChatter('Pick a unit type before placing', 'status')
        return
      }
      const req = { unit_type_id: forceTypeId, lat, lon }
      if (forceSide === 'blue') {
        api
          .placeUnitInstance(req)
          .then((u) => {
            setUnits((prev) => [...prev, u])
            pushChatter(`Placed ${u.name}`, 'order')
          })
          .catch((e: unknown) => pushChatter(`Place failed: ${String(e)}`, 'status'))
      } else {
        api
          .placeEnemyUnit(req)
          .then((en) => {
            setEnemyUnits((prev) => [...prev, en])
            pushChatter(`Placed ${en.name}`, 'order')
          })
          .catch((e: unknown) => pushChatter(`Place failed: ${String(e)}`, 'status'))
      }
    },
    [forceTypeId, forceSide, setUnits, setEnemyUnits, pushChatter],
  )

  // Remove a placed force clicked in placement mode (v2 Wave 22 F1).
  const removeForce = useCallback(
    (side: 'blue' | 'red', id: string) => {
      if (side === 'blue') {
        api
          .removeUnitInstance(id)
          .then(() => setUnits((prev) => prev.filter((u) => u.id !== id)))
          .catch((e: unknown) => pushChatter(`Remove failed: ${String(e)}`, 'status'))
      } else {
        api
          .removeEnemyUnit(id)
          .then(() => setEnemyUnits((prev) => prev.filter((en) => en.id !== id)))
          .catch(() => pushChatter('Only operator-placed red forces can be removed', 'status'))
      }
    },
    [setUnits, setEnemyUnits, pushChatter],
  )

  // Scenario save/load (v2 Wave 22 F5).
  const saveScenario = useCallback(
    (name: string) => {
      api
        .saveScenario(name)
        .then(() => {
          refetchScenarios()
          pushChatter(`Saved scenario "${name}"`, 'order')
        })
        .catch((e: unknown) => pushChatter(`Save failed: ${String(e)}`, 'status'))
    },
    [refetchScenarios, pushChatter],
  )
  const loadScenario = useCallback((id: string) => {
    // A scenario replaces the whole world; reload to re-bootstrap every hook cleanly.
    api
      .loadScenario(id)
      .then(() => window.location.reload())
      .catch((e: unknown) => console.error('[scenario] load failed:', e))
  }, [])
  const deleteScenario = useCallback(
    (id: string) => {
      api
        .deleteScenario(id)
        .then(() => refetchScenarios())
        .catch((e: unknown) => console.error('[scenario] delete failed:', e))
    },
    [refetchScenarios],
  )

  // Select a placed force on the map (magenta halo + panel Delete button); v2 Wave 22 F1.
  const selectForce = useCallback(
    (side: 'blue' | 'red', id: string) => setSelectedForce({ side, id }),
    [],
  )

  // Delete the force selected on the map, then clear the selection (v2 Wave 22 F1).
  const deleteSelectedForce = useCallback(() => {
    if (!selectedForce) return
    removeForce(selectedForce.side, selectedForce.id)
    setSelectedForce(null)
  }, [selectedForce, removeForce])

  // The selected force's name + position, resolved from the live rosters (v2 Wave 22 F1).
  const selectedForceEntity = useMemo(() => {
    if (!selectedForce) return null
    if (selectedForce.side === 'blue') {
      const u = units.find((x) => x.id === selectedForce.id)
      return u ? { name: u.name, lat: u.lat, lon: u.lon } : null
    }
    const en = allEnemyUnits.find((x) => x.id === selectedForce.id)
    return en ? { name: en.name, lat: en.lat, lon: en.lon } : null
  }, [selectedForce, units, allEnemyUnits])

  // Remove the selected drawn edge (v2 Wave 20 F6): delete + re-inject, then refresh both overlays.
  const removeDrawnEdge = useCallback(() => {
    if (!selectedDrawnId) return
    setRemoveBusy(true)
    api
      .deleteDrawnEdge(selectedDrawnId)
      .then(() => {
        pushChatter('Removed drawn edge from the routing graph', 'order')
        setSelectedDrawnId(null)
        setDrawnReload((n) => n + 1)
        setGraphReload((n) => n + 1)
      })
      .catch((e: unknown) => pushChatter(`Could not remove drawn edge: ${errorMessage(e)}`, 'status'))
      .finally(() => setRemoveBusy(false))
  }, [selectedDrawnId, pushChatter])

  // Connect-drawn-to-graph (v2 Wave 20 F4): POST the finished line with the operator's connect
  // choice, inject it into the routing graph, then refresh the overlay so the new edge shows.
  const submitDraw = useCallback(
    (connect: DrawConnect) => {
      const fin = draw.finished
      if (!fin) return
      setDrawBusy(true)
      api
        .createDrawnEdge({
          kind: fin.kind,
          coordinates: fin.points.map((p) => [p.lon, p.lat]),
          connect,
        })
        .then(() => {
          pushChatter(`Drawn ${fin.kind} added to the routing graph (connect: ${connect})`, 'order')
          setGraphReload((n) => n + 1)
          setDrawnReload((n) => n + 1)
        })
        .catch((e: unknown) => pushChatter(`Could not add ${fin.kind}: ${errorMessage(e)}`, 'status'))
        .finally(() => {
          setDrawBusy(false)
          draw.clearFinished()
        })
    },
    [draw, pushChatter],
  )

  // Actions the "Take a tour" walkthrough drives so it can show gated controls: open the OF-4
  // Plan-move panel (select a demo unit), and open/close the OF-8 rendezvous planner.
  const tourActions = useMemo<TourActions>(
    () => ({
      'select-unit': () => {
        const u = units[0]
        if (!u) return
        setSelectedCell(null)
        planning.resetPlanning()
        setSelectedUnitId(u.id)
      },
      'plan-rendezvous': () => {
        const t = supply.overview?.trucks?.[0]
        if (t) planRdv.start(t.instance_id, t.name)
      },
      'cancel-rendezvous': () => planRdv.cancel(),
    }),
    [units, planning, supply.overview, planRdv],
  )

  // Remove a hand-added depot / logistic site (prune the OF-8 supply list).
  const removeDepot = useCallback(
    (depotId: string) => {
      if (!window.confirm('Remove this depot / logistic site?')) return
      api
        .deleteDepot(depotId)
        .then(() => {
          // Deleting the located depot must clear its purple halo (fix 99).
          setLocated((cur) => (cur && cur.id === depotId ? null : cur))
          supply.refetch()
        })
        .catch((e) => pushChatter(`Could not remove depot: ${errorMessage(e)}`, 'status'))
    },
    [supply, pushChatter],
  )


  // Ask the advisor about a supply-relevant chatter event (v2 Wave 4 F5): map the event's
  // category to the right advisor kind, open the panel + request it (advisory only — never
  // auto-places an order; the operator still applies a recommendation manually).
  const askAdvisorForEvent = useCallback(
    (m: ChatterMessage) => {
      const kind = supplyAdviceKind(m.category ?? '')
      advisor.ask(kind)
      pushChatter(`Advisor: requested ${kind} re "${m.text}"`, 'status')
    },
    [advisor, pushChatter],
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
  // Whether the located entity's halo should fade — it is dimmed when its depot/truck is greyed
  // out on the active OF-8 tab (depot → supply-fleet tab; truck → whenever it's in dimmedUnits).
  const locateDimmed = useMemo(() => {
    if (!located || !isOf8) return false
    return located.kind === 'depot' ? dimDepots(supplyTab) : dimmedUnits.includes(located.id)
  }, [located, isOf8, supplyTab, dimmedUnits])
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
  const locate = useCallback(
    (lat: number, lon: number, kind: 'depot' | 'truck', id: string) => {
      setLocated({ lat, lon, kind, id })
    },
    [],
  )

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
      draw.cancel()
      setEditGraph(false)
      setSelectedDrawnId(null)
      clear()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [clear, draw])

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
        {theater && <RoleToggle role={role} onChange={changeRole} />}
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
        {theater && canShow(role, 'strategicFeed') && (
          <button
            className={`mode-toggle${strategicOpen ? ' active' : ''}`}
            data-testid="strategic-toggle"
            onClick={() => setStrategicOpen((o) => !o)}
          >
            Strategic
          </button>
        )}
        {theater && canShow(role, 'obstacleMode') && (
          <button
            className={`mode-toggle${obstacleMode ? ' active' : ''}`}
            data-testid="obstacle-mode-toggle"
            onClick={() => {
              setForcePlaceMode(false)
              setObstacleMode((m) => !m)
            }}
          >
            {obstacleMode ? '🚧 Obstacle mode: ON' : 'Obstacle mode'}
          </button>
        )}
        {theater && canShow(role, 'depotOverlay') && (
          <button
            className={`mode-toggle${depotMode ? ' active' : ''}`}
            data-testid="depot-mode-toggle"
            onClick={() => {
              setForcePlaceMode(false)
              setDepotMode((m) => !m)
            }}
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
        {theater && (
          <label className="info-bars-toggle" data-testid="graph-overlay-toggle">
            <input
              type="checkbox"
              checked={showGraph}
              onChange={(e) => setShowGraph(e.target.checked)}
            />
            Graph
          </label>
        )}
        {theater && canShow(role, 'drawGraph') && (
          <button
            className={`mode-toggle${draw.mode === 'road' ? ' active' : ''}`}
            data-testid="draw-road-toggle"
            onClick={() => toggleDraw('road')}
          >
            {draw.mode === 'road' ? '✏️ Drawing road' : 'Add road'}
          </button>
        )}
        {theater && canShow(role, 'drawGraph') && (
          <button
            className={`mode-toggle${draw.mode === 'path' ? ' active' : ''}`}
            data-testid="draw-path-toggle"
            onClick={() => toggleDraw('path')}
          >
            {draw.mode === 'path' ? '✏️ Drawing path' : 'Add path'}
          </button>
        )}
        {theater && canShow(role, 'drawGraph') && (
          <button
            className={`mode-toggle${editGraph ? ' active' : ''}`}
            data-testid="edit-graph-toggle"
            onClick={toggleEditGraph}
          >
            {editGraph ? '🖉 Editing graph' : 'Edit graph'}
          </button>
        )}
        {theater && (
          <button
            className={`mode-toggle${forcePlaceMode ? ' active' : ''}`}
            data-testid="force-place-toggle"
            onClick={toggleForcePlace}
          >
            {forcePlaceMode ? 'Placing forces' : 'Place forces'}
          </button>
        )}
        {theater && (
          <button
            className={`mode-toggle${scenarioOpen ? ' active' : ''}`}
            data-testid="scenario-toggle"
            onClick={() => setScenarioOpen((o) => !o)}
          >
            Scenarios
          </button>
        )}
        <span className="spacer" />
        {theater && <TourButton role={role} actions={tourActions} onEnd={clear} />}
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
              routingGraph={routingGraph}
              destination={planning.destination}
              planning={selectedUnitId !== null}
              livePositions={livePositions}
              activeRoutes={planning.activeRouteGeometries}
              obstacles={obstacles}
              obstacleMode={obstacleActive}
              depotMode={depotMode && canShow(role, 'depotOverlay')}
              onPlaceDepot={placeDepot}
              forcePlaceActive={forcePlaceMode}
              onPlaceForce={placeForce}
              onSelectForce={selectForce}
              forceSelectPoint={selectedForceEntity}
              hoverDetails={hoverDetails}
              enemyUnits={allEnemyUnits}
              depots={canShow(role, 'depotOverlay') ? (supply.overview?.depots ?? []) : []}
              locatePoint={located}
              locateDimmed={locateDimmed}
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
              onPlaceObstacle={placeObstacleFromTemplate}
              onRemoveObstacle={removeObstacle}
              multiCells={multiCells}
              onSelectCell={(lat, lon, additive) => {
                if (additive) {
                  // Fold the currently-inspected cell into the multi-selection when it starts, so the
                  // first (plain-clicked) tile is included in the batch threat-set (v2 Wave 22 F4 fix).
                  setMultiCells((prev) => {
                    const base = prev.length === 0 && selectedCell ? [selectedCell] : prev
                    return toggleCell(base, { lat, lon }, gridPrecisionM)
                  })
                  setSelectedCell(null)
                  return
                }
                setSelectedUnitId(null)
                planning.resetPlanning()
                setMultiCells([])
                setSelectedCell({ lat, lon })
              }}
              onSelectUnit={(id) => {
                setSelectedCell(null)
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
              dimmedUnitIds={dimmedUnits}
              dimDepots={isOf8 && dimDepots(supplyTab)}
              drawMode={canShow(role, 'drawGraph') ? draw.mode : null}
              drawPoints={draw.points}
              onDrawWaypoint={draw.addPoint}
              editGraph={canShow(role, 'drawGraph') && editGraph}
              drawnEdges={drawnEdges}
              selectedDrawnId={selectedDrawnId}
              onSelectDrawn={setSelectedDrawnId}
              onPickDestination={(lat, lon) =>
                planning.waypointMode
                  ? planning.addWaypoint(lat, lon)
                  : planning.pickDestination(lat, lon)
              }
              onClearSelection={clear}
            />
            <ChatterLog
              messages={filteredChatter}
              onSelect={setHighlightH3}
              onAskAdvisor={canShow(role, 'advisor') ? askAdvisorForEvent : undefined}
            >
              <ChatterFilterControls
                value={chatterFilters}
                onChange={setChatterFilters}
                hoverDetails={hoverDetails}
                onHoverDetailsChange={setHoverDetails}
              />
            </ChatterLog>
            {canShow(role, 'strategicFeed') && strategicOpen && (
              <ChatterLog
                messages={strategic}
                title="Strategic Support"
                className="chatter strategic-feed"
                testId="strategic-feed"
                emptyText="Awaiting strategic traffic…"
                onClose={() => setStrategicOpen(false)}
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
                onRemoveDepot={removeDepot}
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
                onConfirm={() => fuelRun.confirm(clear)}
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
              <ObstacleCatalogPicker
                items={catalogItems}
                selectedId={obstacleTemplate.id}
                onSelect={setObstacleTemplate}
              />
            )}
            {theater && forcePlaceMode && (
              <ForcePlacementPanel
                unitTypes={unitTypes}
                side={forceSide}
                onSide={setForceSide}
                tab={forceTab}
                onTab={setForceTab}
                selectedTypeId={forceTypeId}
                onSelectType={setForceTypeId}
                selectedForceName={selectedForceEntity?.name ?? null}
                onDeleteSelected={deleteSelectedForce}
                onClose={toggleForcePlace}
              />
            )}
            {multiCells.length > 0 && (
              <MultiCellThreatPanel
                count={multiCells.length}
                onSetThreat={setMultiThreat}
                onClear={() => setMultiCells([])}
              />
            )}
            {scenarioOpen && (
              <ScenarioPanel
                scenarios={scenarios}
                onSave={saveScenario}
                onLoad={loadScenario}
                onDelete={deleteScenario}
                onClose={() => setScenarioOpen(false)}
              />
            )}
            {canShow(role, 'drawGraph') && draw.mode && (
              <DrawGraphPanel
                kind={draw.mode}
                count={draw.points.length}
                onRemoveLast={draw.removeLast}
                onStop={draw.stop}
                onCancel={draw.cancel}
              />
            )}
            {canShow(role, 'drawGraph') && draw.finished && (
              <ConnectGraphPopup
                kind={draw.finished.kind}
                busy={drawBusy}
                onConnect={submitDraw}
                onCancel={draw.clearFinished}
              />
            )}
            {canShow(role, 'drawGraph') && editGraph && selectedDrawn && (
              <DrawnEdgeEditPanel
                kind={selectedDrawn.kind}
                busy={removeBusy}
                onRemove={removeDrawnEdge}
                onCancel={() => setSelectedDrawnId(null)}
              />
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
