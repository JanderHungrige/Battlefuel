import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { RouteOption } from '../api/types'
import { FuelRunPanel } from './FuelRunPanel'

const opt = (metric: 'safe' | 'fast', threatMax: number): RouteOption => ({
  label: metric === 'safe' ? 'safest' : 'fastest',
  metric,
  geometry: [
    [11.8, 49.2],
    [11.81, 49.21],
  ],
  distance_m: 5000,
  duration_s: 600,
  threat_max: threatMax,
  threat_avg: 1,
  fuel_consumed_l: 40,
  fuel_remaining_l: 100,
  sufficient_fuel: true,
})

const base = {
  phase: 'review' as const,
  moverName: 'BOWSER',
  targetName: 'LION',
  options: [opt('safe', 1), opt('fast', 4)],
  metric: 'safe' as const,
  busy: false,
  message: null as string | null,
  sourceKind: null,
  truckSourceName: '',
  depotSourceName: '',
  onSelectMetric: vi.fn(),
  onSelectSource: vi.fn(),
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
}

describe('FuelRunPanel — force protection (v2 W13 F7)', () => {
  it('warns + relabels confirm when the chosen route crosses a threat sector', () => {
    render(<FuelRunPanel {...base} metric="fast" />)
    expect(screen.getByTestId('fuel-run-force-protection')).toBeInTheDocument()
    expect(screen.getByTestId('fuel-run-confirm')).toHaveTextContent('with force protection')
  })

  it('no force-protection prompt on a safe route', () => {
    render(<FuelRunPanel {...base} metric="safe" />)
    expect(screen.queryByTestId('fuel-run-force-protection')).toBeNull()
    expect(screen.getByTestId('fuel-run-confirm')).toHaveTextContent('Confirm fuel run')
  })

  it('confirm still fires the handler with force protection', () => {
    const onConfirm = vi.fn()
    render(<FuelRunPanel {...base} metric="fast" onConfirm={onConfirm} />)
    fireEvent.click(screen.getByTestId('fuel-run-confirm'))
    expect(onConfirm).toHaveBeenCalledOnce()
  })
})
