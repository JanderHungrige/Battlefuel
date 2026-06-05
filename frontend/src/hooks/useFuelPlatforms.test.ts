import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FuelPlatform } from '../api/types'
import { api } from '../api/client'
import { defaultPlatformId, useFuelPlatforms } from './useFuelPlatforms'

const PLATFORMS: FuelPlatform[] = [
  { id: 'platform-world-fuel-dfms', name: 'World Fuel DFMS', logo_key: 'world-fuel', is_default: true },
  { id: 'platform-shell-fm', name: 'Shell FM', logo_key: 'shell-fm', is_default: false },
]

afterEach(() => vi.restoreAllMocks())

describe('defaultPlatformId', () => {
  it('picks the is_default platform', () => {
    expect(defaultPlatformId(PLATFORMS)).toBe('platform-world-fuel-dfms')
  })

  it('falls back to the first when none is default', () => {
    expect(defaultPlatformId([PLATFORMS[1]])).toBe('platform-shell-fm')
  })

  it('returns empty string for an empty list', () => {
    expect(defaultPlatformId([])).toBe('')
  })
})

describe('useFuelPlatforms', () => {
  it('loads platforms and selects the default', async () => {
    vi.spyOn(api, 'getFuelPlatforms').mockResolvedValue(PLATFORMS)
    const { result } = renderHook(() => useFuelPlatforms(true))
    await waitFor(() => expect(result.current.platforms).toHaveLength(2))
    expect(result.current.selectedId).toBe('platform-world-fuel-dfms')
    expect(result.current.selectedPlatform?.name).toBe('World Fuel DFMS')
  })

  it('does not fetch while disabled', () => {
    const spy = vi.spyOn(api, 'getFuelPlatforms').mockResolvedValue(PLATFORMS)
    renderHook(() => useFuelPlatforms(false))
    expect(spy).not.toHaveBeenCalled()
  })

  it('appends an added platform and selects it', async () => {
    vi.spyOn(api, 'getFuelPlatforms').mockResolvedValue(PLATFORMS)
    const added: FuelPlatform = {
      id: 'platform-nato-fuel-cell',
      name: 'NATO Fuel Cell',
      logo_key: null,
      is_default: false,
    }
    vi.spyOn(api, 'createFuelPlatform').mockResolvedValue(added)
    const { result } = renderHook(() => useFuelPlatforms(true))
    await waitFor(() => expect(result.current.platforms).toHaveLength(2))
    await act(async () => {
      await result.current.addPlatform('NATO Fuel Cell')
    })
    expect(result.current.platforms.map((p) => p.id)).toContain('platform-nato-fuel-cell')
    expect(result.current.selectedId).toBe('platform-nato-fuel-cell')
  })
})
