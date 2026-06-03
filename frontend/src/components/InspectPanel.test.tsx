import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { UnitInstance, UnitType } from '../api/types'
import { InspectPanel, type InspectCell } from './InspectPanel'

const cell: InspectCell = {
  mgrs: '32U QV 12345 67890',
  situation: {
    count: 3,
    maxThreat: 3,
    worstRoad: 'damaged',
    maxIntel: 'low',
    dominantTerrain: 'forest',
    terrainMix: { forest: 2, urban: 1 },
  },
  h3Indexes: ['8811aa', '8811ab'],
  units: [{ id: 'inst-1', name: 'TIGER' }],
}

const unitType: UnitType = {
  id: 'armor-tank-coy',
  name: 'Tank Company',
  nato_unit_type: 'armor',
  echelon: 'company',
  sidc: '10031000151205000000',
  recon_level: 'low',
  fuel: {
    fuel_type: 'diesel',
    capacity_liters: 18000,
    consumption_normal_lph: 900,
    consumption_combat_lph: 1600,
    consumption_idle_lph: 120,
  },
  endurance_hours_normal: 20,
  endurance_hours_combat: 11.25,
  description: null,
}

function unit(overrides: Partial<UnitInstance> = {}): UnitInstance {
  return {
    id: 'inst-1',
    name: 'TIGER',
    unit_type_id: 'armor-tank-coy',
    lat: 49.23,
    lon: 11.86,
    h3_index: '8811bb',
    status: 'operational',
    current_fuel_liters: 15000,
    ...overrides,
  }
}

describe('InspectPanel', () => {
  it('renders nothing when no selection', () => {
    const { container } = render(<InspectPanel onClose={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the MGRS cell coordinate + aggregated situation (no hex/H3)', () => {
    render(<InspectPanel cell={cell} onClose={() => {}} />)
    expect(screen.getByText('MGRS Cell')).toBeInTheDocument()
    expect(screen.getByText('32U QV 12345 67890')).toBeInTheDocument()
    expect(screen.getByText('3 / 5')).toBeInTheDocument()
    expect(screen.getByText('forest')).toBeInTheDocument()
    expect(screen.getByText('TIGER')).toBeInTheDocument() // units in cell
    expect(screen.queryByText(/H3/)).not.toBeInTheDocument() // no hex vocabulary
  })

  it('shows unit fuel and type when telemetry present', () => {
    render(<InspectPanel unit={unit()} unitType={unitType} onClose={() => {}} />)
    expect(screen.getByText('TIGER')).toBeInTheDocument()
    expect(screen.getByText('Tank Company')).toBeInTheDocument()
    expect(screen.getByText('15,000 L')).toBeInTheDocument()
  })

  it('shows the no-telemetry affordance when fuel is null', () => {
    render(
      <InspectPanel
        unit={unit({ current_fuel_liters: null })}
        unitType={unitType}
        onClose={() => {}}
      />,
    )
    expect(screen.getByTestId('no-telemetry')).toBeInTheDocument()
    expect(screen.getByText('Request manual update')).toBeInTheDocument()
  })

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn()
    render(<InspectPanel cell={cell} onClose={onClose} />)
    screen.getByLabelText('Close').click()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('shows the live fuel and progress section while a unit is moving', () => {
    render(
      <InspectPanel
        unit={unit()}
        unitType={unitType}
        live={{ fuel_l: 12345, progress_m: 1500, distance_m: 8000, status: 'active' }}
        onClose={() => {}}
      />,
    )
    const live = screen.getByTestId('inspect-live')
    expect(live).toHaveTextContent('12,345 L')
    expect(live).toHaveTextContent('1,500 / 8,000 m')
    expect(live).toHaveTextContent('active')
  })

  it('omits the live section when no live update is present', () => {
    render(<InspectPanel unit={unit()} unitType={unitType} onClose={() => {}} />)
    expect(screen.queryByTestId('inspect-live')).not.toBeInTheDocument()
  })

  it('shows cell-edit controls and emits a cell-wide threat mutation on click', () => {
    const onMutateCell = vi.fn()
    render(<InspectPanel cell={cell} onMutateCell={onMutateCell} onClose={() => {}} />)
    expect(screen.getByTestId('tile-edit')).toBeInTheDocument()
    screen.getByTestId('set-threat-4').click()
    expect(onMutateCell).toHaveBeenCalledWith(['8811aa', '8811ab'], { threat_level: 4 })
  })

  it('omits cell-edit controls when onMutateCell is not provided', () => {
    render(<InspectPanel cell={cell} onClose={() => {}} />)
    expect(screen.queryByTestId('tile-edit')).not.toBeInTheDocument()
  })
})
