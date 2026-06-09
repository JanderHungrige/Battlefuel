// Refuel-stop option picker (v2 W13 correction). "Add refuel stop" no longer dispatches: it fetches
// the nearest tanker options, the operator clicks through them (each previews its stitched route on
// the map), then "Confirm move order" executes the chosen one and the preview is cleared.

import { useCallback, useMemo, useState } from 'react'
import { ApiError, api } from '../api/client'
import type { ChatterMessage, MoveRefuelOption, RouteMetric, RouteMode } from '../api/types'

type PushChatter = (text: string, kind?: ChatterMessage['kind']) => void
type Plan = { unitId: string; destLat: number; destLon: number; metric: RouteMetric; mode: RouteMode }

export interface MoveRefuelStopState {
  active: boolean
  options: MoveRefuelOption[]
  index: number
  busy: boolean
  message: string | null
  current: MoveRefuelOption | null
  /** Selected option's two legs, in the map preview shape (both drawn bold). */
  previewRoutes: { metric: string; geometry: number[][] }[]
  start: (unitId: string, destLat: number, destLon: number, metric: RouteMetric, mode: RouteMode) => void
  select: (index: number) => void
  confirm: () => void
  cancel: () => void
}

export function useMoveRefuelStop(
  pushChatter: PushChatter,
  refetch: () => void,
  onDone: () => void,
): MoveRefuelStopState {
  const [plan, setPlan] = useState<Plan | null>(null)
  const [options, setOptions] = useState<MoveRefuelOption[]>([])
  const [index, setIndex] = useState(0)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const reset = useCallback(() => {
    setPlan(null)
    setOptions([])
    setIndex(0)
    setMessage(null)
  }, [])

  const start = useCallback(
    (unitId: string, destLat: number, destLon: number, metric: RouteMetric, mode: RouteMode) => {
      setPlan({ unitId, destLat, destLon, metric, mode })
      setOptions([])
      setIndex(0)
      setBusy(true)
      setMessage(null)
      api
        .moveRefuelOptions({ instance_id: unitId, dest_lat: destLat, dest_lon: destLon, metric, mode })
        .then((opts) => {
          setOptions(opts)
          if (opts.length === 0) setMessage('No reachable tanker for a refuel stop.')
        })
        .catch((e: unknown) =>
          setMessage(e instanceof ApiError ? `Could not plan refuel stops (${e.status}).` : 'Could not plan refuel stops.'),
        )
        .finally(() => setBusy(false))
    },
    [],
  )

  const select = useCallback(
    (i: number) => {
      if (i >= 0 && i < options.length) setIndex(i)
    },
    [options.length],
  )

  const confirm = useCallback(() => {
    const opt = options[index]
    if (!plan || !opt) return
    setBusy(true)
    api
      .moveWithRefuel({
        instance_id: plan.unitId,
        dest_lat: plan.destLat,
        dest_lon: plan.destLon,
        metric: plan.metric,
        mode: plan.mode,
        truck_id: opt.truck_id,
      })
      .then(() => {
        pushChatter(`Move with refuel stop via ${opt.truck_name}.`, 'order')
        refetch()
        reset()
        onDone() // clears the preview route + closes the panel
      })
      .catch((e: unknown) =>
        setMessage(e instanceof ApiError ? `Refuel stop failed (${e.status}).` : 'Refuel stop failed.'),
      )
      .finally(() => setBusy(false))
  }, [options, index, plan, pushChatter, refetch, reset, onDone])

  const current = options[index] ?? null
  const previewRoutes = useMemo(() => {
    if (!current || !plan) return []
    return [
      { metric: plan.metric, geometry: current.unit_geometry },
      { metric: plan.metric, geometry: current.tanker_geometry },
    ].filter((r) => r.geometry && r.geometry.length > 1)
  }, [current, plan])

  return {
    active: plan !== null,
    options,
    index,
    busy,
    message,
    current,
    previewRoutes,
    start,
    select,
    confirm,
    cancel: reset,
  }
}
