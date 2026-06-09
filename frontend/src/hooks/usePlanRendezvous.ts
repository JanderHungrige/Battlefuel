// Plan rendezvous (v2 Wave 13 F3). A truck-first flow that meets a unit at a sector:
//   start(truck) → pick the unit on the map → pick the meeting sector → review dual Safe/Fast
//   routes → Order now (immediate) OR schedule it for a sim-time delay.
// Mirrors useFuelRun (v2 Wave 12).

import { useCallback, useMemo, useState } from 'react'
import { ApiError, api } from '../api/client'
import type { ChatterMessage, RouteMetric, RouteOption, UnitInstance } from '../api/types'

type Phase = 'idle' | 'pick-unit' | 'pick-sector' | 'review'
type PushChatter = (text: string, kind?: ChatterMessage['kind']) => void

export interface PlanRendezvousState {
  phase: Phase
  truckId: string
  unitId: string
  truckName: string
  unitName: string
  truckRoutes: RouteOption[]
  unitRoutes: RouteOption[]
  metric: RouteMetric | null
  busy: boolean
  message: string | null
  /** Both movers' routes for the map preview ([{metric, geometry}]). */
  previewRoutes: { metric: string; geometry: number[][] }[]
  start: (truckId: string, truckName: string) => void
  pickUnit: (unitId: string) => void
  pickSector: (lat: number, lon: number) => void
  selectMetric: (m: RouteMetric) => void
  orderNow: () => void
  schedule: (scheduledGameS: number) => void
  cancel: () => void
}

export function usePlanRendezvous(
  units: UnitInstance[],
  pushChatter: PushChatter,
  refetch: () => void,
): PlanRendezvousState {
  const [phase, setPhase] = useState<Phase>('idle')
  const [truckId, setTruckId] = useState('')
  const [truckName, setTruckName] = useState('')
  const [unitId, setUnitId] = useState('')
  const [unitName, setUnitName] = useState('')
  const [sector, setSector] = useState<{ lat: number; lon: number } | null>(null)
  const [truckRoutes, setTruckRoutes] = useState<RouteOption[]>([])
  const [unitRoutes, setUnitRoutes] = useState<RouteOption[]>([])
  const [metric, setMetric] = useState<RouteMetric | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const reset = useCallback(() => {
    setPhase('idle')
    setTruckId('')
    setTruckName('')
    setUnitId('')
    setUnitName('')
    setSector(null)
    setTruckRoutes([])
    setUnitRoutes([])
    setMetric(null)
    setMessage(null)
  }, [])

  const start = useCallback(
    (id: string, name: string) => {
      reset()
      setTruckId(id)
      setTruckName(name)
      setPhase('pick-unit')
      setMessage('Click the unit to refuel on the map.')
    },
    [reset],
  )

  const pickUnit = useCallback(
    (id: string) => {
      const unit = units.find((u) => u.id === id)
      if (!unit) return
      setUnitId(unit.id)
      setUnitName(unit.name)
      setPhase('pick-sector')
      setMessage('Click the meeting sector on the map.')
    },
    [units],
  )

  const pickSector = useCallback(
    (lat: number, lon: number) => {
      if (!truckId || !unitId) return
      setSector({ lat, lon })
      setBusy(true)
      setMessage(null)
      api
        .planRendezvous({ truck_id: truckId, unit_id: unitId, sector_lat: lat, sector_lon: lon })
        .then((plan) => {
          setTruckRoutes(plan.truck_routes)
          setUnitRoutes(plan.unit_routes)
          setSector({ lat: plan.sector.lat, lon: plan.sector.lon })
          const opts = [...plan.truck_routes, ...plan.unit_routes]
          setMetric(opts.find((o) => o.metric === 'safe')?.metric ?? opts[0]?.metric ?? null)
          setPhase('review')
        })
        .catch((e: unknown) =>
          setMessage(
            e instanceof ApiError ? `Rendezvous planning failed (${e.status}).` : 'Rendezvous planning failed.',
          ),
        )
        .finally(() => setBusy(false))
    },
    [truckId, unitId],
  )

  const orderNow = useCallback(() => {
    if (!sector || !truckId || !unitId || !metric) return
    setBusy(true)
    api
      .createRendezvous({
        truck_id: truckId,
        unit_id: unitId,
        sector_lat: sector.lat,
        sector_lon: sector.lon,
        metric,
        mode: 'road',
      })
      .then(() => {
        pushChatter(`Rendezvous: ${truckName} ↔ ${unitName} (${metric}, now).`, 'order')
        refetch()
        reset()
      })
      .catch((e: unknown) =>
        setMessage(e instanceof ApiError ? `Rendezvous failed (${e.status}).` : 'Rendezvous failed.'),
      )
      .finally(() => setBusy(false))
  }, [sector, truckId, unitId, metric, truckName, unitName, pushChatter, refetch, reset])

  const schedule = useCallback(
    (scheduledGameS: number) => {
      if (!sector || !truckId || !unitId || !metric || scheduledGameS <= 0) return
      setBusy(true)
      api
        .scheduleRendezvous({
          truck_id: truckId,
          unit_id: unitId,
          sector_lat: sector.lat,
          sector_lon: sector.lon,
          metric,
          mode: 'road',
          scheduled_game_s: scheduledGameS,
        })
        .then(() => {
          pushChatter(`Rendezvous planned: ${truckName} ↔ ${unitName} (${metric}).`, 'order')
          refetch()
          reset()
        })
        .catch((e: unknown) =>
          setMessage(
            e instanceof ApiError ? `Scheduling failed (${e.status}).` : 'Scheduling failed.',
          ),
        )
        .finally(() => setBusy(false))
    },
    [sector, truckId, unitId, metric, truckName, unitName, pushChatter, refetch, reset],
  )

  const previewRoutes = useMemo(
    () =>
      [...truckRoutes, ...unitRoutes]
        .filter((o) => o.geometry && o.geometry.length > 1)
        .map((o) => ({ metric: o.metric, geometry: o.geometry })),
    [truckRoutes, unitRoutes],
  )

  return {
    phase,
    truckId,
    unitId,
    truckName,
    unitName,
    truckRoutes,
    unitRoutes,
    metric,
    busy,
    message,
    previewRoutes,
    start,
    pickUnit,
    pickSector,
    selectMetric: setMetric,
    orderNow,
    schedule,
    cancel: reset,
  }
}
