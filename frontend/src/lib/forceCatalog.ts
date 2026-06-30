// Split the unit-type catalog into the scenario creator's two picker tabs (v2 Wave 22 F1):
// "fuel" = fuel-related elements (fuel supply + logistics), "troops" = every other troop element.
// Pure, so it is unit-testable and shared by the panel.

import type { UnitType } from '../api/types'

export type ForceTab = 'fuel' | 'troops'

/** NATO unit types that belong on the "fuel-related elements" tab. */
const FUEL_RELATED = new Set(['fuel_supply', 'logistics'])

/** Which picker tab a unit type belongs to. */
export function unitTab(unit: UnitType): ForceTab {
  return FUEL_RELATED.has(unit.nato_unit_type) ? 'fuel' : 'troops'
}

/** The unit types on a given tab, sorted by display name. */
export function unitsForTab(units: UnitType[], tab: ForceTab): UnitType[] {
  return units.filter((u) => unitTab(u) === tab).sort((a, b) => a.name.localeCompare(b.name))
}
