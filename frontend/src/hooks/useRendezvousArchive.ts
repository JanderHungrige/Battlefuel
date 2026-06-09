// Rendezvous order archive (v2 Wave 13 F4). Lists scheduled/launched rendezvous runs (refetched
// when a supply frame arrives), tracks the selected order to draw both its routes on the map, and
// offers confirm-launch / cancel. Read-only fetch + a couple of lifecycle actions.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ApiError, api } from '../api/client'
import type { ChatterMessage, RendezvousOrder } from '../api/types'

type PushChatter = (text: string, kind?: ChatterMessage['kind']) => void

export interface RendezvousArchiveState {
  orders: RendezvousOrder[]
  selectedId: string | null
  busy: boolean
  /** Both routes of the selected order, in the MapView preview shape (both drawn bold). */
  previewRoutes: { metric: string; geometry: number[][] }[]
  /** The selected order's metric, so MapView draws both legs as "selected". */
  previewMetric: string | null
  refetch: () => void
  select: (order: RendezvousOrder) => void
  clearSelection: () => void
  confirmLaunch: (id: string) => void
  cancel: (id: string) => void
}

export function useRendezvousArchive(
  enabled: boolean,
  supplyTick: number,
  pushChatter: PushChatter,
): RendezvousArchiveState {
  const [orders, setOrders] = useState<RendezvousOrder[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refetch = useCallback(() => {
    if (!enabled) return
    api
      .listRendezvous()
      .then(setOrders)
      .catch(() => {})
  }, [enabled])

  useEffect(() => {
    refetch()
  }, [refetch, supplyTick])

  const select = useCallback((order: RendezvousOrder) => setSelectedId(order.id), [])
  const clearSelection = useCallback(() => setSelectedId(null), [])

  const confirmLaunch = useCallback(
    (id: string) => {
      setBusy(true)
      api
        .confirmLaunchRendezvous(id)
        .then((res) => {
          pushChatter(
            `Rendezvous launched: ${res.rendezvous_order.truck_id} ↔ ${res.rendezvous_order.unit_id}.`,
            'order',
          )
          refetch()
        })
        .catch((e: unknown) =>
          pushChatter(
            e instanceof ApiError ? `Launch failed (${e.status}).` : 'Launch failed.',
            'status',
          ),
        )
        .finally(() => setBusy(false))
    },
    [pushChatter, refetch],
  )

  const cancel = useCallback(
    (id: string) => {
      setBusy(true)
      api
        .cancelRendezvous(id)
        .then(() => {
          if (selectedId === id) setSelectedId(null)
          refetch()
        })
        .catch(() => {})
        .finally(() => setBusy(false))
    },
    [refetch, selectedId],
  )

  const selected = useMemo(
    () => orders.find((o) => o.id === selectedId) ?? null,
    [orders, selectedId],
  )

  const previewRoutes = useMemo(() => {
    if (!selected) return []
    return [
      { metric: selected.metric, geometry: selected.truck_geometry },
      { metric: selected.metric, geometry: selected.unit_geometry },
    ].filter((r) => r.geometry && r.geometry.length > 1)
  }, [selected])

  return {
    orders,
    selectedId,
    busy,
    previewRoutes,
    previewMetric: selected?.metric ?? null,
    refetch,
    select,
    clearSelection,
    confirmLaunch,
    cancel,
  }
}
