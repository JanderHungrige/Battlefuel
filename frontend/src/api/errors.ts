// Shared helper: turn an unknown thrown value (often an ApiError) into a user-facing string.

import { ApiError } from './client'

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 422) return 'No route to that destination.'
    if (e.status === 404) return 'Unit not found.'
    if (e.status === 409) return 'Unit type not in catalog.'
    return e.message
  }
  return e instanceof Error ? e.message : String(e)
}
