import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RendezvousOrder } from '../api/types'
import { useRendezvousArchive } from './useRendezvousArchive'

const listRendezvous = vi.fn()
const confirmLaunchRendezvous = vi.fn()
const cancelRendezvous = vi.fn()

vi.mock('../api/client', () => ({
  ApiError: class ApiError extends Error {
    status = 0
  },
  api: {
    listRendezvous: () => listRendezvous(),
    confirmLaunchRendezvous: (id: string) => confirmLaunchRendezvous(id),
    cancelRendezvous: (id: string) => cancelRendezvous(id),
  },
}))

const order: RendezvousOrder = {
  id: 'rdv-1',
  truck_id: 'inst-fuel-1',
  unit_id: 'inst-armor-1',
  sector_lat: 49.2,
  sector_lon: 11.8,
  sector_h3: '8abc',
  metric: 'safe',
  mode: 'road',
  scheduled_game_s: 600,
  remaining_game_s: 600,
  truck_geometry: [
    [11.8, 49.2],
    [11.81, 49.21],
  ],
  unit_geometry: [
    [11.82, 49.22],
    [11.81, 49.21],
  ],
  truck_fuel_to_meet: 40,
  unit_fuel_to_meet: 25,
  status: 'planned',
}

describe('useRendezvousArchive', () => {
  beforeEach(() => {
    listRendezvous.mockReset().mockResolvedValue([order])
    confirmLaunchRendezvous.mockReset().mockResolvedValue({ rendezvous_order: order })
    cancelRendezvous.mockReset().mockResolvedValue({ ...order, status: 'cancelled' })
  })

  it('fetches when enabled and exposes the orders', async () => {
    const { result } = renderHook(() => useRendezvousArchive(true, 0, vi.fn()))
    await waitFor(() => expect(result.current.orders).toHaveLength(1))
    expect(listRendezvous).toHaveBeenCalled()
  })

  it('does not fetch when disabled', () => {
    renderHook(() => useRendezvousArchive(false, 0, vi.fn()))
    expect(listRendezvous).not.toHaveBeenCalled()
  })

  it('selecting an order yields both routes (drawn bold) for the map preview', async () => {
    const { result } = renderHook(() => useRendezvousArchive(true, 0, vi.fn()))
    await waitFor(() => expect(result.current.orders).toHaveLength(1))
    act(() => result.current.select(order))
    expect(result.current.selectedId).toBe('rdv-1')
    expect(result.current.previewRoutes).toHaveLength(2) // truck + unit legs
    expect(result.current.previewMetric).toBe('safe')
    act(() => result.current.clearSelection())
    expect(result.current.previewRoutes).toHaveLength(0)
  })

  it('confirmLaunch calls the endpoint and refetches', async () => {
    const { result } = renderHook(() => useRendezvousArchive(true, 0, vi.fn()))
    await waitFor(() => expect(result.current.orders).toHaveLength(1))
    act(() => result.current.confirmLaunch('rdv-1'))
    await waitFor(() => expect(confirmLaunchRendezvous).toHaveBeenCalledWith('rdv-1'))
    await waitFor(() => expect(listRendezvous).toHaveBeenCalledTimes(2)) // initial + post-launch
  })

  it('cancel clears the selection of the cancelled order', async () => {
    const { result } = renderHook(() => useRendezvousArchive(true, 0, vi.fn()))
    await waitFor(() => expect(result.current.orders).toHaveLength(1))
    act(() => result.current.select(order))
    act(() => result.current.cancel('rdv-1'))
    await waitFor(() => expect(cancelRendezvous).toHaveBeenCalledWith('rdv-1'))
    await waitFor(() => expect(result.current.selectedId).toBeNull())
  })
})
