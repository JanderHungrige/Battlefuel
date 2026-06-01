import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SupplyOverview } from '../api/types'
import { SupplyPanel } from './SupplyPanel'

const overview: SupplyOverview = {
  depots: [
    {
      depot: { id: 'depot-main', name: 'Main Supply Point', h3_index: 'x', lat: 49.2, lon: 11.8 },
      stocks: [
        { depot_id: 'depot-main', fuel_type: 'diesel', quantity_liters: 60000, capacity_liters: 80000 },
      ],
    },
  ],
  trucks: [
    {
      instance_id: 'inst-fuel-1',
      name: 'TANKER',
      unit_type_id: 'fuel-supply-pl',
      fuel_type: 'diesel',
      current_fuel_liters: 3800,
      capacity_liters: 4000,
      lat: 49.2,
      lon: 11.83,
      h3_index: 'y',
    },
  ],
  total_depot_liters_by_type: { diesel: 60000 },
  total_truck_liters: 3800,
}

const baseProps = {
  overview,
  depots: overview.depots.map((d) => d.depot),
  refuelTargets: [{ id: 'inst-armor-1', name: 'TIGER' }],
  recommendation: null,
  busy: false,
  message: null,
  onBuy: vi.fn(),
  onRefuel: vi.fn(),
  onConfirmRefuel: vi.fn(),
  onCancelRefuel: vi.fn(),
}

describe('SupplyPanel', () => {
  it('shows the distribution: depot, truck, and totals', () => {
    render(<SupplyPanel {...baseProps} />)
    expect(screen.getAllByText(/Main Supply Point/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/TANKER/).length).toBeGreaterThan(0)
    expect(screen.getByTestId('supply-panel')).toBeInTheDocument()
  })

  it('places a buy order with the chosen depot, fuel type, and quantity', () => {
    const onBuy = vi.fn()
    render(<SupplyPanel {...baseProps} onBuy={onBuy} />)
    fireEvent.change(screen.getByTestId('buy-quantity'), { target: { value: '5000' } })
    fireEvent.click(screen.getByTestId('buy-submit'))
    expect(onBuy).toHaveBeenCalledWith('depot-main', 'diesel', 5000)
  })

  it('requests a refuel for the chosen unit', () => {
    const onRefuel = vi.fn()
    render(<SupplyPanel {...baseProps} onRefuel={onRefuel} />)
    fireEvent.click(screen.getByTestId('refuel-submit'))
    expect(onRefuel).toHaveBeenCalledWith('inst-armor-1')
  })

  it('shows the recommendation and confirms it', () => {
    const onConfirmRefuel = vi.fn()
    render(
      <SupplyPanel
        {...baseProps}
        recommendation={{
          order: {
            id: 'r1',
            unit_id: 'inst-armor-1',
            truck_id: 'inst-fuel-1',
            fuel_type: 'diesel',
            status: 'pending',
            rendezvous_lat: 49.2,
            rendezvous_lon: 11.83,
            rendezvous_h3: 'y',
            requested_liters: null,
            transferred_liters: 0,
          },
          truckName: 'TANKER',
        }}
        onConfirmRefuel={onConfirmRefuel}
      />,
    )
    const rec = screen.getByTestId('refuel-recommendation')
    expect(within(rec).getByText(/TANKER/)).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('refuel-confirm'))
    expect(onConfirmRefuel).toHaveBeenCalled()
  })
})
