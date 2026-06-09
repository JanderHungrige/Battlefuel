// OF-8 (Joint Force Supply) map focus (v2 W13 correction): per-tab, grey out units that are not
// relevant to the active supply tab so the operator's attention stays on what matters.
//   overview     → bright: fuel trucks + depots; dim: other NATO units
//   supply fleet → bright: fuel trucks;           dim: other NATO units + depots
//   order fuel   → bright: depots;                dim: all units (trucks included)
// Pure + unit-testable.

export type SupplyTab = 'overview' | 'fleet' | 'order'

/** Instance ids of friendly units to dim on the map for the given tab. */
export function dimmedUnitIds(
  tab: SupplyTab,
  allUnitIds: readonly string[],
  truckIds: readonly string[],
): string[] {
  const trucks = new Set(truckIds)
  return allUnitIds.filter((id) => {
    if (tab === 'order') return true // only depots matter when ordering fuel
    return !trucks.has(id) // overview + fleet: only the fuel fleet stays bright
  })
}

/** Whether depots should be dimmed for the given tab (only the supply-fleet tab dims them). */
export function dimDepots(tab: SupplyTab): boolean {
  return tab === 'fleet'
}
