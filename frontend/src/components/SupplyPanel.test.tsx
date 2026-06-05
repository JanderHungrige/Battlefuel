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

  it('defaults to the Overview tab and switches to Order fuel (W11)', () => {
    render(<SupplyPanel {...baseProps} />)
    // Overview (status) is the default tab: distribution visible, order form hidden.
    // "Fuel trucks" is overview-only (depot names also appear as <option>s on the order tab).
    expect(screen.getByText('Fuel trucks')).toBeInTheDocument()
    expect(screen.queryByTestId('buy-submit')).not.toBeInTheDocument()
    // Switch to Order fuel: order form appears, distribution hides.
    fireEvent.click(screen.getByTestId('supply-tab-order'))
    expect(screen.getByTestId('buy-submit')).toBeInTheDocument()
    expect(screen.queryByText('Fuel trucks')).not.toBeInTheDocument()
    // Back to Overview.
    fireEvent.click(screen.getByTestId('supply-tab-overview'))
    expect(screen.getByText('Fuel trucks')).toBeInTheDocument()
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

  it('locates a supply point and shows its site-type tag (W11 F5)', () => {
    const onLocateDepot = vi.fn()
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
        onLocateDepot={onLocateDepot}
      />,
    )
    expect(screen.getByTestId('depot-site-tag')).toHaveTextContent('BSA')
    fireEvent.click(screen.getByTestId('depot-locate-site-bsa'))
    expect(onLocateDepot).toHaveBeenCalledWith('site-bsa')
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
