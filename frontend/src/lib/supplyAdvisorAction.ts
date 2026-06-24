// Maps a supply-relevant combat event to the advisor recommendation kind that best fits it
// (v2 Wave 4 F5). Pure + deterministic so it is unit-testable and never auto-acts — it only
// chooses which existing advisor query to run; the operator still applies any order manually.

import type { RecommendationKind } from '../api/types'

/**
 * Choose the advisor kind for a supply-relevant event, by category:
 * - Refueling & Fuel  → `refuel`       (depot low, bingo fuel, tanker loss, emergency request)
 * - Movement & Access → `reposition`   (route RED/AMBER, road damaged, chokepoint, minefield)
 * - everything else   → `redistribution` (Supply Chain & Rearming, Logistics & Support, …)
 */
export function supplyAdviceKind(category: string): RecommendationKind {
  const c = category.toLowerCase()
  if (c.includes('fuel')) return 'refuel'
  if (c.includes('movement') || c.includes('access')) return 'reposition'
  return 'redistribution'
}
