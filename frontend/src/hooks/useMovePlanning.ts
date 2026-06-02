// Move-planning state + actions (extracted from App to keep it lean). Owns destination, route
// options, the chosen metric, and the active-route geometries; plans a route on destination pick
// and creates+confirms a move order on confirm.

import { useCallback, useMemo, useState } from 'react'
import { api } from '../api/client'
import { errorMessage } from '../api/errors'
import type { ChatterMessage, RouteMetric, RouteOption, UnitUpdate } from '../api/types'

type PushChatter = (text: string, kind?: ChatterMessage['kind'], h3Index?: string) => void

export interface MovePlanningState {
  destination: { lat: number; lon: number } | null
  routeOptions: RouteOption[]
  selectedMetric: RouteMetric | null
  setSelectedMetric: (m: RouteMetric) => void
  planLoading: boolean
  planError: string | null
  confirming: boolean
  routeGeometry: number[][] | null
  activeRouteGeometries: number[][][]
  resetPlanning: () => void
  pickDestination: (lat: number, lon: number) => void
  confirmMove: (onDone: () => void) => void
}

export function useMovePlanning(
  selectedUnitId: string | null,
  selectedUnitName: string | null,
  live: Record<string, UnitUpdate>,
  pushChatter: PushChatter,
): MovePlanningState {
  const [destination, setDestination] = useState<{ lat: number; lon: number } | null>(null)
  const [routeOptions, setRouteOptions] = useState<RouteOption[]>([])
  const [selectedMetric, setSelectedMetric] = useState<RouteMetric | null>(null)
  const [planLoading, setPlanLoading] = useState(false)
  const [planError, setPlanError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [activeRoutes, setActiveRoutes] = useState<Record<string, number[][]>>({})

  const routeGeometry = useMemo(
    () => routeOptions.find((o) => o.metric === selectedMetric)?.geometry ?? null,
    [routeOptions, selectedMetric],
  )
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

  const resetPlanning = useCallback(() => {
    setDestination(null)
    setRouteOptions([])
    setSelectedMetric(null)
    setPlanError(null)
    setPlanLoading(false)
  }, [])

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

  const confirmMove = useCallback(
    (onDone: () => void) => {
      if (!selectedUnitId || !destination || !selectedMetric) return
      setConfirming(true)
      setPlanError(null)
      const name = selectedUnitName ?? selectedUnitId
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
          onDone()
        })
        .catch((e: unknown) => setPlanError(errorMessage(e)))
        .finally(() => setConfirming(false))
    },
    [selectedUnitId, selectedUnitName, destination, selectedMetric, pushChatter],
  )

  return {
    destination,
    routeOptions,
    selectedMetric,
    setSelectedMetric,
    planLoading,
    planError,
    confirming,
    routeGeometry,
    activeRouteGeometries,
    resetPlanning,
    pickDestination,
    confirmMove,
  }
}
