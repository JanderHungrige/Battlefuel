// Pure helpers for the routed fuel run (v2 Wave 12). Kept out of the hook so the
// nearest-source selection is deterministically unit-testable.

export interface TruckLike {
  instance_id: string
  name: string
  fuel_type: string
  current_fuel_liters: number | null
  lat: number
  lon: number
}

/** Closest fuelled truck of the matching fuel type to (lat, lon), or null if none. */
export function nearestFuelTruck(
  lat: number,
  lon: number,
  trucks: readonly TruckLike[],
  fuelType: string,
): TruckLike | null {
  let best: TruckLike | null = null
  let bestD = Infinity
  for (const t of trucks) {
    if (t.fuel_type !== fuelType) continue
    if ((t.current_fuel_liters ?? 0) <= 0) continue
    const d = (t.lat - lat) ** 2 + (t.lon - lon) ** 2 // squared-degree distance is fine for nearest
    if (d < bestD) {
      bestD = d
      best = t
    }
  }
  return best
}

export interface DepotLike {
  id: string
  name: string
  lat: number
  lon: number
  stocks: { fuel_type: string; quantity_liters: number }[]
}

export interface FuelSource {
  kind: 'truck' | 'depot'
  id: string
  name: string
  lat: number
  lon: number
}

/** Closest stocked depot of the matching fuel type to (lat, lon), or null if none. */
export function nearestStockedDepot(
  lat: number,
  lon: number,
  depots: readonly DepotLike[],
  fuelType: string,
): FuelSource | null {
  let best: FuelSource | null = null
  let bestD = Infinity
  for (const d of depots) {
    const stock = d.stocks.find((s) => s.fuel_type === fuelType)
    if (!stock || stock.quantity_liters <= 0) continue
    const dist = (d.lat - lat) ** 2 + (d.lon - lon) ** 2
    if (dist < bestD) {
      bestD = dist
      best = { kind: 'depot', id: d.id, name: d.name, lat: d.lat, lon: d.lon }
    }
  }
  return best
}

export interface FuelSourceOptions {
  /** Nearest fuelled tanker — the preferred mover (it drives to the unit). Null if none. */
  truck: FuelSource | null
  /** Nearest stocked depot — a fixed asset the unit must drive to. Null if none. */
  depot: FuelSource | null
}

/**
 * The fuel-source options for a unit-first refuel: the nearest tanker AND the nearest depot,
 * each independently. A tanker is always offered when one exists (the caller defaults to it,
 * so the tanker comes to the unit); the depot is the fallback / alternative the unit drives to.
 */
export function fuelSourceOptions(
  lat: number,
  lon: number,
  trucks: readonly TruckLike[],
  depots: readonly DepotLike[],
  fuelType: string,
): FuelSourceOptions {
  const truck = nearestFuelTruck(lat, lon, trucks, fuelType)
  return {
    truck: truck && { kind: 'truck', id: truck.instance_id, name: truck.name, lat: truck.lat, lon: truck.lon },
    depot: nearestStockedDepot(lat, lon, depots, fuelType),
  }
}
