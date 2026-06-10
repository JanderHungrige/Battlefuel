// Guided-tour step definitions for the "Take a tour" feature (v2: take-a-tour).
//
// Each step binds to a real on-screen element by CSS selector (existing classes / data-testids —
// no markup churn) and carries the caption shown in the popover. The tour covers the *current*
// role view: shared controls plus the role-specific tools (OF-4 tactical vs OF-8 supply).
//
// Some controls only exist after an interaction (the Plan-move panel needs a unit selected; the
// supply sub-tabs swap their content). A step's optional `before` runs as that step is shown and
// enables the *next* step's target — so every popover anchors to an element that is already on
// screen (no render race). `select-unit` is an app action (the hook calls it via an actions map);
// `click` is a plain selector the hook clicks (e.g. to switch a sub-tab).

import type { Role } from '../roles'

export type TourSide = 'top' | 'bottom' | 'left' | 'right'
export type TourAlign = 'start' | 'center' | 'end'
export type TourActionKey = 'select-unit' | 'plan-rendezvous' | 'cancel-rendezvous'

export interface TourBefore {
  /** Selector the hook clicks before showing this step (e.g. switch a sub-tab). */
  click?: string
  /** A named app action the hook runs via its actions map (e.g. select a demo unit). */
  action?: TourActionKey
}

export interface TourStep {
  /** CSS selector for the highlighted element. */
  selector: string
  title: string
  text: string
  side?: TourSide
  align?: TourAlign
  before?: TourBefore
}

// ---- shared (both roles) ----------------------------------------------------------------------

