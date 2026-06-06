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
