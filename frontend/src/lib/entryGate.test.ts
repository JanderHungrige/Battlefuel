import { describe, expect, it, vi } from 'vitest'
import { ENTRY_KEY, hasEntered, markEntered } from './entryGate'

function fakeStorage(): Storage {
  const m = new Map<string, string>()
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
    get length() {
      return m.size
    },
  } as Storage
}

describe('entryGate', () => {
  it('reports not-entered on a fresh storage', () => {
    expect(hasEntered(fakeStorage())).toBe(false)
  })

  it('reports entered after markEntered', () => {
    const s = fakeStorage()
    markEntered(s)
    expect(hasEntered(s)).toBe(true)
    expect(s.getItem(ENTRY_KEY)).toBe('1')
  })

  it('degrades to not-entered when storage throws', () => {
    const throwing = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    } as unknown as Storage
    expect(hasEntered(throwing)).toBe(false)
    expect(() => markEntered(throwing)).not.toThrow() // never crashes the app
  })

  it('only treats the exact "1" marker as entered', () => {
    const s = fakeStorage()
    s.setItem(ENTRY_KEY, 'yes')
    expect(hasEntered(s)).toBe(false)
  })

  it('does not write until markEntered is called', () => {
    const s = fakeStorage()
    const spy = vi.spyOn(s, 'setItem')
    hasEntered(s)
    expect(spy).not.toHaveBeenCalled()
  })
})
