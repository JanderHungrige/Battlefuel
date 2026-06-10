// Guided-tour step definitions for the "Take a tour" feature (v2: take-a-tour).
//
// Each step binds to a real on-screen element by CSS selector (existing classes / data-testids —
// no markup churn) and carries the caption shown in the popover. The tour covers the *current*
// role view: shared controls plus the role-specific tools (OF-4 tactical vs OF-8 supply). The
// hook filters to steps whose target is actually mounted, so a missing panel is skipped cleanly.

import type { Role } from '../roles'

export type TourSide = 'top' | 'bottom' | 'left' | 'right'
export type TourAlign = 'start' | 'center' | 'end'

export interface TourStep {
  /** CSS selector for the highlighted element. */
  selector: string
  title: string
  text: string
  side?: TourSide
  align?: TourAlign
}

const INTRO: TourStep = {
  selector: '.topbar .brand',
  title: 'Welcome to BattleFuel',
  text: 'A fuel-logistics and decision-support tool on a live map of the theater. This quick tour points out the main controls.',
  side: 'bottom',
  align: 'start',
}
const ROLE: TourStep = {
  selector: '[data-testid="role-toggle"]',
  title: 'Switch command roles',
  text: 'OF-4 is the tactical battalion view — move and route units. OF-8 is the joint-force supply view — fuel ordering, depots and distribution.',
  side: 'bottom',
}
const GRID: TourStep = {
  selector: '[data-testid="grid-control"]',
  title: 'Map grid',
  text: 'Pick the MGRS grid precision, from 100 km squares down to 100 m, with a coordinate readout to the metre.',
  side: 'bottom',
}
const UNITS: TourStep = {
  selector: '[data-testid="unit-overview-toggle"]',
  title: 'Unit overview',
  text: 'Open the roster to see each unit’s area, threat exposure, fuel and orders — click one to locate it on the map.',
  side: 'bottom',
}
const ADVISOR: TourStep = {
  selector: '[data-testid="advisor-toggle"]',
  title: 'Decision advisor',
  text: 'The advisor proposes refuel assignments, stock redistribution and route choices with rationale. You stay in control and approve.',
  side: 'bottom',
}

// OF-4 tactical
const OBSTACLE: TourStep = {
  selector: '[data-testid="obstacle-mode-toggle"]',
  title: 'Obstacle mode',
  text: 'Mark blocked or mined ground the router must avoid — place obstacles directly on the map.',
  side: 'bottom',
}

// OF-8 supply
const DEPOT: TourStep = {
  selector: '[data-testid="depot-mode-toggle"]',
  title: 'Add logistic sites',
  text: 'Place fuel depots and typed NATO logistic sites (BSA, CSSBN, DOB, FLS, TLB) that carry stock and can be refueled.',
  side: 'bottom',
}
const FUELBARS: TourStep = {
  selector: '[data-testid="info-bars-toggle"]',
  title: 'On-map fuel bars',
  text: 'Toggle a colour-coded fuel bar beside each unit; the selected unit’s bar sits on top.',
  side: 'bottom',
}
const SUPPLY: TourStep = {
  selector: '[data-testid="supply-panel"]',
  title: 'Supply & ordering',
  text: 'Order fuel through a branded platform, track each order through the NATO supply stages, and run routed fuel runs and rendezvous.',
  side: 'left',
}

const MAP: TourStep = {
  selector: '.map-area',
  title: 'The operational map',
  text: 'Click a unit to select and route it, click a sector to inspect it, and watch live movement, threats and intel update in real time.',
  side: 'top',
  align: 'center',
}
const CHATTER: TourStep = {
  selector: '.chatter',
  title: 'Intel & chatter feed',
  text: 'A live feed of battlefield events, each tagged with its grid location and sender. Click a line to locate and expand it.',
  side: 'left',
}
const REPLAY: TourStep = {
  selector: '.tour',
  title: 'Replay anytime',
  text: 'Re-run this tour whenever you like. Auto-play steps through on its own for demos — press Space to pause and resume.',
  side: 'left',
}

const COMMON_HEAD: readonly TourStep[] = [INTRO, ROLE, GRID, UNITS, ADVISOR]
const COMMON_TAIL: readonly TourStep[] = [MAP, CHATTER, REPLAY]

/** Ordered steps for the given role's current view. */
export function stepsForRole(role: Role): TourStep[] {
  const roleSteps = role === 'OF8' ? [DEPOT, FUELBARS, SUPPLY] : [OBSTACLE]
  return [...COMMON_HEAD, ...roleSteps, ...COMMON_TAIL]
}
