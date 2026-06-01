import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { UnitInstance, UnitType } from '../api/types'
import { UnitOverview } from './UnitOverview'

const unitTypes = [
  {
    id: 'armor-tank-coy',
    name: 'Tank Company',
    nato_unit_type: 'armor',
    echelon: 'company',
    sidc: '',
    recon_level: 'low',
    fuel: { fuel_type: 'diesel', capacity_liters: 18000, consumption_normal_lph: 1, consumption_combat_lph: 1, consumption_idle_lph: 1 },
    endurance_hours_normal: null,
    endurance_hours_combat: null,
    description: null,
  },
] as unknown as UnitType[]

const units: UnitInstance[] = [
  { id: 'inst-armor-1', name: 'TIGER', unit_type_id: 'armor-tank-coy', lat: 49.2, lon: 11.8, h3_index: 'x', status: 'operational', current_fuel_liters: 15000 },
  { id: 'inst-recon-1', name: 'HAWK', unit_type_id: 'armor-tank-coy', lat: 49.2, lon: 11.8, h3_index: 'y', status: 'degraded', current_fuel_liters: null },
]

describe('UnitOverview', () => {
  it('lists units and flags the one with no telemetry', () => {
    render(<UnitOverview units={units} unitTypes={unitTypes} onSetTelemetry={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('TIGER')).toBeInTheDocument()
    const hawk = screen.getByTestId('unit-row-inst-recon-1')
    expect(within(hawk).getByText(/no data/i)).toBeInTheDocument()
    // The unit with telemetry shows no request button.
    expect(
      within(screen.getByTestId('unit-row-inst-armor-1')).queryByTestId('telemetry-request'),
    ).toBeNull()
  })

  it('submits a manual telemetry update for a no-data unit', () => {
    const onSetTelemetry = vi.fn()
    render(
      <UnitOverview units={units} unitTypes={unitTypes} onSetTelemetry={onSetTelemetry} onClose={vi.fn()} />,
    )
    const hawk = screen.getByTestId('unit-row-inst-recon-1')
    fireEvent.click(within(hawk).getByTestId('telemetry-request'))
    fireEvent.change(within(hawk).getByTestId('telemetry-input'), { target: { value: '2000' } })
    fireEvent.click(within(hawk).getByTestId('telemetry-submit'))
    expect(onSetTelemetry).toHaveBeenCalledWith('inst-recon-1', 2000)
  })
})
