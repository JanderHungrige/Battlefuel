import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { RouteOption } from '../api/types'
import { PlanRendezvousPanel } from './PlanRendezvousPanel'

const opt = (metric: 'safe' | 'fast', fuel: number): RouteOption => ({
  label: metric === 'safe' ? 'safest' : 'fastest',
  metric,
  geometry: [
    [11.8, 49.2],
    [11.81, 49.21],
  ],
  distance_m: 5000,
  duration_s: 600,
  threat_max: metric === 'safe' ? 1 : 4,
  threat_avg: 0.5,
  fuel_consumed_l: fuel,
  fuel_remaining_l: 100,
  sufficient_fuel: true,
})

const base = {
  phase: 'review' as const,
  truckName: 'BOWSER',
  unitName: 'LION',
  truckRoutes: [opt('safe', 40), opt('fast', 30)],
  unitRoutes: [opt('safe', 25), opt('fast', 20)],
  metric: 'safe' as const,
  busy: false,
  message: null,
  onSelectMetric: vi.fn(),
  onOrderNow: vi.fn(),
  onSchedule: vi.fn(),
  onCancel: vi.fn(),
}

describe('PlanRendezvousPanel', () => {
  it('is hidden when idle', () => {
    const { container } = render(<PlanRendezvousPanel {...base} phase="idle" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the pick-unit hint first', () => {
    render(<PlanRendezvousPanel {...base} phase="pick-unit" />)
    expect(screen.getByTestId('rdv-hint')).toHaveTextContent('Click the unit')
  })

  it('shows both movers fuel-to-meet for the selected metric in review', () => {
    render(<PlanRendezvousPanel {...base} />)
    // Safe metric selected → tanker 40 L, unit 25 L.
    expect(screen.getByTestId('rdv-mover-tanker')).toHaveTextContent('40 L')
    expect(screen.getByTestId('rdv-mover-unit')).toHaveTextContent('25 L')
  })

  it('order now triggers the immediate dispatch', () => {
    const onOrderNow = vi.fn()
    render(<PlanRendezvousPanel {...base} onOrderNow={onOrderNow} />)
    fireEvent.click(screen.getByTestId('rdv-order-now'))
    expect(onOrderNow).toHaveBeenCalledOnce()
  })

  it('scheduling reveals delay inputs and sends the computed sim-seconds', () => {
    const onSchedule = vi.fn()
    render(<PlanRendezvousPanel {...base} onSchedule={onSchedule} />)
    fireEvent.click(screen.getByTestId('rdv-plan-toggle'))
    fireEvent.change(screen.getByTestId('rdv-hours'), { target: { value: '1' } })
    fireEvent.change(screen.getByTestId('rdv-minutes'), { target: { value: '30' } })
    fireEvent.click(screen.getByTestId('rdv-send'))
    expect(onSchedule).toHaveBeenCalledWith(1 * 3600 + 30 * 60)
  })

  it('selecting Fast re-queries the metric', () => {
    const onSelectMetric = vi.fn()
    render(<PlanRendezvousPanel {...base} onSelectMetric={onSelectMetric} />)
    fireEvent.click(screen.getByTestId('rdv-metric-fast'))
    expect(onSelectMetric).toHaveBeenCalledWith('fast')
  })
})
