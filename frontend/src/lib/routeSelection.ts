// Pure helper for the move-planning metric selection (v2 Wave 16).
// When a route is re-planned (e.g. the operator switched the travel mode road↔off-road), keep the
// metric they had already chosen (fastest/safest) if it's still offered, instead of snapping back
// to the first option. Falls back to the first option for a fresh plan (no prior choice).

import type { RouteMetric, RouteOption } from '../api/types'

export function keepSelectedMetric(
  prev: RouteMetric | null,
  options: readonly RouteOption[],
): RouteMetric | null {
  if (prev && options.some((o) => o.metric === prev)) return prev
  return options[0]?.metric ?? null
}
