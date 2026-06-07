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

/** Closest fuel source (mobile truck OR stocked depot) of the matching fuel type, or null. */
export function nearestFuelSource(
  lat: number,
  lon: number,
  trucks: readonly TruckLike[],
  depots: readonly DepotLike[],
  fuelType: string,
): FuelSource | null {
  const candidates: FuelSource[] = []
  for (const t of trucks) {
    if (t.fuel_type === fuelType && (t.current_fuel_liters ?? 0) > 0) {
      candidates.push({ kind: 'truck', id: t.instance_id, name: t.name, lat: t.lat, lon: t.lon })
    }
  }
  for (const d of depots) {
    const stock = d.stocks.find((s) => s.fuel_type === fuelType)
    if (stock && stock.quantity_liters > 0) {
      candidates.push({ kind: 'depot', id: d.id, name: d.name, lat: d.lat, lon: d.lon })
    }
  }
  let best: FuelSource | null = null
  let bestD = Infinity
  for (const c of candidates) {
    const dist = (c.lat - lat) ** 2 + (c.lon - lon) ** 2
    if (dist < bestD) {
      bestD = dist
      best = c
    }
  }
  return best
}
