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
