import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MoveRefuelOption } from '../api/types'
import { useMoveRefuelStop } from './useMoveRefuelStop'

const moveRefuelOptions = vi.fn()
const moveWithRefuel = vi.fn()

vi.mock('../api/client', () => ({
  ApiError: class ApiError extends Error {
    status = 0
  },
  api: {
    moveRefuelOptions: (...a: unknown[]) => moveRefuelOptions(...a),
    moveWithRefuel: (...a: unknown[]) => moveWithRefuel(...a),
  },
}))

const opt = (truckId: string): MoveRefuelOption => ({
  truck_id: truckId,
  truck_name: truckId.toUpperCase(),
  sector_lat: 49.2,
  sector_lon: 11.8,
  sector_h3: '8abc',
  unit_geometry: [
    [11.8, 49.2],
    [11.81, 49.21],
  ],
  tanker_geometry: [
    [11.82, 49.22],
    [11.81, 49.21],
  ],
  unit_fuel_l: 30,
  tanker_fuel_l: 10,
  threat_max: 2,
})

describe('useMoveRefuelStop', () => {
  beforeEach(() => {
    moveRefuelOptions.mockReset().mockResolvedValue([opt('inst-fuel-1'), opt('inst-fuel-2')])
    moveWithRefuel.mockReset().mockResolvedValue({})
  })

  it('fetches options on start without dispatching, and previews the selected one', async () => {
    const { result } = renderHook(() => useMoveRefuelStop(vi.fn(), vi.fn(), vi.fn()))
    act(() => result.current.start('inst-armor-1', 49.3, 11.9, 'safe', 'road'))
    await waitFor(() => expect(result.current.options).toHaveLength(2))
    expect(result.current.active).toBe(true)
    expect(moveWithRefuel).not.toHaveBeenCalled() // preview only
    expect(result.current.previewRoutes).toHaveLength(2) // unit + tanker legs
    act(() => result.current.select(1))
    expect(result.current.current?.truck_id).toBe('inst-fuel-2')
  })

  it('confirm executes the chosen tanker and clears (onDone)', async () => {
    const refetch = vi.fn()
    const onDone = vi.fn()
    const { result } = renderHook(() => useMoveRefuelStop(vi.fn(), refetch, onDone))
    act(() => result.current.start('inst-armor-1', 49.3, 11.9, 'safe', 'road'))
    await waitFor(() => expect(result.current.options).toHaveLength(2))
    act(() => result.current.select(1))
    act(() => result.current.confirm())
    await waitFor(() => expect(moveWithRefuel).toHaveBeenCalledOnce())
    expect(moveWithRefuel).toHaveBeenCalledWith(expect.objectContaining({ truck_id: 'inst-fuel-2' }))
    await waitFor(() => expect(result.current.active).toBe(false)) // cleared
    expect(refetch).toHaveBeenCalled()
    expect(onDone).toHaveBeenCalled()
  })
})
