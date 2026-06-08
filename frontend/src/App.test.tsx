import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Theater } from './api/types'

// Stub the WebGL map (jsdom has no canvas/WebGL) and the API client.
vi.mock('./map/MapView', () => ({
  MapView: ({ theater }: { theater: Theater }) => (
    <div data-testid="map">{theater.name}</div>
  ),
}))

// Stub the landing gate to a single Enter button so shell tests can step past it deterministically
// (the real landing's faux clearance timer + visuals are covered in LandingPage.test).
vi.mock('./components/LandingPage', () => ({
  LandingPage: ({ onEnter }: { onEnter: () => void }) => (
    <button data-testid="enter-app" onClick={onEnter}>
      enter
    </button>
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

afterEach(() => {
  vi.clearAllMocks()
})

// Render App and step past the landing gate into the app shell.
async function renderEntered(): Promise<void> {
  const { default: App } = await import('./App')
  render(<App />)
  fireEvent.click(screen.getByTestId('enter-app'))
}

describe('App shell', () => {
  it('gates the app behind the landing until Enter', async () => {
    getTheater.mockResolvedValue(HOHENFELS)
    const { default: App } = await import('./App')
    render(<App />)
    // Before entering: the landing is shown, the map is not.
    expect(screen.getByTestId('enter-app')).toBeInTheDocument()
    expect(screen.queryByTestId('map')).not.toBeInTheDocument()
  })

  it('always shows the brand and OSM attribution', async () => {
    getTheater.mockResolvedValue(HOHENFELS)
    await renderEntered()
    expect(screen.getByText('BattleFuel')).toBeInTheDocument()
    expect(screen.getByText(/OpenStreetMap contributors/)).toBeInTheDocument()
  })

  it('renders the map with the theater once loaded', async () => {
    getTheater.mockResolvedValue(HOHENFELS)
    await renderEntered()
    expect(await screen.findByTestId('map')).toHaveTextContent('Hohenfels Training Area')
  })

  it('shows an error when the theater fails to load', async () => {
    getTheater.mockRejectedValue(new Error('network down'))
    await renderEntered()
    expect(await screen.findByText(/Failed to load/)).toBeInTheDocument()
  })
})
