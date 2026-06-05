// OF-8 supply-order actions (Wave 5 of8-supply-ui): place buy orders, and place + confirm
// refuel orders. On a refuel order the backend returns the recommended truck + rendezvous;
// this hook surfaces them (for the panel) and exposes the truck cell + rendezvous (for the map).

import { useCallback, useMemo, useState } from 'react'
import { ApiError, api } from '../api/client'
import type { ChatterMessage, UnitInstance, UnitType } from '../api/types'
import type { RecommendationView } from '../components/SupplyPanel'

type PushChatter = (text: string, kind?: ChatterMessage['kind'], h3Index?: string) => void

export interface SupplyOrdersState {
  /** Placed units eligible for refuel (everything that is not itself a fuel truck). */
  refuelTargets: { id: string; name: string }[]
  recommendation: RecommendationView | null
  rendezvous: { lat: number; lon: number } | null
  truckHighlightH3: string | null
  busy: boolean
  message: string | null
  placeBuy: (depotId: string, fuelType: string, quantityLiters: number) => void
  placeRefuel: (unitId: string) => void
  confirmRefuel: () => void
  cancelRefuel: () => void
}

export function useSupplyOrders(
  units: UnitInstance[],
  unitTypes: UnitType[],
  pushChatter: PushChatter,
  refetch: () => void,
): SupplyOrdersState {
  const refuelTargets = useMemo(
    () =>
      units
        .filter((u) => {
          const t = unitTypes.find((ut) => ut.id === u.unit_type_id)
          return t != null && t.nato_unit_type !== 'fuel_supply'
        })
        .map((u) => ({ id: u.id, name: u.name })),
    [units, unitTypes],
  )
  const [recommendation, setRecommendation] = useState<RecommendationView | null>(null)
  const [rendezvous, setRendezvous] = useState<{ lat: number; lon: number } | null>(null)
  const [truckHighlightH3, setTruckHighlightH3] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const clearRec = useCallback(() => {
    setRecommendation(null)
    setRendezvous(null)
    setTruckHighlightH3(null)
  }, [])

  const placeBuy = useCallback(
    (depotId: string, fuelType: string, quantityLiters: number) => {
      setBusy(true)
      setMessage(null)
      api
        .createBuyOrder({ depot_id: depotId, fuel_type: fuelType, quantity_liters: quantityLiters })
        .then((o) => api.confirmBuyOrder(o.id))
        .then(() => {
          const text = `Fuel order: ${quantityLiters} L ${fuelType} → ${depotId} (inbound)`
          setMessage(text)
          pushChatter(text, 'order')
          refetch()
        })
        .catch((e: unknown) =>
          setMessage(
            e instanceof ApiError ? `Fuel order failed (${e.status}).` : 'Fuel order failed.',
          ),
        )
        .finally(() => setBusy(false))
    },
    [pushChatter, refetch],
  )

  const placeRefuel = useCallback(
    (unitId: string) => {
      setBusy(true)
      setMessage(null)
      clearRec()
      api
        .createRefuelOrder({ unit_id: unitId })
        .then((order) => {
          const truck = units.find((u) => u.id === order.truck_id)
          setRecommendation({ order, truckName: truck?.name ?? order.truck_id })
          setRendezvous({ lat: order.rendezvous_lat, lon: order.rendezvous_lon })
          setTruckHighlightH3(truck?.h3_index ?? null)
          setMessage(`Recommended ${truck?.name ?? order.truck_id} — move it to the rendezvous.`)
        })
        .catch((e: unknown) =>
          setMessage(
            e instanceof ApiError && e.status === 422
              ? 'No compatible fuel truck available.'
              : 'Refuel request failed.',
          ),
        )
        .finally(() => setBusy(false))
    },
    [units, clearRec],
  )

  const confirmRefuel = useCallback(() => {
    if (!recommendation) return
    const order = recommendation.order
    setBusy(true)
    api
      .confirmRefuelOrder(order.id)
      .then(() => {
        pushChatter(`Refuel order confirmed: ${recommendation.truckName} → ${order.unit_id}`, 'order')
        setMessage('Refuel order active — fuel transfers when the truck reaches the unit.')
        clearRec()
      })
      .catch(() => setMessage('Could not confirm refuel order.'))
      .finally(() => setBusy(false))
  }, [recommendation, pushChatter, clearRec])

  const cancelRefuel = useCallback(() => {
    if (recommendation) api.cancelRefuelOrder(recommendation.order.id).catch(() => {})
    setMessage(null)
    clearRec()
  }, [recommendation, clearRec])

  return {
    refuelTargets,
    recommendation,
    rendezvous,
    truckHighlightH3,
    busy,
    message,
    placeBuy,
    placeRefuel,
    confirmRefuel,
    cancelRefuel,
  }
}
