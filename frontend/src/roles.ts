// Operator roles and the declarative role→panel registry (Wave 5 role-view-switch).
//
// For the single-user MVP the role is a pure frontend view filter: it decides which panels and
// overlays mount. Endpoints stay open. New OF-8 surfaces (supply UI, strategic feed, unit
// overview) gate themselves via canShow() rather than scattering role checks, so a future
// server-driven role slots into the same registry without a rewrite.

export type Role = 'OF4' | 'OF8'

export const ROLES: { id: Role; label: string; title: string }[] = [
  { id: 'OF4', label: 'OF-4', title: 'Battalion — tactical' },
  { id: 'OF8', label: 'OF-8', title: 'Joint Force — supply' },
]

export type PanelKey =
  // OF-4 tactical tools
  | 'obstacleMode'
  | 'moveRoutes'
  | 'obstaclePicker'
  | 'terrainLegend'
  // OF-8 supply surfaces (wired by 29 / 30)
  | 'supplyPanel'
  | 'depotOverlay'
  | 'strategicFeed'
  // shared
  | 'inspect'
  | 'chatter'
  | 'unitOverview'
  | 'advisor'

const ROLE_PANELS: Record<Role, ReadonlySet<PanelKey>> = {
  OF4: new Set<PanelKey>([
    'obstacleMode',
    'moveRoutes',
    'obstaclePicker',
    'terrainLegend',
    'inspect',
    'chatter',
    'unitOverview',
    'advisor',
  ]),
  OF8: new Set<PanelKey>([
    'supplyPanel',
    'depotOverlay',
    'strategicFeed',
    'inspect',
    'chatter',
    'unitOverview',
    'advisor',
  ]),
}

/** Whether `panel` mounts for the active `role`. */
export function canShow(role: Role, panel: PanelKey): boolean {
  return ROLE_PANELS[role].has(panel)
}
