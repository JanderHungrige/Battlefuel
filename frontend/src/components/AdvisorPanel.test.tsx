import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { AdviceResult } from '../api/types'
import { AdvisorPanel } from './AdvisorPanel'

const result: AdviceResult = {
  kind: 'redistribution',
  summary: '1 transfer, 1 buy',
  recommendations: [
    {
      kind: 'redistribution',
      target: 'depot-main',
      action: { kind: 'transfer', from_depot: 'depot-main', to_depot: 'depot-north' },
      score: 5,
      rationale: 'Move 2000 L diesel depot-main→depot-north (5 km)',
    },
    {
      kind: 'redistribution',
      target: 'depot-main',
      action: { endpoint: 'buy-orders', depot_id: 'depot-main', fuel_type: 'jp8', quantity_liters: 2000 },
      score: 2000,
      rationale: 'Buy 2000 L jp8 into depot-main (no surplus to cover)',
    },
  ],
}

const base = {
  result,
  loading: false,
  error: null,
  busy: false,
  canRoute: false,
  onRequest: vi.fn(),
  onApply: vi.fn(),
  onSelect: vi.fn(),
  onClose: vi.fn(),
}

describe('AdvisorPanel', () => {
  it('selects a recommendation (to mark it on the map) when its row is clicked', () => {
    const onSelect = vi.fn()
    render(<AdvisorPanel {...base} onSelect={onSelect} />)
    const rows = screen.getAllByTestId('advice-rec')
    fireEvent.click(within(rows[0]).getByTestId('advice-select'))
    expect(onSelect).toHaveBeenCalledWith(result.recommendations[0])
  })

  it('requests advice when a kind button is clicked', () => {
    const onRequest = vi.fn()
    render(<AdvisorPanel {...base} onRequest={onRequest} />)
    fireEvent.click(screen.getByTestId('advice-redistribution'))
    expect(onRequest).toHaveBeenCalledWith('redistribution')
  })

  it('renders each recommendation with its rationale', () => {
    render(<AdvisorPanel {...base} />)
    expect(screen.getByText(/depot-main→depot-north/)).toBeInTheDocument()
    expect(screen.getByText(/Buy 2000 L jp8/)).toBeInTheDocument()
  })

  it('shows Apply only for applyable (endpoint-bearing) recommendations', () => {
    render(<AdvisorPanel {...base} />)
    const rows = screen.getAllByTestId('advice-rec')
    // First rec is a display-only transfer (no endpoint) → no Apply button.
    expect(within(rows[0]).queryByTestId('advice-apply')).toBeNull()
    // Second rec is a buy (has endpoint) → Apply present.
    expect(within(rows[1]).getByTestId('advice-apply')).toBeInTheDocument()
  })

  it('applies a recommendation on click', () => {
    const onApply = vi.fn()
    render(<AdvisorPanel {...base} onApply={onApply} />)
    const rows = screen.getAllByTestId('advice-rec')
    fireEvent.click(within(rows[1]).getByTestId('advice-apply'))
    expect(onApply).toHaveBeenCalledWith(result.recommendations[1])
  })

  it('disables the route button when no unit+destination is selected', () => {
    render(<AdvisorPanel {...base} canRoute={false} />)
    expect(screen.getByTestId('advice-route')).toBeDisabled()
  })
})
