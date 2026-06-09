// Force protection (v2 Wave 13 F7): when a fuel run / rendezvous routes a tanker through threat
// tiles, prompt the operator to consider force protection before dispatching. Pure + testable.

/** A route at/above this max threat (out of 5) crosses a threat sector (matches the route warning). */
export const FORCE_PROTECTION_THREAT = 3

/** Whether a route's max threat warrants a force-protection prompt. */
export function needsForceProtection(threatMax: number | null | undefined): boolean {
  return (threatMax ?? 0) >= FORCE_PROTECTION_THREAT
}
