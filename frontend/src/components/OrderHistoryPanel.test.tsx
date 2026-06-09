import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { BuyOrder } from '../api/types'
import { OrderHistoryPanel } from './OrderHistoryPanel'

function order(overrides: Partial<BuyOrder>): BuyOrder {
  return {
    id: 'o1',
    depot_id: 'depot-main',
    fuel_type: 'diesel',
    quantity_liters: 5000,
    status: 'active',
    lead_time_game_s: 600,
    remaining_game_s: 600,
    nato_stage: 'on_route',
    stage_remaining_game_s: 30,
    destination_name: 'Main Supply Point',
    platform_id: 'platform-world-fuel-dfms',
    inform_jlsg: true,
    inform_jtf: false,
    ...overrides,
  }
}

describe('OrderHistoryPanel', () => {
  it('shows the empty state when there are no orders', () => {
    render(<OrderHistoryPanel orders={[]} onClose={vi.fn()} />)
    expect(screen.getByTestId('order-history-empty')).toHaveTextContent('No fuel orders yet')
  })

  it('renders an order with its current NATO stage label and a 7-step track', () => {
    render(<OrderHistoryPanel orders={[order({})]} onClose={vi.fn()} />)
    const row = screen.getByTestId('order-history-row')
    expect(within(row).getByTestId('order-history-stage')).toHaveTextContent('Fuel on route')
    expect(within(row).getByText(/Main Supply Point/)).toBeInTheDocument()
    expect(within(row).getByText(/inform: JLSG/)).toBeInTheDocument()
    // Seven NATO stages rendered as a progress track.
    expect(within(row).getByTestId('order-stages').querySelectorAll('li')).toHaveLength(7)
  })

  it('shows newest order first', () => {
    render(
      <OrderHistoryPanel
        orders={[
          order({ id: 'old', destination_name: 'OLD' }),
          order({ id: 'new', destination_name: 'NEW' }),
        ]}
        onClose={vi.fn()}
      />,
    )
    const rows = screen.getAllByTestId('order-history-row')
    expect(within(rows[0]).getByText(/NEW/)).toBeInTheDocument()
    expect(within(rows[1]).getByText(/OLD/)).toBeInTheDocument()
  })

  it('labels a cancelled order as Cancelled', () => {
    render(<OrderHistoryPanel orders={[order({ status: 'cancelled' })]} onClose={vi.fn()} />)
    expect(screen.getByTestId('order-history-stage')).toHaveTextContent('Cancelled')
  })
})

import { fireEvent } from '@testing-library/react'
import type { RendezvousOrder } from '../api/types'

function rdv(overrides: Partial<RendezvousOrder>): RendezvousOrder {
  return {
    id: 'rdv-1',
    truck_id: 'inst-fuel-1',
    unit_id: 'inst-armor-1',
    sector_lat: 49.2,
    sector_lon: 11.8,
    sector_h3: '8abc',
    metric: 'safe',
    mode: 'road',
    scheduled_game_s: 600,
    remaining_game_s: 600,
    truck_geometry: [
      [11.8, 49.2],
      [11.81, 49.21],
    ],
    unit_geometry: [
      [11.82, 49.22],
      [11.81, 49.21],
    ],
    truck_fuel_to_meet: 40,
    unit_fuel_to_meet: 25,
    status: 'planned',
    ...overrides,
  }
}

describe('OrderHistoryPanel — rendezvous section (v2 W13 F4)', () => {
  it('hides the section when no rendezvousOrders prop is given', () => {
    render(<OrderHistoryPanel orders={[]} onClose={vi.fn()} />)
    expect(screen.queryByTestId('order-history-rendezvous')).toBeNull()
  })

  it('lists rendezvous runs with status + countdown and fires select on click', () => {
    const onSelect = vi.fn()
    render(
      <OrderHistoryPanel
        orders={[]}
        onClose={vi.fn()}
        rendezvousOrders={[rdv({ status: 'planned', remaining_game_s: 600 })]}
        onSelectRendezvous={onSelect}
        onCancelRendezvous={vi.fn()}
      />,
    )
    const row = screen.getByTestId('rendezvous-archive-row')
    expect(within(row).getByTestId('rendezvous-status')).toHaveTextContent('planned')
    expect(row).toHaveTextContent('10 min') // 600 s countdown
    fireEvent.click(screen.getByTestId('rendezvous-row-rdv-1'))
    expect(onSelect).toHaveBeenCalledOnce()
  })

  it('offers Cancel only for planned/due orders', () => {
    const { rerender } = render(
      <OrderHistoryPanel
        orders={[]}
        onClose={vi.fn()}
        rendezvousOrders={[rdv({ status: 'planned' })]}
        onCancelRendezvous={vi.fn()}
      />,
    )
    expect(screen.queryByTestId('rendezvous-cancel-rdv-1')).not.toBeNull()
    rerender(
      <OrderHistoryPanel
        orders={[]}
        onClose={vi.fn()}
        rendezvousOrders={[rdv({ status: 'launched' })]}
        onCancelRendezvous={vi.fn()}
      />,
    )
    expect(screen.queryByTestId('rendezvous-cancel-rdv-1')).toBeNull()
  })
})
