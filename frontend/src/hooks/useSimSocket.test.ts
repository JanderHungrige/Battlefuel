import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSimSocket } from './useSimSocket'

class FakeWebSocket {
  static last: FakeWebSocket | null = null
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  readonly url: string
  closed = false

  constructor(url: string) {
    this.url = url
    FakeWebSocket.last = this
  }

  close(): void {
    this.closed = true
  }
}

function activeFrame(instance_id: string, lon: number): string {
  return JSON.stringify({
    type: 'unit_update',
    instance_id,
    order_id: 'o1',
    lat: 1,
    lon,
    fuel_l: 10,
    status: 'active',
    progress_m: 0,
    distance_m: 100,
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  FakeWebSocket.last = null
})

describe('useSimSocket', () => {
  it('connects to the /ws endpoint and accumulates frames', () => {
    vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket)
    const { result } = renderHook(() => useSimSocket())
    const ws = FakeWebSocket.last
    expect(ws?.url).toMatch(/\/ws$/)

    act(() => ws?.onopen?.())
    expect(result.current.connected).toBe(true)

    act(() => ws?.onmessage?.({ data: activeFrame('inst-1', 2) }))
    expect(result.current.positions['inst-1'].lon).toBe(2)

    act(() => ws?.onmessage?.({ data: activeFrame('inst-1', 5) }))
    expect(result.current.positions['inst-1'].lon).toBe(5)
  })

  it('does not open a socket when disabled', () => {
    vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket)
    renderHook(() => useSimSocket(false))
    expect(FakeWebSocket.last).toBeNull()
  })

  it('reconnects after an unexpected close', () => {
    vi.useFakeTimers()
    vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket)
    renderHook(() => useSimSocket())
    const first = FakeWebSocket.last

    act(() => first?.onclose?.())
    act(() => vi.advanceTimersByTime(2000))

    expect(FakeWebSocket.last).not.toBe(first)
    expect(FakeWebSocket.last).not.toBeNull()
  })
})
