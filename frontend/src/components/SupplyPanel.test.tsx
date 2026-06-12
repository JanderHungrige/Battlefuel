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
  it('shows the overview: depot distribution + a fleet summary', () => {
    render(<SupplyPanel {...baseProps} />)
    expect(screen.getAllByText(/Main Supply Point/).length).toBeGreaterThan(0)
    // The full truck list moved to the Supply fleet tab; the overview shows counts.
    expect(screen.getByTestId('fleet-total')).toHaveTextContent('1')
    expect(screen.getByTestId('fleet-standby')).toHaveTextContent('1')
    expect(screen.getByTestId('supply-panel')).toBeInTheDocument()
  })

  it('defaults to the Overview tab and switches to Order fuel (W11)', () => {
    render(<SupplyPanel {...baseProps} />)
    // Overview (status) is the default tab: fleet summary visible, order form hidden.
    expect(screen.getByTestId('fleet-summary')).toBeInTheDocument()
    expect(screen.queryByTestId('buy-submit')).not.toBeInTheDocument()
    // Switch to Order fuel: order form appears, summary hides.
    fireEvent.click(screen.getByTestId('supply-tab-order'))
    expect(screen.getByTestId('buy-submit')).toBeInTheDocument()
    expect(screen.queryByTestId('fleet-summary')).not.toBeInTheDocument()
    // Back to Overview.
    fireEvent.click(screen.getByTestId('supply-tab-overview'))
    expect(screen.getByTestId('fleet-summary')).toBeInTheDocument()
  })

  it('Supply fleet tab lists trucks with their availability (W11)', () => {
    const fleetOverview: SupplyOverview = {
      ...overview,
      trucks: [
        { ...overview.trucks[0] }, // TANKER, no assignment → standby
        {
          instance_id: 'inst-fuel-2',
          name: 'BOWSER',
          unit_type_id: 'fuel-supply-pl',
          fuel_type: 'diesel',
          current_fuel_liters: 4000,
          capacity_liters: 4000,
          lat: 49.2,
          lon: 11.84,
          h3_index: 'z',
          assigned_unit_id: 'inst-armor-1',
        },
      ],
    }
    render(<SupplyPanel {...baseProps} overview={fleetOverview} />)
    // Overview summary reflects 2 trucks, 1 on standby.
    expect(screen.getByTestId('fleet-total')).toHaveTextContent('2')
    expect(screen.getByTestId('fleet-standby')).toHaveTextContent('1')
    // The fleet tab lists each truck with availability (assigned unit resolved via refuelTargets).
    fireEvent.click(screen.getByTestId('supply-tab-fleet'))
    expect(screen.getByTestId('supply-fleet')).toBeInTheDocument()
    expect(screen.getByTestId('truck-status-inst-fuel-1')).toHaveTextContent('On standby')
    expect(screen.getByTestId('truck-status-inst-fuel-2')).toHaveTextContent('Tasked → TIGER')
  })

  it('opens the order mask and places the order through it (W11 F3)', () => {
    const onBuy = vi.fn()
    render(<SupplyPanel {...baseProps} onBuy={onBuy} />)
    fireEvent.click(screen.getByTestId('supply-tab-order'))
    fireEvent.change(screen.getByTestId('buy-quantity'), { target: { value: '5000' } })
    // "Order fuel" now opens the branded mask instead of placing directly.
    fireEvent.click(screen.getByTestId('buy-submit'))
    expect(screen.getByTestId('order-mask')).toBeInTheDocument()
    expect(screen.getByTestId('order-mask-fuel')).toHaveTextContent('diesel')
    expect(screen.getByTestId('order-mask-destination')).toHaveTextContent('Main Supply Point')
    fireEvent.click(screen.getByTestId('order-mask-place'))
    expect(onBuy).toHaveBeenCalledWith('depot-main', 'diesel', 5000, {
      platformId: null,
      informJlsg: false,
      informJtf: false,
      destinationName: 'Main Supply Point',
    })
  })

  it('renames the action to "Order fuel"', () => {
    render(<SupplyPanel {...baseProps} />)
    fireEvent.click(screen.getByTestId('supply-tab-order'))
    expect(screen.getByTestId('buy-submit')).toHaveTextContent('Order fuel')
    expect(screen.queryByText('Buy fuel')).not.toBeInTheDocument()
  })

  // Regression (W11 F1): when depots arrive AFTER first render, the stateful buyDepot was
  // never re-seeded, leaving the default Main Supply Point with an empty fuel dropdown and a
  // disabled button. With the effectiveDepot fallback the default depot is order-ready
  // immediately, with no prior selection.
  it('enables ordering for the default depot when depots load after first render', () => {
    const onBuy = vi.fn()
    // First render with no depots (loading), then re-render once they arrive.
    const { rerender } = render(
      <SupplyPanel {...baseProps} depots={[]} overview={null} onBuy={onBuy} />,
    )
    rerender(<SupplyPanel {...baseProps} onBuy={onBuy} />)
    fireEvent.click(screen.getByTestId('supply-tab-order'))
    const submit = screen.getByTestId('buy-submit')
    expect(submit).not.toBeDisabled()
    fireEvent.click(submit)
    fireEvent.click(screen.getByTestId('order-mask-place'))
    expect(onBuy).toHaveBeenCalledWith('depot-main', 'diesel', 5000, {
      platformId: null,
      informJlsg: false,
      informJtf: false,
      destinationName: 'Main Supply Point',
    })
  })

  it('hides the platform selector when no platforms are provided', () => {
    render(<SupplyPanel {...baseProps} />)
    fireEvent.click(screen.getByTestId('supply-tab-order'))
    expect(screen.queryByTestId('platform-selector')).not.toBeInTheDocument()
  })

  it('renders the platform selector and adds a new platform (W11 F2)', () => {
    const onAddPlatform = vi.fn()
    const onSelectPlatform = vi.fn()
    render(
      <SupplyPanel
        {...baseProps}
        platforms={[
          { id: 'platform-world-fuel-dfms', name: 'World Fuel DFMS', logo_key: 'world-fuel', is_default: true },
          { id: 'platform-shell-fm', name: 'Shell FM', logo_key: 'shell-fm', is_default: false },
        ]}
        selectedPlatformId="platform-world-fuel-dfms"
        onSelectPlatform={onSelectPlatform}
        onAddPlatform={onAddPlatform}
      />,
    )
    fireEvent.click(screen.getByTestId('supply-tab-order'))
    expect(screen.getByTestId('platform-selector')).toBeInTheDocument()
    expect(screen.getByTestId('platform-select')).toHaveValue('platform-world-fuel-dfms')

    fireEvent.change(screen.getByTestId('platform-select'), {
      target: { value: 'platform-shell-fm' },
    })
    expect(onSelectPlatform).toHaveBeenCalledWith('platform-shell-fm')

    fireEvent.click(screen.getByTestId('platform-add-toggle'))
    fireEvent.change(screen.getByTestId('platform-new-name'), {
      target: { value: 'NATO Fuel Cell' },
    })
    fireEvent.click(screen.getByTestId('platform-add-confirm'))
    expect(onAddPlatform).toHaveBeenCalledWith('NATO Fuel Cell')
  })

  it('locates a supply point (by coords) and shows its site-type tag (W11 F5)', () => {
    const onLocate = vi.fn()
    const lowOverview: SupplyOverview = {
      depots: [
        {
          depot: { id: 'site-bsa', name: 'BSA 12', h3_index: 'z', lat: 49.2, lon: 11.8, site_type: 'bsa' },
          stocks: [
            { depot_id: 'site-bsa', fuel_type: 'diesel', quantity_liters: 5000, capacity_liters: 20000 },
          ],
        },
      ],
      trucks: [],
      total_depot_liters_by_type: { diesel: 5000 },
      total_truck_liters: 0,
    }
    render(
      <SupplyPanel
        {...baseProps}
        overview={lowOverview}
        depots={lowOverview.depots.map((d) => d.depot)}
        onLocate={onLocate}
      />,
    )
    expect(screen.getByTestId('depot-site-tag')).toHaveTextContent('BSA')
    fireEvent.click(screen.getByTestId('depot-locate-site-bsa'))
    expect(onLocate).toHaveBeenCalledWith(49.2, 11.8)
  })

  it('locates a fuel truck from the Supply fleet tab (W11)', () => {
    const onLocate = vi.fn()
    render(<SupplyPanel {...baseProps} onLocate={onLocate} />)
    fireEvent.click(screen.getByTestId('supply-tab-fleet'))
    // baseProps TANKER is at (49.2, 11.83).
    fireEvent.click(screen.getByTestId('truck-locate-inst-fuel-1'))
    expect(onLocate).toHaveBeenCalledWith(49.2, 11.83)
  })

  it('offers a refuel proposal for a low site only (W11 F5)', () => {
    const onProposeRefuel = vi.fn()
    const lowOverview: SupplyOverview = {
      depots: [
        {
          depot: { id: 'site-low', name: 'FLS 3', h3_index: 'z', lat: 49.2, lon: 11.8, site_type: 'fls' },
          stocks: [
            { depot_id: 'site-low', fuel_type: 'diesel', quantity_liters: 2000, capacity_liters: 20000 },
          ],
        },
      ],
      trucks: [],
      total_depot_liters_by_type: { diesel: 2000 },
      total_truck_liters: 0,
    }
    render(<SupplyPanel {...baseProps} overview={lowOverview} onProposeRefuel={onProposeRefuel} />)
    fireEvent.click(screen.getByTestId('depot-propose-site-low'))
    expect(onProposeRefuel).toHaveBeenCalledWith('site-low')
  })

  it('does not offer a refuel proposal for a well-stocked depot', () => {
    // baseProps depot-main is 60000/80000 (75% — above the low threshold).
    render(<SupplyPanel {...baseProps} onProposeRefuel={vi.fn()} />)
    expect(screen.queryByTestId('depot-propose-depot-main')).not.toBeInTheDocument()
  })

  it('removes a depot via the Remove button when onRemoveDepot is given', () => {
    const onRemoveDepot = vi.fn()
    render(<SupplyPanel {...baseProps} onRemoveDepot={onRemoveDepot} />)
    fireEvent.click(screen.getByTestId('depot-remove-depot-main'))
    expect(onRemoveDepot).toHaveBeenCalledWith('depot-main')
  })

  it('hides the Remove button when onRemoveDepot is not provided', () => {
    render(<SupplyPanel {...baseProps} />)
    expect(screen.queryByTestId('depot-remove-depot-main')).not.toBeInTheDocument()
  })

  it('requests a refuel for the chosen unit', () => {
    const onRefuel = vi.fn()
    render(<SupplyPanel {...baseProps} onRefuel={onRefuel} />)
    fireEvent.click(screen.getByTestId('supply-tab-order'))
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
    fireEvent.click(screen.getByTestId('supply-tab-order'))
    const rec = screen.getByTestId('refuel-recommendation')
    expect(within(rec).getByText(/TANKER/)).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('refuel-confirm'))
    expect(onConfirmRefuel).toHaveBeenCalled()
  })
})