const INTRO: TourStep = {
  selector: '.topbar .brand',
  title: 'Welcome to BattleFuel',
  text: 'A fuel-logistics and decision-support tool on a live map of the theater. This quick tour points out the main controls — use Next, or pick Auto-play and press Space to pause.',
  side: 'bottom',
  align: 'start',
}
const ROLE: TourStep = {
  selector: '[data-testid="role-toggle"]',
  title: 'Switch command roles',
  text: 'OF-4 is the tactical battalion view — move and route units. OF-8 is the joint-force supply view — fuel ordering, depots and distribution. The tour adapts to whichever you’re in.',
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

// ---- OF-4 tactical: routing depth -------------------------------------------------------------

const OBSTACLE: TourStep = {
  selector: '[data-testid="obstacle-mode-toggle"]',
  title: 'Obstacle mode',
  text: 'Mark blocked or mined ground the router must avoid — place obstacles directly on the map.',
  side: 'bottom',
}
// Selecting a unit (the `before`) opens the Plan-move panel so the next steps can point at it.
const ROUTING_INTRO: TourStep = {
  selector: '.map-area',
  title: 'Plan a unit’s move',
  text: 'Routing starts by selecting a unit, then clicking a destination. I’ve opened the Plan-move panel on the right for a unit — the next steps walk through it.',
  side: 'top',
  align: 'center',
  before: { action: 'select-unit' },
}
const TRAVEL_MODES: TourStep = {
  selector: '.move-mode',
  title: 'Travel mode',
  text: 'Choose how the unit travels: Road (fast on roads), Off-road (cross-country — slower and more fuel), Hybrid (stitches road + off-road), or Direct (a straight line). In waypoint routing each leg can use its own mode.',
  side: 'left',
}
const ROUTE_SAFE_FAST: TourStep = {
  selector: '.move-panel',
  title: 'Safe vs Fast routes',
  text: 'After you click a destination the planner offers two routes: SAFE avoids enemy troops and high-threat sectors, even detouring off-road around danger; FAST takes the shortest path, crossing threats at a penalty (with a warning over a combat sector). Pick one and Confirm move order.',
  side: 'left',
}
const WAYPOINTS: TourStep = {
  selector: '[data-testid="wp-start"]',
  title: 'Waypoint routing',
  text: 'Start waypoint routing, click the map to drop ordered waypoints, Remove last to undo, End routing to plan the stitched legs, then Confirm. Each leg keeps its own travel mode.',
  side: 'left',
}
const REFUEL_RDV: TourStep = {
  selector: '.move-panel',
  title: 'Refuel stop & rendezvous',
  text: 'On a planned route you can “+ Add refuel stop” — insert a meet with the nearest tanker on the way, kept out of threat where possible — or “Plan rendezvous” to send the unit and a tanker to meet at a sector. A tanker routed through threat raises a force-protection prompt.',
  side: 'left',
}

// ---- OF-8 supply: Joint-Force Supply tab + sub-tabs -------------------------------------------

const SUPPLY_HEADER: TourStep = {
  selector: '[data-testid="supply-panel"]',
  title: 'Joint-Force Supply',
  text: 'The OF-8 hub: monitor depots, manage the tanker fleet, order fuel and run fuel missions. It has three tabs — Overview, Supply fleet and Order fuel — plus Order history and Info docs up top.',
  side: 'left',
  before: { click: '[data-testid="supply-tab-overview"]' },
}
const SUPPLY_OVERVIEW: TourStep = {
  selector: '[data-testid="fleet-summary"]',
  title: 'Overview tab',
  text: 'Each depot’s fuel stocks with fill bars; a low depot shows “Propose refuel”, which asks the advisor for a redistribution order. Below is a fleet summary — total tankers and how many are on standby.',
  side: 'left',
}
const SUPPLY_TAB_FLEET: TourStep = {
  selector: '[data-testid="supply-tab-fleet"]',
  title: 'Supply Fleet tab',
  text: 'Switch here for every tanker — its live fuel level and whether it’s on standby or already tasked to a unit. Click a tanker’s name to locate it on the map.',
  side: 'left',
  before: { click: '[data-testid="supply-tab-fleet"]' },
}
const SUPPLY_FLEET_FUELRUN: TourStep = {
  selector: '[data-testid^="fuel-run-start-"]',
  title: 'Create fuel run',
  text: 'Send this tanker straight to a target unit you click on the map — fuel transfers automatically when it arrives.',
  side: 'left',
}
// The `before` starts the rendezvous flow so the Plan Rendezvous panel mounts for the next step.
const SUPPLY_FLEET_RDV: TourStep = {
  selector: '[data-testid^="rdv-start-"]',
  title: 'Plan rendezvous',
  text: 'Instead of driving all the way to the unit, have the tanker and the unit meet at a sector you choose. Watch — I’ll open the rendezvous planner.',
  side: 'left',
  before: { action: 'plan-rendezvous' },
}
const SUPPLY_RDV_PANEL: TourStep = {
  selector: '[data-testid="plan-rendezvous-panel"]',
  title: 'Rendezvous planner',
  text: 'Pick the target unit, then the meeting sector — the planner shows Safe/Fast routes for BOTH the tanker and the unit. “Order now” dispatches them to meet, or schedule it for a sim-clock time with a confirm-to-launch reminder.',
  side: 'top',
  align: 'start',
}
const SUPPLY_TAB_ORDER: TourStep = {
  selector: '[data-testid="supply-tab-order"]',
  title: 'Order Fuel tab',
  text: 'Switch here to place supply orders.',
  side: 'left',
  // Close the rendezvous planner opened above, then switch to the Order fuel tab.
  before: { action: 'cancel-rendezvous', click: '[data-testid="supply-tab-order"]' },
}
const SUPPLY_ORDER_FORM: TourStep = {
  selector: '[data-testid="buy-submit"]',
  title: 'Order fuel to a depot',
  text: 'Pick a fuel-management platform (World Fuel DFMS, Shell FM, or add your own), choose the depot, fuel type and amount, then “Order fuel” opens a branded order mask — placing it logs the order and starts it through the NATO supply stages.',
  side: 'left',
}
const SUPPLY_REFUEL: TourStep = {
  selector: '[data-testid="refuel-submit"]',
  title: 'Refuel a unit',
  text: 'Request a refuel for a chosen unit; the advisor recommends the nearest tanker to send to the rendezvous.',
  side: 'left',
}
const SUPPLY_HISTORY: TourStep = {
  selector: '[data-testid="order-history-open"]',
  title: 'Order history',
  text: 'Tracks every order through the NATO stages — placed → JLSG → JTF → provider → on route → reached JLSG → reached OPCON — and lists scheduled rendezvous; click one to draw both routes on the map.',
  side: 'bottom',
  align: 'end',
}
const SUPPLY_DOCS: TourStep = {
  selector: '[data-testid="info-docs-open"]',
  title: 'Info docs',
  text: 'Opens the official logistics reference PDFs, served with the app.',
  side: 'bottom',
  align: 'end',
}

const COMMON_HEAD: readonly TourStep[] = [INTRO, ROLE, GRID, UNITS, ADVISOR, MAP]
const COMMON_TAIL: readonly TourStep[] = [CHATTER, REPLAY]

const OF4_STEPS: readonly TourStep[] = [
  OBSTACLE,
  ROUTING_INTRO,
  TRAVEL_MODES,
  ROUTE_SAFE_FAST,
  WAYPOINTS,
  REFUEL_RDV,
]
const OF8_STEPS: readonly TourStep[] = [
  SUPPLY_HEADER,
  SUPPLY_OVERVIEW,
  SUPPLY_TAB_FLEET,
  SUPPLY_FLEET_FUELRUN,
  SUPPLY_FLEET_RDV,
  SUPPLY_RDV_PANEL,
  SUPPLY_TAB_ORDER,
  SUPPLY_ORDER_FORM,
  SUPPLY_REFUEL,
  SUPPLY_HISTORY,
  SUPPLY_DOCS,
]

/** Ordered steps for the given role's current view. */
export function stepsForRole(role: Role): TourStep[] {
  const roleSteps = role === 'OF8' ? OF8_STEPS : OF4_STEPS
  return [...COMMON_HEAD, ...roleSteps, ...COMMON_TAIL]
}
