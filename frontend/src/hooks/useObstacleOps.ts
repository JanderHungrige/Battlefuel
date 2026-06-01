// Operator ops (Wave 4, obstacle-tile-ops-ui): manual obstacles + tile edits.
// Owns the obstacle list (fetched on mount, updated from this client's own writes — single-user).
// Tile edits go through PATCH and refresh the map via the tile_update WS echo (no local state).

import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Obstacle, TileMutationRequest } from '../api/types'

export interface ObstacleOps {
  obstacles: Obstacle[]
  placeObstacle: (lat: number, lon: number, kind?: string) => void
  removeObstacle: (id: string) => void
  mutateTile: (h3Index: string, mutation: TileMutationRequest) => void
}

export function useObstacleOps(): ObstacleOps {
  const [obstacles, setObstacles] = useState<Obstacle[]>([])

  useEffect(() => {
    let active = true
    api
      .listObstacles()
      .then((o) => {
        if (active) setObstacles(o)
      })
      .catch((e: unknown) => console.error('[ops] load obstacles failed:', e))
    return () => {
      active = false
    }
  }, [])

  const placeObstacle = useCallback((lat: number, lon: number, kind = 'manual') => {
    api
      .createObstacle(lat, lon, kind)
      .then((o) => setObstacles((prev) => [...prev, o]))
      .catch((e: unknown) => console.error('[ops] place obstacle failed:', e))
  }, [])

  const removeObstacle = useCallback((id: string) => {
    api
      .deleteObstacle(id)
      .then(() => setObstacles((prev) => prev.filter((o) => o.id !== id)))
      .catch((e: unknown) => console.error('[ops] remove obstacle failed:', e))
  }, [])

  const mutateTile = useCallback((h3Index: string, mutation: TileMutationRequest) => {
    api
      .patchTile(h3Index, mutation)
      .catch((e: unknown) => console.error('[ops] tile edit failed:', e))
  }, [])

  return { obstacles, placeObstacle, removeObstacle, mutateTile }
}
