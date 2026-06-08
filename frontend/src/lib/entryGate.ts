// Entry gate for the branded landing page (v2 Wave 15 F2). Pure storage helpers so the landing
// shows once per browser session: a reload within the same session skips straight to the app, a
// fresh session shows it again. Wrapped in try/catch so a missing/blocked Storage (private mode)
// degrades to "always show" rather than throwing.

export const ENTRY_KEY = 'battlefuel.entered'

export function hasEntered(storage: Storage): boolean {
  try {
    return storage.getItem(ENTRY_KEY) === '1'
  } catch {
    return false
  }
}

export function markEntered(storage: Storage): void {
  try {
    storage.setItem(ENTRY_KEY, '1')
  } catch {
    // Storage unavailable — the gate will simply show again next load.
  }
}
