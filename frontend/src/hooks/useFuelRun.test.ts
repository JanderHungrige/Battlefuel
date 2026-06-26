import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { InstanceStatus, RouteMetric, RouteOption, UnitInstance } from '../api/types'
import { useFuelRun } from './useFuelRun'

const planRoute = vi.fn()
const createFuelRun = vi.fn()

vi.mock('../api/client', () => ({
  ApiError: class ApiError extends Error {
    status = 0
  },
  api: {
    planRoute: (...a: unknown[]) => planRoute(...a),
    createFuelRun: (...a: unknown[]) => createFuelRun(...a),
  },
}))

const unit = (id: string, lat: number, lon: number): UnitInstance => ({
  id,
  name: id.toUpperCase(),
  unit_type_id: 'leopard',
  lat,
  lon,
  h3_index: '8abc',
  status: 'active' as InstanceStatus,
  current_fuel_liters: 100,
})

const route = (metric: RouteMetric): RouteOption => ({
  label: metric === 'safe' ? 'safest' : 'fastest',
  metric,
  geometry: [
    [11.8, 49.2],
    [11.81, 49.21],
  ],
  distance_m: 1000,
  duration_s: 600,
  threat_max: 1,
  threat_avg: 0.5,
  fuel_consumed_l: 20,
  fuel_remaining_l: 80,
  sufficient_fuel: true,
})

// Drive a truck-first run up to the review phase (truck → target unit, routes planned).
async function toReview(refetch = vi.fn()) {
  const units = [unit('inst-armor-1', 49.3, 11.9)]
  const hook = renderHook(() =>
    useFuelRun(units, [], null, {}, vi.fn(), refetch),
  )
  act(() => hook.result.current.startTruckFirst('inst-fuel-1', 'TANKER 1'))
  act(() => hook.result.current.pickTarget('inst-armor-1'))
  await waitFor(() => expect(hook.result.current.phase).toBe('review'))
  return hook
}

describe('useFuelRun', () => {
  beforeEach(() => {
    planRoute.mockReset().mockResolvedValue([route('safe'), route('fast')])
    createFuelRun.mockReset().mockResolvedValue({})
  })

  it('confirm dispatches the run and fires onDone on success (deselect the mover) — v2 W17 F2', async () => {
    const refetch = vi.fn()
    const onDone = vi.fn()
    const { result } = await toReview(refetch)

    act(() => result.current.confirm(onDone))

    await waitFor(() => expect(createFuelRun).toHaveBeenCalledOnce())
    expect(createFuelRun).toHaveBeenCalledWith(
      expect.objectContaining({ mover_id: 'inst-fuel-1', unit_id: 'inst-armor-1', metric: 'safe' }),
    )
    await waitFor(() => expect(result.current.phase).toBe('idle')) // reset after success
    expect(refetch).toHaveBeenCalled()
    expect(onDone).toHaveBeenCalledOnce()
  })

  it('does NOT fire onDone when the dispatch fails (selection stays so the operator can retry)', async () => {
    createFuelRun.mockRejectedValueOnce(new Error('boom'))
    const onDone = vi.fn()
    const { result } = await toReview()

    act(() => result.current.confirm(onDone))

    await waitFor(() => expect(result.current.message).toMatch(/Fuel run failed/))
    expect(onDone).not.toHaveBeenCalled()
    expect(result.current.phase).toBe('review') // not reset
  })

  it('does nothing (no dispatch, no onDone) when confirmed before a route is planned', () => {
    const onDone = vi.fn()
    const { result } = renderHook(() => useFuelRun([], [], null, {}, vi.fn(), vi.fn()))

    act(() => result.current.confirm(onDone))

    expect(createFuelRun).not.toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
  })
})
