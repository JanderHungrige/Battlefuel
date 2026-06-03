// Single source of truth for the map's accent + selection colours (v2 Wave 2).
// Keep ACCENT in sync with the `--accent` CSS custom property in index.css (CSS can't import TS).

/** UI indicator accent (buttons, badges) — warm tone replacing the old cyan #00e5cc. */
export const ACCENT = '#FFD9BD'

/** Route / destination visuals — matches the friendly APP-6 symbol fill (milsymbol Friend). */
export const ROUTE = '#80e0ff'

/** Bright-yellow halo marking the selected unit (high visibility on the light base). */
export const SELECTED_UNIT = '#ffe600'

/** Ring around the selected-unit halo (a darker amber for contrast). */
export const SELECTED_UNIT_RING = '#8a6d00'

// --- Combat-event threat squares (v2 Wave 3). Red is reserved for combat zones; blocked/restricted
// areas read light-yellow; ordinary threat squares are amber, graded by estimated threat. Each zone
// has a fill + a darker outline. Single source of truth for the MapLibre `match` expressions. ---
export const ZONE_COMBAT_FILL = '#d0021b'
export const ZONE_COMBAT_LINE = '#7a0010'
export const ZONE_BLOCKED_FILL = '#e8d24a'
export const ZONE_BLOCKED_LINE = '#9c8410'
export const ZONE_THREAT_FILL = '#ff8c2b'
export const ZONE_THREAT_LINE = '#a8530d'
