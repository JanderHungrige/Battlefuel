// Advisor state + actions (Wave 6 advisor-ui). Requests advice from the engine and applies a
// recommendation by dispatching its `action` to the existing order client methods. Keeps App lean.

import { useCallback, useState } from 'react'
import { api } from '../api/client'
import type {
  AdviceResult,
  ChatterMessage,
  Recommendation,
  RecommendationKind,
  RouteMetric,
} from '../api/types'

type PushChatter = (text: string, kind?: ChatterMessage['kind'], h3Index?: string) => void

export interface RouteContext {
  instanceId: string | null
  destination: { lat: number; lon: number } | null
}

export interface AdvisorState {
  open: boolean
  toggle: () => void
  result: AdviceResult | null
  loading: boolean
  error: string | null
  busy: boolean
  request: (kind: RecommendationKind) => void
  apply: (rec: Recommendation) => void
}

export function useAdvisor(
  pushChatter: PushChatter,
  onApplied: () => void,
  route: RouteContext,
): AdvisorState {
  const [open, setOpen] = useState(false)
  const [result, setResult] = useState<AdviceResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const request = useCallback(
    (kind: RecommendationKind) => {
      setLoading(true)
      setError(null)
      setResult(null)
      let p: Promise<AdviceResult>
      if (kind === 'reposition') p = api.getReposition()
      else if (kind === 'refuel') p = api.getRefuelPlan()
      else if (kind === 'redistribution') p = api.getRedistribution()
      else if (route.instanceId && route.destination)
        p = api.getRouteAdvice(route.instanceId, route.destination.lat, route.destination.lon)
      else p = Promise.reject(new Error('select a unit and destination first'))
      p.then(setResult)
        .catch((e: unknown) => setError(e instanceof Error ? e.message : 'advice failed'))
        .finally(() => setLoading(false))
    },
    [route.instanceId, route.destination],
  )

  const apply = useCallback(
    (rec: Recommendation) => {
      const a = rec.action
      let p: Promise<unknown> | null = null
      if (a.endpoint === 'move-orders') {
        p = api
          .createMoveOrder({
            instance_id: String(a.instance_id),
            dest_lat: Number(a.dest_lat),
            dest_lon: Number(a.dest_lon),
            metric: (a.metric as RouteMetric) ?? 'fast',
          })
          .then((o) => api.confirmMoveOrder(o.id))
      } else if (a.endpoint === 'refuel-orders') {
        p = api.createRefuelOrder({ unit_id: String(a.unit_id) }).then((o) =>
          api.confirmRefuelOrder(o.id),
        )
      } else if (a.endpoint === 'buy-orders') {
        p = api
          .createBuyOrder({
            depot_id: String(a.depot_id),
            fuel_type: String(a.fuel_type),
            quantity_liters: Number(a.quantity_liters),
          })
          .then((o) => api.confirmBuyOrder(o.id))
      }
      if (p === null) return
      setBusy(true)
      p.then(() => {
        pushChatter(`Applied: ${rec.rationale}`, 'order')
        onApplied()
      })
        .catch(() => setError('apply failed'))
        .finally(() => setBusy(false))
    },
    [pushChatter, onApplied],
  )

  const toggle = useCallback(() => setOpen((o) => !o), [])
  return { open, toggle, result, loading, error, busy, request, apply }
}
