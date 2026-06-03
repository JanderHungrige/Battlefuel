// Pure category → glyph mapping for combat-event hover icons (v2 Wave 3, event-hover-icons).
// No canvas/MapLibre, so it is unit-testable; MapView rasterizes each glyph to an offline image.

export interface EventIcon {
  /** Stable MapLibre image id (also the feature `icon` property). */
  key: string
  /** Single character rasterized into the marker (ASCII for reliable offline rendering). */
  glyph: string
  /** Human-readable label for the hover/legend. */
  label: string
}

const MINE: EventIcon = { key: 'evt:mine', glyph: 'M', label: 'IED / mine' }
const DRONE: EventIcon = { key: 'evt:drone', glyph: 'D', label: 'Air / drone threat' }
const ENEMY: EventIcon = { key: 'evt:enemy', glyph: 'E', label: 'Enemy near' }
const CHECKPOINT: EventIcon = { key: 'evt:checkpoint', glyph: 'C', label: 'Movement / checkpoint' }
const FIRES: EventIcon = { key: 'evt:fires', glyph: 'F', label: 'Fires / engagement' }
const GENERIC: EventIcon = { key: 'evt:generic', glyph: '!', label: 'Threat event' }

/** Every distinct icon (for one-time image registration in MapView). */
export const ALL_EVENT_ICONS: readonly EventIcon[] = [
  MINE,
  DRONE,
  ENEMY,
  CHECKPOINT,
  FIRES,
  GENERIC,
]

/**
 * Pick the category glyph for an event. Rules in priority order — mirrors the backend `classify`
 * ordering (mine before generic threat, etc.) so the icon matches the square's zone intent.
 */
export function iconForEvent(category: string, event: string): EventIcon {
  const e = event.toLowerCase()
  if (/\b(ied|mine\w*)\b/.test(e)) return MINE
  if (/air threat|drone|fixed-wing|helo/.test(e)) return DRONE
  if (/hostile|spotted|enemy/.test(e)) return ENEMY
  if (/chokepoint|route|ford|checkpoint|crossing|bottleneck/.test(e)) return CHECKPOINT
  if (/air strike|ambush|engagement|fires?|gunfire|strike/.test(e)) return FIRES
  // Category fallback (mirrors the backend classify): an unrecognised threat/adversary event still
  // reads as enemy-near rather than a bare generic marker.
  if (/adversary|threat/i.test(category)) return ENEMY
  return GENERIC
}
