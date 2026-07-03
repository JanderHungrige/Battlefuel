// Auto-advance timing for the "Take a tour" auto-play mode (v2: take-a-tour, demo expansion).
//
// In auto-play (for shows/demos) each step advances on its own after a FIXED dwell so the whole
// walkthrough runs at a predictable pace — 3 seconds per explanation, regardless of caption
// length. Pure and deterministic so the timing is unit-testable without the DOM or a real clock.

/** Fixed dwell per auto-play step (ms). */
export const TOUR_STEP_MS = 3_000

/** Word count of a caption (whitespace-separated, empty-safe). */
export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

/**
 * Auto-advance delay (ms) for a step caption. Fixed at {@link TOUR_STEP_MS} — the caption is
 * ignored (kept in the signature so the caller stays caption-driven if scaling ever returns).
 */
export function autoAdvanceDelayMs(_text: string): number {
  return TOUR_STEP_MS
}
