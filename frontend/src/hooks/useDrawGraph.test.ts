import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useDrawGraph } from './useDrawGraph'

describe('useDrawGraph', () => {
  it('starts inactive with no points', () => {
    const { result } = renderHook(() => useDrawGraph())
    expect(result.current.mode).toBeNull()
    expect(result.current.points).toEqual([])
    expect(result.current.finished).toBeNull()
  })

  it('start enters a mode and addPoint appends waypoints in order', () => {
    const { result } = renderHook(() => useDrawGraph())
    act(() => result.current.start('road'))
    act(() => result.current.addPoint(49.2, 11.8))
    act(() => result.current.addPoint(49.21, 11.81))
    expect(result.current.mode).toBe('road')
    expect(result.current.points).toEqual([
      { lat: 49.2, lon: 11.8 },
      { lat: 49.21, lon: 11.81 },
    ])
  })

  it('ignores addPoint when no draw mode is active', () => {
    const { result } = renderHook(() => useDrawGraph())
    act(() => result.current.addPoint(49.2, 11.8))
    expect(result.current.points).toEqual([])
  })

  it('removeLast drops the most recent waypoint', () => {
    const { result } = renderHook(() => useDrawGraph())
    act(() => result.current.start('path'))
    act(() => result.current.addPoint(49.2, 11.8))
    act(() => result.current.addPoint(49.21, 11.81))
    act(() => result.current.removeLast())
    expect(result.current.points).toEqual([{ lat: 49.2, lon: 11.8 }])
  })

  it('switching kind resets the in-progress line', () => {
    const { result } = renderHook(() => useDrawGraph())
    act(() => result.current.start('road'))
    act(() => result.current.addPoint(49.2, 11.8))
    act(() => result.current.start('path'))
    expect(result.current.mode).toBe('path')
    expect(result.current.points).toEqual([])
  })

  it('stop with ≥2 points produces a finished line and clears the mode', () => {
    const { result } = renderHook(() => useDrawGraph())
    act(() => result.current.start('road'))
    act(() => result.current.addPoint(49.2, 11.8))
    act(() => result.current.addPoint(49.21, 11.81))
    act(() => result.current.stop())
    expect(result.current.mode).toBeNull()
    expect(result.current.points).toEqual([])
    expect(result.current.finished).toEqual({
      kind: 'road',
      points: [
        { lat: 49.2, lon: 11.8 },
        { lat: 49.21, lon: 11.81 },
      ],
    })
  })

  it('stop with fewer than 2 points discards the line (no finished)', () => {
    const { result } = renderHook(() => useDrawGraph())
    act(() => result.current.start('path'))
    act(() => result.current.addPoint(49.2, 11.8))
    act(() => result.current.stop())
    expect(result.current.mode).toBeNull()
    expect(result.current.finished).toBeNull()
  })

  it('cancel discards the line without finishing', () => {
    const { result } = renderHook(() => useDrawGraph())
    act(() => result.current.start('road'))
    act(() => result.current.addPoint(49.2, 11.8))
    act(() => result.current.addPoint(49.21, 11.81))
    act(() => result.current.cancel())
    expect(result.current.mode).toBeNull()
    expect(result.current.points).toEqual([])
    expect(result.current.finished).toBeNull()
  })

  it('clearFinished removes a finished line', () => {
    const { result } = renderHook(() => useDrawGraph())
    act(() => result.current.start('road'))
    act(() => result.current.addPoint(49.2, 11.8))
    act(() => result.current.addPoint(49.21, 11.81))
    act(() => result.current.stop())
    act(() => result.current.clearFinished())
    expect(result.current.finished).toBeNull()
  })
})
