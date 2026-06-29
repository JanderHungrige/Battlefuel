import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DrawnEdge } from '../api/types'
import { useDrawnEdges } from './useDrawnEdges'

const listDrawnEdges = vi.fn()

vi.mock('../api/client', () => ({
  api: { listDrawnEdges: (...a: unknown[]) => listDrawnEdges(...a) },
}))

const edge = (id: string): DrawnEdge => ({
  id,
  kind: 'road',
  coordinates: [
    [11.8, 49.2],
    [11.81, 49.21],
  ],
  connect_start: true,
  connect_end: false,
})

describe('useDrawnEdges', () => {
  beforeEach(() => {
    listDrawnEdges.mockReset()
    listDrawnEdges.mockResolvedValue([edge('a')])
  })

  it('returns null and does not fetch while disabled', () => {
    const { result } = renderHook(() => useDrawnEdges(false))
    expect(result.current).toBeNull()
    expect(listDrawnEdges).not.toHaveBeenCalled()
  })

  it('fetches and returns the drawn edges when enabled', async () => {
    const { result } = renderHook(() => useDrawnEdges(true))
    await waitFor(() => expect(result.current).not.toBeNull())
    expect(result.current).toEqual([edge('a')])
    expect(listDrawnEdges).toHaveBeenCalledTimes(1)
  })

  it('refetches when the reload token changes', async () => {
    const { result, rerender } = renderHook(
      ({ token }: { token: number }) => useDrawnEdges(true, token),
      { initialProps: { token: 0 } },
    )
    await waitFor(() => expect(result.current).not.toBeNull())
    listDrawnEdges.mockResolvedValue([edge('a'), edge('b')])
    rerender({ token: 1 })
    await waitFor(() => expect(result.current).toHaveLength(2))
    expect(listDrawnEdges).toHaveBeenCalledTimes(2)
  })
})
