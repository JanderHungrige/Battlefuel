// Routed fuel run (v2 Wave 12 F1). Two entry points:
//  - truck-first: startTruckFirst(truck) → pick a target unit on the map → plan Safe/Fast routes
//  - unit-first:  startUnitFirst(unitId) → pick the nearest fuelled truck → plan Safe/Fast routes
// The operator picks a metric and confirms; the truck routes to the unit and refuels on arrival.

import { useCallback, useMemo, useState } from 'react'
import { ApiError, api } from '../api/client'
import type {
  ChatterMessage,
  RouteMetric,
  RouteOption,
  SupplyOverview,
  UnitInstance,
  UnitType,
} from '../api/types'
import { type FuelSource, fuelSourceOptions } from '../lib/fuelRun'

type Phase = 'idle' | 'pick-target' | 'review'
type SourceKind = 'truck' | 'depot'
type UnitPoint = { id: string; name: string; lat: number; lon: number }
type PushChatter = (text: string, kind?: ChatterMessage['kind']) => void
type LivePositions = Record<string, { lat: number; lon: number }>

export interface FuelRunState {
  phase: Phase
  moverName: string
  targetName: string
  options: RouteOption[]
  metric: RouteMetric | null
  busy: boolean
  message: string | null
  /** Geometry of the selected route option, for the map (null = none). */
  routeGeometry: number[][] | null
  /** Which source the unit-first run is using ('truck' = tanker → unit, 'depot' = unit → depot). */
  sourceKind: SourceKind | null
  /** Name of the offered tanker (unit-first only), or '' when none is available. */
  truckSourceName: string
  /** Name of the offered depot (unit-first only), or '' when none is available. */
  depotSourceName: string
  startTruckFirst: (truckId: string, truckName: string) => void
  startUnitFirst: (unitId: string) => void
  pickTarget: (unitId: string) => void
  selectMetric: (m: RouteMetric) => void
  /** Switch the unit-first source between the tanker and the depot, re-planning the route. */
  selectSource: (kind: SourceKind) => void
  confirm: () => void
  cancel: () => void
}

