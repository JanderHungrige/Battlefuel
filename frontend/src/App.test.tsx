import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Theater } from './api/types'
import { ENTRY_KEY } from './lib/entryGate'

// Stub the WebGL map (jsdom has no canvas/WebGL) and the API client.
vi.mock('./map/MapView', () => ({
  MapView: ({ theater }: { theater: Theater }) => (
    <div data-testid="map">{theater.name}</div>
  ),
}))

const getTheater = vi.fn()
vi.mock('./api/client', () => ({
  ApiError: class ApiError extends Error {},
  api: {
    getTheater: () => getTheater(),
    getTiles: () => Promise.resolve([]),
    getUnitInstances: () => Promise.resolve([]),
    getUnitTypes: () => Promise.resolve([]),
    getEnemyUnits: () => Promise.resolve([]),
    listObstacles: () => Promise.resolve([]),
  },
}))

// The live sim socket is exercised in its own tests; keep the shell test deterministic.
vi.mock('./hooks/useSimSocket', () => ({
  useSimSocket: () => ({
    positions: {},
    tileUpdates: {},
    combatEvents: {},
    chatter: [],
    pushChatter: () => {},
    connected: false,
  }),
}))

const HOHENFELS: Theater = {
  id: 'hohenfels',
  name: 'Hohenfels Training Area',
  bbox: { west: 11.78, south: 49.18, east: 11.92, north: 49.27 },
  center_lon: 11.85,
  center_lat: 49.225,
  default_zoom: 12,
}

beforeEach(() => {
  // Skip the v2 W15 landing gate so the shell tests render the app directly.
  sessionStorage.setItem(ENTRY_KEY, '1')
})

afterEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
})

describe('App shell', () => {
  it('always shows the brand and OSM attribution', async () => {
    getTheater.mockResolvedValue(HOHENFELS)
    const { default: App } = await import('./App')
    render(<App />)
    expect(screen.getByText('BattleFuel')).toBeInTheDocument()
    expect(screen.getByText(/OpenStreetMap contributors/)).toBeInTheDocument()
  })

  it('renders the map with the theater once loaded', async () => {
    getTheater.mockResolvedValue(HOHENFELS)
    const { default: App } = await import('./App')
    render(<App />)
    expect(await screen.findByTestId('map')).toHaveTextContent('Hohenfels Training Area')
  })

  it('shows the landing gate before entering, not the map', async () => {
    sessionStorage.clear() // not entered → landing should gate the app
    getTheater.mockResolvedValue(HOHENFELS)
    const { default: App } = await import('./App')
    render(<App />)
    expect(screen.getByTestId('landing')).toBeInTheDocument()
    expect(screen.queryByTestId('map')).not.toBeInTheDocument()
  })

  it('shows an error when the theater fails to load', async () => {
    getTheater.mockRejectedValue(new Error('network down'))
    const { default: App } = await import('./App')
    render(<App />)
    expect(await screen.findByText(/Failed to load/)).toBeInTheDocument()
  })
})
