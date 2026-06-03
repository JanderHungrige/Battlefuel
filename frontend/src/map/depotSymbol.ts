// Pure fuel-gauge math for depot symbols (v2 Wave 3, depot-nato-symbol-fuelbars).
// No canvas/MapLibre, so it is unit-testable; MapView composites the actual icon.

import type { DepotFuel, FuelStock } from '../api/types'

/** Friendly APP-6 sustainment / fuel-supply SIDC drawn at the depot. */
export const DEPOT_SIDC = '10031000001406000000'

/** Number of segments in each per-fuel bar. */
export const GAUGE_SEGMENTS = 4

/** Filled segment count (0–GAUGE_SEGMENTS) for a quantity against capacity. */
export function filledSegments(quantity: number, capacity: number): number {
  if (capacity <= 0) return 0
  const frac = quantity / capacity
  return Math.max(0, Math.min(GAUGE_SEGMENTS, Math.round(frac * GAUGE_SEGMENTS)))
}

export interface DepotGauges {
  diesel: number
  jp8: number
}

function fuelFill(stocks: FuelStock[], fuelType: string): number {
  const matching = stocks.filter((s) => s.fuel_type.toLowerCase() === fuelType)
  const quantity = matching.reduce((sum, s) => sum + s.quantity_liters, 0)
  const capacity = matching.reduce((sum, s) => sum + s.capacity_liters, 0)
  return filledSegments(quantity, capacity)
}

/** Filled-segment counts per fuel type for a depot's stocks (case-insensitive match). */
export function depotGauges(stocks: FuelStock[]): DepotGauges {
  return { diesel: fuelFill(stocks, 'diesel'), jp8: fuelFill(stocks, 'jp8') }
}

/** A stable image key encoding the fill, so depots with the same gauges share one registered icon. */
export function depotIconKey(depot: DepotFuel): string {
  const g = depotGauges(depot.stocks)
  return `depot:${g.diesel}-${g.jp8}`
}
