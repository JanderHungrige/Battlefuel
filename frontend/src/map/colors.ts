// Single source of truth for the map's accent + selection colours (v2 Wave 2).
// Keep ACCENT in sync with the `--accent` CSS custom property in index.css (CSS can't import TS).

/** Indicator accent (routes, destination) — warm tone replacing the old cyan #00e5cc. */
export const ACCENT = '#FFD9BD'

/** Darker-blue halo under a selected unit's APP-6 icon. */
export const SELECTED_UNIT = '#1d4ed8'

/** Ring around the selected-unit halo (a still-darker blue). */
export const SELECTED_UNIT_RING = '#1e3a8a'
