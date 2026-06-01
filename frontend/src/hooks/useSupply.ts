// Loads the OF-8 fuel distribution (depots + overview) and refetches when a supply order frame
// arrives (supplyTick) or on demand. Only fetches while enabled (the OF-8 view is active).

import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client'
import type { FuelDepot, SupplyOverview } from '../api/types'

export interface SupplyState {
  depots: FuelDepot[]
  overview: SupplyOverview | null
  refetch: () => void
}

export function useSupply(enabled: boolean, supplyTick: number): SupplyState {
  const [depots, setDepots] = useState<FuelDepot[]>([])
  const [overview, setOverview] = useState<SupplyOverview | null>(null)

  const refetch = useCallback(() => {
    if (!enabled) return
    api
      .getSupplyOverview()
      .then(setOverview)
      .catch(() => {})
    api
      .getDepots()
      .then(setDepots)
      .catch(() => {})
  }, [enabled])

  useEffect(() => {
    refetch()
  }, [refetch, supplyTick])

  return { depots, overview, refetch }
}
