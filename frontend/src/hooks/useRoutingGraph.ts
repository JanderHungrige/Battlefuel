// Fetch the pgRouting graph once when the overlay is enabled, then cache it (v2 Wave 20 F2).
// Returns null while disabled so the map clears the overlay; the graph is static, so one fetch.
import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { RoutingGraph } from '../api/types'

export function useRoutingGraph(enabled: boolean): RoutingGraph | null {
  const [graph, setGraph] = useState<RoutingGraph | null>(null)
  useEffect(() => {
    if (!enabled || graph) return
    let alive = true
    api
      .getRoutingGraph()
      .then((g) => {
        if (alive) setGraph(g)
      })
      .catch(() => {
        /* overlay is optional — ignore fetch errors */
      })
    return () => {
      alive = false
    }
  }, [enabled, graph])
  return enabled ? graph : null
}
