import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RouteOption, UnitInstance } from '../api/types'
import { usePlanRendezvous } from './usePlanRendezvous'

const planRendezvous = vi.fn()
const createRendezvous = vi.fn()
const scheduleRendezvous = vi.fn()

vi.mock('../api/client', () => ({
  ApiError: class ApiError extends Error {
    status = 0
  },
  api: {
    planRendezvous: (...a: unknown[]) => planRendezvous(...a),
    createRendezvous: (...a: unknown[]) => createRendezvous(...a),
    scheduleRendezvous: (...a: unknown[]) => scheduleRendezvous(...a),
  },
}))

const route = (metric: 'safe' | 'fast'): RouteOption => ({
  label: metric === 'safe' ? 'safest' : 'fastest',
  metric,
  geometry: [
    [11.8, 49.2],
    [11.82, 49.22],
  ],
  distance_m: 4000,
  duration_s: 500,
  threat_max: 1,
  threat_avg: 0.3,
  fuel_consumed_l: 33,
  fuel_remaining_l: 120,
  sufficient_fuel: true,
})

const units: UnitInstance[] = [
  { id: 'inst-armor-1', name: 'LION', unit_type_id: 't', lat: 49.2, lon: 11.8 } as UnitInstance,
]

describe('usePlanRendezvous', () => {
  beforeEach(() => {
    planRendezvous.mockReset()
    createRendezvous.mockReset()
    scheduleRendezvous.mockReset()
  })

  it('walks idle → pick-unit → pick-sector → review and previews both routes', async () => {
    planRendezvous.mockResolvedValue({
      sector: { lat: 49.21, lon: 11.81, h3: '8abc' },
      truck_routes: [route('safe'), route('fast')],
      unit_routes: [route('safe'), route('fast')],
    })
    const { result } = renderHook(() => usePlanRendezvous(units, vi.fn(), vi.fn()))

    expect(result.current.phase).toBe('idle')
    act(() => result.current.start('inst-fuel-1', 'BOWSER'))
    expect(result.current.phase).toBe('pick-unit')
    act(() => result.current.pickUnit('inst-armor-1'))
    expect(result.current.phase).toBe('pick-sector')
    expect(result.current.unitName).toBe('LION')
    // Chosen ids are exposed for the orange map highlight (v2 W13 correction).
    expect(result.current.truckId).toBe('inst-fuel-1')
    expect(result.current.unitId).toBe('inst-armor-1')

    act(() => result.current.pickSector(49.21, 11.81))
    await waitFor(() => expect(result.current.phase).toBe('review'))
    expect(planRendezvous).toHaveBeenCalledWith({
      truck_id: 'inst-fuel-1',
      unit_id: 'inst-armor-1',
      sector_lat: 49.21,
      sector_lon: 11.81,
    })
    // Both movers' routes feed the map preview (2 each).
    expect(result.current.previewRoutes).toHaveLength(4)
    expect(result.current.metric).toBe('safe')
  })

  it('orderNow posts an immediate rendezvous with the selected metric', async () => {
    planRendezvous.mockResolvedValue({
      sector: { lat: 49.21, lon: 11.81, h3: '8abc' },
      truck_routes: [route('safe')],
      unit_routes: [route('safe')],
    })
    createRendezvous.mockResolvedValue({})
    const refetch = vi.fn()
    const { result } = renderHook(() => usePlanRendezvous(units, vi.fn(), refetch))

    act(() => result.current.start('inst-fuel-1', 'BOWSER'))
    act(() => result.current.pickUnit('inst-armor-1'))
    act(() => result.current.pickSector(49.21, 11.81))
    await waitFor(() => expect(result.current.phase).toBe('review'))

    act(() => result.current.orderNow())
    await waitFor(() => expect(createRendezvous).toHaveBeenCalledOnce())
    expect(createRendezvous).toHaveBeenCalledWith(
      expect.objectContaining({ truck_id: 'inst-fuel-1', unit_id: 'inst-armor-1', metric: 'safe' }),
    )
    await waitFor(() => expect(result.current.phase).toBe('idle')) // resets after success
    expect(refetch).toHaveBeenCalled()
  })

  it('schedule posts scheduled_game_s and ignores a zero delay', async () => {
    planRendezvous.mockResolvedValue({
      sector: { lat: 49.21, lon: 11.81, h3: '8abc' },
      truck_routes: [route('safe')],
      unit_routes: [route('safe')],
    })
    scheduleRendezvous.mockResolvedValue({})
    const { result } = renderHook(() => usePlanRendezvous(units, vi.fn(), vi.fn()))
    act(() => result.current.start('inst-fuel-1', 'BOWSER'))
    act(() => result.current.pickUnit('inst-armor-1'))
    act(() => result.current.pickSector(49.21, 11.81))
    await waitFor(() => expect(result.current.phase).toBe('review'))

    act(() => result.current.schedule(0))
    expect(scheduleRendezvous).not.toHaveBeenCalled()

    act(() => result.current.schedule(1800))
    await waitFor(() => expect(scheduleRendezvous).toHaveBeenCalledOnce())
    expect(scheduleRendezvous).toHaveBeenCalledWith(
      expect.objectContaining({ scheduled_game_s: 1800 }),
    )
  })
})
