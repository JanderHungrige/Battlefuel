// Fetch the operator-drawn edges for the Edit-graph overlay (v2 Wave 20 F5). Returns null while
// disabled so the map clears the overlay. `reloadToken`: bump it to refetch after a drawn edge is
// created (F4) or removed (F6), so the selectable overlay stays in sync.
import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { DrawnEdge } from '../api/types'

export function useDrawnEdges(enabled: boolean, reloadToken = 0): DrawnEdge[] | null {
  const [edges, setEdges] = useState<DrawnEdge[] | null>(null)
  useEffect(() => {
    if (!enabled) return
    let alive = true
    api
      .listDrawnEdges()
      .then((e) => {
        if (alive) setEdges(e)
      })
      .catch(() => {
        /* edit overlay is optional — ignore fetch errors */
      })
    return () => {
      alive = false
    }
  }, [enabled, reloadToken])
  return enabled ? edges : null
}
