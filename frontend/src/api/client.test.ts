import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, api } from './client'

afterEach(() => {
  vi.restoreAllMocks()
})

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }),
  )
}

describe('api client', () => {
  it('parses a successful theater response', async () => {
    const theater = { id: 'hohenfels', name: 'Hohenfels', center_lon: 11.85, center_lat: 49.22 }
    mockFetch(200, theater)
    const result = await api.getTheater()
    expect(result.name).toBe('Hohenfels')
  })

  it('returns an array for tiles', async () => {
    mockFetch(200, [{ h3_index: 'abc' }])
    const tiles = await api.getTiles()
    expect(Array.isArray(tiles)).toBe(true)
  })

  it('throws ApiError on a non-2xx response', async () => {
    mockFetch(500, { detail: 'boom' })
    await expect(api.getUnitInstances()).rejects.toBeInstanceOf(ApiError)
  })
})
