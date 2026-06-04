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

  it('planRoute POSTs the request body and returns options', async () => {
    const options = [{ metric: 'fast' }, { metric: 'safe' }]
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => options })
    vi.stubGlobal('fetch', fetchMock)

    const result = await api.planRoute({ instance_id: 'inst-1', dest_lat: 49.2, dest_lon: 11.8 })

    expect(result).toHaveLength(2)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/routes\/plan$/)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ instance_id: 'inst-1', dest_lat: 49.2, dest_lon: 11.8 })
  })

  it('createMoveOrder POSTs the chosen metric', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: 'o1', status: 'pending' }) })
    vi.stubGlobal('fetch', fetchMock)

    const order = await api.createMoveOrder({
      instance_id: 'inst-1',
      dest_lat: 49.2,
      dest_lon: 11.8,
      metric: 'safe',
    })

    expect(order.id).toBe('o1')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).metric).toBe('safe')
  })

  it('planRoute forwards the travel mode (v2 Wave 10 F4)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] })
    vi.stubGlobal('fetch', fetchMock)

    await api.planRoute({ instance_id: 'inst-1', dest_lat: 49.2, dest_lon: 11.8, mode: 'hybrid' })

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).mode).toBe('hybrid')
  })

  it('proceedMoveOrder POSTs to the proceed path with no body (v2 Wave 10 F4)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 'o1', status: 'crossing' }) })
    vi.stubGlobal('fetch', fetchMock)

    const order = await api.proceedMoveOrder('o1')

    expect(order.status).toBe('crossing')
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/move-orders\/o1\/proceed$/)
    expect(init.method).toBe('POST')
    expect(init.body).toBeUndefined()
  })

  it('confirmMoveOrder POSTs to the confirm path with no body', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 'o1', status: 'active' }) })
    vi.stubGlobal('fetch', fetchMock)

    const order = await api.confirmMoveOrder('o1')

    expect(order.status).toBe('active')
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/move-orders\/o1\/confirm$/)
    expect(init.method).toBe('POST')
    expect(init.body).toBeUndefined()
  })

  it('throws ApiError when the planner reports no route', async () => {
    mockFetch(422, { detail: 'unroutable' })
    await expect(
      api.planRoute({ instance_id: 'inst-1', dest_lat: 0, dest_lon: 0 }),
    ).rejects.toBeInstanceOf(ApiError)
  })

  it('createObstacle POSTs lat/lon to /obstacles', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: 'ob1' }) })
    vi.stubGlobal('fetch', fetchMock)
    const o = await api.createObstacle(49.2, 11.85)
    expect(o.id).toBe('ob1')
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/obstacles$/)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ lat: 49.2, lon: 11.85, kind: 'manual' })
  })

  it('deleteObstacle DELETEs /obstacles/{id}', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 'ob1', status: 'removed' }) })
    vi.stubGlobal('fetch', fetchMock)
    const r = await api.deleteObstacle('ob1')
    expect(r.status).toBe('removed')
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/obstacles\/ob1$/)
    expect(init.method).toBe('DELETE')
  })

  it('patchTile PATCHes the mutation to /tiles/{h3}', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ h3_index: 'abc' }) })
    vi.stubGlobal('fetch', fetchMock)
    await api.patchTile('abc', { threat_level: 5 })
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/tiles\/abc$/)
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body).threat_level).toBe(5)
  })
})
