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

  it('routes tile_update frames into tileUpdates', () => {
    vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket)
    const { result } = renderHook(() => useSimSocket())
    const ws = FakeWebSocket.last
    const tile = JSON.stringify({
      type: 'tile_update',
      h3_index: '8811aa',
      terrain: 'forest',
      threat_level: 4,
      road_condition: 'damaged',
      intel_level: 'high',
      weather: 'clear',
      cover: 'none',
    })
    act(() => ws?.onmessage?.({ data: tile }))
    expect(result.current.tileUpdates['8811aa'].threat_level).toBe(4)
    expect(result.current.positions).toEqual({})
  })

  it('logs a chatter line for each tile_update, carrying its h3_index', () => {
    vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket)
    const { result } = renderHook(() => useSimSocket())
    const ws = FakeWebSocket.last
    const frame = (h3: string, threat: number): string =>
      JSON.stringify({
        type: 'tile_update',
        h3_index: h3,
        terrain: 'forest',
        threat_level: threat,
        road_condition: 'clear',
        intel_level: 'low',
        weather: 'clear',
        cover: 'none',
        situation: null,
        note: null,
      })
    act(() => ws?.onmessage?.({ data: frame('cell-hi', 4) }))
    expect(result.current.chatter).toHaveLength(1)
    expect(result.current.chatter[0].h3_index).toBe('cell-hi')
    expect(result.current.chatter[0].text).toContain('threat 4/5')
  })

  it('pushChatter adds an order line', () => {
    vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket)
    const { result } = renderHook(() => useSimSocket())
    act(() => result.current.pushChatter('Move order confirmed', 'order'))
    expect(result.current.chatter.at(-1)?.kind).toBe('order')
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
