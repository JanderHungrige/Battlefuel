import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { RouteOption } from '../api/types'
import { MoveRoutesPanel } from './MoveRoutesPanel'

const fastest: RouteOption = {
  label: 'fastest',
  metric: 'fast',
  geometry: [
    [11.84, 49.22],
    [11.86, 49.24],
  ],
  distance_m: 12000,
  duration_s: 1800,
  threat_max: 2,
  threat_avg: 1.2,
  fuel_consumed_l: 400,
  fuel_remaining_l: 1600,
  sufficient_fuel: true,
}

const safest: RouteOption = {
  ...fastest,
  label: 'safest',
  metric: 'safe',
  distance_m: 15000,
  fuel_consumed_l: 2500,
  fuel_remaining_l: 0,
  sufficient_fuel: false,
}

function setup(overrides: Partial<Parameters<typeof MoveRoutesPanel>[0]> = {}) {
  const props = {
    unitName: 'TIGER',
    loading: false,
    error: null as string | null,
    options: [fastest, safest],
    selectedMetric: 'fast' as const,
    confirming: false,
    onSelectOption: vi.fn(),
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  }
  render(<MoveRoutesPanel {...props} />)
  return props
}

describe('MoveRoutesPanel', () => {
  it('renders both options with distance, duration and fuel', () => {
    setup()
    const fast = screen.getByTestId('route-option-fast')
    expect(fast).toHaveTextContent('fastest')
    expect(fast).toHaveTextContent('12.0 km')
    expect(fast).toHaveTextContent('30 min')
    expect(fast).toHaveTextContent('fuel 400 L')
    expect(screen.getByTestId('route-option-safe')).toHaveTextContent('safest')
  })

  it('flags an option without sufficient fuel', () => {
    setup()
    expect(screen.getByTestId('route-low-fuel-safe')).toBeInTheDocument()
    expect(screen.queryByTestId('route-low-fuel-fast')).not.toBeInTheDocument()
  })

  it('warns when a route crosses a high-threat sector', () => {
    setup({
      options: [
        { ...fastest, threat_max: 4 },
        { ...safest, threat_max: 1 },
      ],
    })
    expect(screen.getByTestId('route-threat-fast')).toHaveTextContent('threat sector')
    expect(screen.queryByTestId('route-threat-safe')).not.toBeInTheDocument()
  })

  it('marks the selected option as pressed and selects another on click', () => {
    const props = setup()
    expect(screen.getByTestId('route-option-fast')).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByTestId('route-option-safe'))
    expect(props.onSelectOption).toHaveBeenCalledWith('safe')
  })

  it('confirms the move and disables the button while confirming', () => {
    const props = setup()
    fireEvent.click(screen.getByTestId('confirm-move'))
    expect(props.onConfirm).toHaveBeenCalledTimes(1)

    setup({ confirming: true })
    expect(screen.getAllByTestId('confirm-move')[1]).toBeDisabled()
  })

  it('disables confirm when no option is selected', () => {
    setup({ selectedMetric: null })
    expect(screen.getByTestId('confirm-move')).toBeDisabled()
  })

  it('shows the planning error and a hint when there are no options', () => {
    setup({ error: 'No route to that destination.', options: [] })
    expect(screen.getByTestId('move-error')).toHaveTextContent('No route to that destination.')
  })

  it('prompts to click a destination when idle with no options', () => {
    setup({ options: [], selectedMetric: null })
    expect(screen.getByText('Click a destination on the map.')).toBeInTheDocument()
  })
})

describe('MoveRoutesPanel — add refuel stop (v2 W13 F6)', () => {
  it('fires onAddRefuelStop when the button is clicked', () => {
    const onAddRefuelStop = vi.fn()
    setup({ onAddRefuelStop })
    fireEvent.click(screen.getByTestId('add-refuel-stop'))
    expect(onAddRefuelStop).toHaveBeenCalledOnce()
  })

  it('hides the refuel-stop button when no handler is given', () => {
    setup()
    expect(screen.queryByTestId('add-refuel-stop')).toBeNull()
  })

  it('disables the refuel-stop button when no metric is selected', () => {
    setup({ onAddRefuelStop: vi.fn(), selectedMetric: null })
    expect(screen.getByTestId('add-refuel-stop')).toBeDisabled()
  })
})

import type { MoveRefuelOption } from '../api/types'

const refuelOpt: MoveRefuelOption = {
  truck_id: 'inst-fuel-1',
  truck_name: 'BOWSER',
  sector_lat: 49.2,
  sector_lon: 11.8,
  sector_h3: '8abc',
  unit_geometry: [[11.8, 49.2], [11.81, 49.21]],
  tanker_geometry: [[11.82, 49.22], [11.81, 49.21]],
  unit_fuel_l: 30,
  tanker_fuel_l: 10,
  threat_max: 2,
}

describe('MoveRoutesPanel — refuel-stop picker (v2 W13)', () => {
  it('shows the tanker option and confirms the chosen one', () => {
    const onRefuelConfirm = vi.fn()
    setup({ refuelActive: true, refuelOptions: [refuelOpt], onRefuelConfirm })
    expect(screen.getByTestId('refuel-truck-name')).toHaveTextContent('BOWSER')
    fireEvent.click(screen.getByTestId('refuel-confirm'))
    expect(onRefuelConfirm).toHaveBeenCalledOnce()
  })

  it('hides the add/plan buttons while the picker is active', () => {
    setup({ refuelActive: true, refuelOptions: [refuelOpt], onAddRefuelStop: vi.fn() })
    expect(screen.queryByTestId('add-refuel-stop')).toBeNull()
    expect(screen.getByTestId('refuel-picker')).toBeInTheDocument()
  })
})
