// Per-unit on-map fuel bar (v2 Wave 11 F7). Pure helpers — the canvas compositing + layers
// live in MapView.tsx; these compute the fuel fraction, colour bucket, and icon cache key so
// they are deterministically unit-testable (MapView itself is not unit-tested).

export const FUEL_BAR_BUCKETS = 10

export const FUEL_GREEN = '#3a8f4f'
export const FUEL_AMBER = '#d39a2b'
export const FUEL_RED = '#c0392b'

/** Fuel fraction in [0, 1], or null when there is no telemetry / no capacity (→ no bar). */
export function fuelFraction(
  currentLiters: number | null | undefined,
  capacityLiters: number,
): number | null {
  if (currentLiters == null || capacityLiters <= 0) return null
  return Math.max(0, Math.min(1, currentLiters / capacityLiters))
}

/** Colour-code the bar: green > 50%, amber 25–50%, red < 25%. */
export function fuelBarColor(fraction: number): string {
  if (fraction > 0.5) return FUEL_GREEN
  if (fraction > 0.25) return FUEL_AMBER
  return FUEL_RED
}

/** Quantise to a small number of buckets so we register a bounded set of bar icons. */
export function fuelBarBucket(fraction: number): number {
  return Math.round(Math.max(0, Math.min(1, fraction)) * FUEL_BAR_BUCKETS)
}

/** Icon cache key for a fuel fraction — bucket keeps the registered image count bounded. */
export function fuelBarKey(fraction: number): string {
  return `ufb:${fuelBarBucket(fraction)}`
}
