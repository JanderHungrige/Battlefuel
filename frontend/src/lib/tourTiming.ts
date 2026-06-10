// Auto-advance timing for the "Take a tour" auto-play mode (v2: take-a-tour).
//
// In auto-play (for shows/demos) each step advances on its own after a delay that scales with the
// caption length — longer text stays up longer — clamped to a comfortable [4s, 9s] window. Pure
// and deterministic so the timing is unit-testable without the DOM or a real clock.

export const TOUR_MIN_MS = 4_000
export const TOUR_MAX_MS = 9_000

// ~reading pace: a base dwell so very short captions still hold the floor, plus per-word time.
const BASE_MS = 1_800
const MS_PER_WORD = 360

/** Word count of a caption (whitespace-separated, empty-safe). */
export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

/** Auto-advance delay (ms) for a step caption, clamped to [TOUR_MIN_MS, TOUR_MAX_MS]. */
export function autoAdvanceDelayMs(text: string): number {
  const raw = BASE_MS + wordCount(text) * MS_PER_WORD
  return Math.min(TOUR_MAX_MS, Math.max(TOUR_MIN_MS, raw))
}
