// Loads the OF-8 fuel order history (all historic + current orders) and refetches when a supply
// frame arrives (supplyTick) — that bump fires on every buy-order stage change (v2 Wave 11 F4).
// Only fetches while enabled (the OF-8 view is active).

import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client'
import type { BuyOrder } from '../api/types'

export interface OrderHistoryState {
  orders: BuyOrder[]
  refetch: () => void
}

export function useOrderHistory(enabled: boolean, supplyTick: number): OrderHistoryState {
  const [orders, setOrders] = useState<BuyOrder[]>([])

  const refetch = useCallback(() => {
    if (!enabled) return
    api
      .getBuyOrders()
      .then(setOrders)
      .catch(() => {})
  }, [enabled])

  useEffect(() => {
    refetch()
  }, [refetch, supplyTick])

  return { orders, refetch }
}
