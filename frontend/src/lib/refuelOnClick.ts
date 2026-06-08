// Decide whether clicking a unit should start its refuel flow (v2 Wave 11 F6).
// Only in the OF-8 (supply) view, and only for a unit that is a valid refuel target
// (i.e. not itself a fuel truck). Pure + testable; the actual placeRefuel call lives in App.

import type { Role } from '../roles'

export function shouldRefuelOnClick(
  role: Role,
  refuelTargetIds: readonly string[],
  unitId: string,
): boolean {
  return role === 'OF8' && refuelTargetIds.includes(unitId)
}
