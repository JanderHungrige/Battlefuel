// Fetch the pgRouting graph when the overlay is enabled (v2 Wave 20 F2). Returns null while disabled
// so the map clears the overlay. `reloadToken` (v2 Wave 20 F4): bump it to refetch after a drawn
// edge is injected, so the overlay shows the new edge without an off/on toggle.
import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { RoutingGraph } from '../api/types'

export function useRoutingGraph(enabled: boolean, reloadToken = 0): RoutingGraph | null {
  const [graph, setGraph] = useState<RoutingGraph | null>(null)
  useEffect(() => {
    if (!enabled) return
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
  }, [enabled, reloadToken])
  return enabled ? graph : null
}