export function useFuelRun(
  units: UnitInstance[],
  unitTypes: UnitType[],
  overview: SupplyOverview | null,
  live: LivePositions,
  pushChatter: PushChatter,
  refetch: () => void,
): FuelRunState {
  const [phase, setPhase] = useState<Phase>('idle')
  const [moverId, setMoverId] = useState('')
  const [moverName, setMoverName] = useState('')
  const [truckId, setTruckId] = useState('')
  const [depotId, setDepotId] = useState('')
  const [unitId, setUnitId] = useState('')
  const [target, setTarget] = useState<{ id: string; name: string; lat: number; lon: number } | null>(null)
  const [options, setOptions] = useState<RouteOption[]>([])
  const [metric, setMetric] = useState<RouteMetric | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  // Unit-first source choice: the unit being refuelled plus the offered tanker / depot.
  const [unitPoint, setUnitPoint] = useState<UnitPoint | null>(null)
  const [truckSource, setTruckSource] = useState<FuelSource | null>(null)
  const [depotSource, setDepotSource] = useState<FuelSource | null>(null)
  const [sourceKind, setSourceKind] = useState<SourceKind | null>(null)

  const unitPos = useCallback(
    (u: UnitInstance): { lat: number; lon: number } => live[u.id] ?? { lat: u.lat, lon: u.lon },
    [live],
  )
  const unitFuelType = useCallback(
    (u: UnitInstance): string | null =>
      unitTypes.find((t) => t.id === u.unit_type_id)?.fuel.fuel_type ?? null,
    [unitTypes],
  )

  const reset = useCallback(() => {
    setPhase('idle')
    setMoverId('')
    setMoverName('')
    setTruckId('')
    setDepotId('')
    setUnitId('')
    setTarget(null)
    setOptions([])
    setMetric(null)
    setMessage(null)
    setUnitPoint(null)
    setTruckSource(null)
    setDepotSource(null)
    setSourceKind(null)
  }, [])

  const planTo = useCallback(
    (mover: string, lat: number, lon: number) => {
      setBusy(true)
      setMessage(null)
      api
        .planRoute({ instance_id: mover, dest_lat: lat, dest_lon: lon, mode: 'road' })
        .then((opts) => {
          setOptions(opts)
          setMetric(opts.find((o) => o.metric === 'safe')?.metric ?? opts[0]?.metric ?? null)
          setPhase('review')
          if (opts.length === 0) setMessage('No route found.')
        })
        .catch((e: unknown) =>
          setMessage(e instanceof ApiError ? `Route planning failed (${e.status}).` : 'Route planning failed.'),
        )
        .finally(() => setBusy(false))
    },
    [],
  )

  const startTruckFirst = useCallback((id: string, name: string) => {
    reset()
    setMoverId(id)
    setMoverName(name)
    setTruckId(id)
    setPhase('pick-target')
    setMessage('Click the unit to refuel on the map.')
  }, [reset])

  const pickTarget = useCallback(
    (unitId: string) => {
      const unit = units.find((u) => u.id === unitId)
      if (!unit) return
      const p = unitPos(unit)
      setUnitId(unit.id)
      setTarget({ id: unit.id, name: unit.name, lat: p.lat, lon: p.lon })
      planTo(moverId, p.lat, p.lon)
    },
    [units, unitPos, moverId, planTo],
  )

  // Point a unit-first run at one source. A tanker drives to the unit; a fixed depot can't
  // move, so the unit drives to the depot (v2 W12 F2). Re-plans the route for the new mover.
  const applySource = useCallback(
    (kind: SourceKind, unit: UnitPoint, truck: FuelSource | null, depot: FuelSource | null) => {
      setSourceKind(kind)
      if (kind === 'truck' && truck) {
        setMoverId(truck.id)
        setMoverName(truck.name)
        setTruckId(truck.id)
        setDepotId('')
        setTarget({ id: unit.id, name: unit.name, lat: unit.lat, lon: unit.lon })
        planTo(truck.id, unit.lat, unit.lon)
      } else if (depot) {
        setMoverId(unit.id)
        setMoverName(unit.name)
        setDepotId(depot.id)
        setTruckId('')
        setTarget({ id: depot.id, name: depot.name, lat: depot.lat, lon: depot.lon })
        planTo(unit.id, depot.lat, depot.lon)
      }
    },
    [planTo],
  )

  const startUnitFirst = useCallback(
    (unitId: string) => {
      reset()
      const unit = units.find((u) => u.id === unitId)
      if (!unit) return
      const fuelType = unitFuelType(unit)
      const p = unitPos(unit)
      const unitPt: UnitPoint = { id: unit.id, name: unit.name, lat: p.lat, lon: p.lon }
      setUnitId(unit.id)
      setUnitPoint(unitPt)
      const depots = (overview?.depots ?? []).map((d) => ({
        id: d.depot.id,
        name: d.depot.name,
        lat: d.depot.lat,
        lon: d.depot.lon,
        stocks: d.stocks,
      }))
      const { truck, depot } = fuelType
        ? fuelSourceOptions(p.lat, p.lon, overview?.trucks ?? [], depots, fuelType)
        : { truck: null, depot: null }
      setTruckSource(truck)
      setDepotSource(depot)
      // Always prefer the tanker (it comes to the unit); fall back to a depot only when no
      // tanker is available. Both stay offered so the operator can switch.
      if (truck) applySource('truck', unitPt, truck, depot)
      else if (depot) applySource('depot', unitPt, truck, depot)
      else {
        setPhase('review')
        setTarget({ id: unit.id, name: unit.name, lat: p.lat, lon: p.lon })
        setMessage('No compatible fuel source available.')
      }
    },
    [reset, units, unitFuelType, unitPos, overview, applySource],
  )

  const selectSource = useCallback(
    (kind: SourceKind) => {
      if (!unitPoint || kind === sourceKind) return
      applySource(kind, unitPoint, truckSource, depotSource)
    },
    [unitPoint, sourceKind, truckSource, depotSource, applySource],
  )

  const confirm = useCallback(() => {
    if (!target || !moverId || !unitId || !metric || (!truckId && !depotId)) return
    setBusy(true)
    api
      .createFuelRun({
        mover_id: moverId,
        unit_id: unitId,
        truck_id: truckId || null,
        depot_id: depotId || null,
        dest_lat: target.lat,
        dest_lon: target.lon,
        metric,
        mode: 'road',
      })
      .then(() => {
        pushChatter(`Fuel run: ${moverName} → ${target.name} (${metric}).`, 'order')
        refetch()
        reset()
      })
      .catch((e: unknown) =>
        setMessage(e instanceof ApiError ? `Fuel run failed (${e.status}).` : 'Fuel run failed.'),
      )
      .finally(() => setBusy(false))
  }, [target, moverId, unitId, truckId, depotId, metric, moverName, pushChatter, refetch, reset])

  const routeGeometry = useMemo(
    () => options.find((o) => o.metric === metric)?.geometry ?? null,
    [options, metric],
  )

  return {
    phase,
    moverName,
    targetName: target?.name ?? '',
    options,
    metric,
    busy,
    message,
    routeGeometry,
    sourceKind,
    truckSourceName: truckSource?.name ?? '',
    depotSourceName: depotSource?.name ?? '',
    startTruckFirst,
    startUnitFirst,
    pickTarget,
    selectMetric: setMetric,
    selectSource,
    confirm,
    cancel: reset,
  }
}
