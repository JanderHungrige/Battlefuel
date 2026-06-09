import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { HaltedUnit } from '../lib/halt'
import { HaltBanner } from './HaltBanner'

function halted(overrides: Partial<HaltedUnit> = {}): HaltedUnit {
  return { instanceId: 'inst-1', orderId: 'o1', reason: 'threat', lat: 49.2, lon: 11.8, ...overrides }
}

const base = {
  unitName: 'LION',
  proceeding: false,
  onProceed: vi.fn(),
  onContinue: vi.fn(),
  onReroute: vi.fn(),
  onDismiss: vi.fn(),
}

describe('HaltBanner (v2 W13 F5)', () => {
  it('offers Continue (normal speed) for a threat halt and fires it', () => {
    const onContinue = vi.fn()
    render(<HaltBanner {...base} halted={halted({ reason: 'threat' })} onContinue={onContinue} />)
    fireEvent.click(screen.getByTestId('halt-continue'))
    expect(onContinue).toHaveBeenCalledOnce()
  })

  it('hides Continue for a physical block (cannot cross at normal speed)', () => {
    render(<HaltBanner {...base} halted={halted({ reason: 'blocked' })} />)
    expect(screen.queryByTestId('halt-continue')).toBeNull()
    expect(screen.getByTestId('halt-proceed')).toBeInTheDocument()
  })

  it('shows the slow-mode fuel estimate when provided', () => {
    render(<HaltBanner {...base} halted={halted({ slowModeFuelL: 42.5 })} />)
    expect(screen.getByTestId('halt-slow-fuel')).toHaveTextContent('43 L')
  })

  it('omits the slow-mode fuel line when not estimated', () => {
    render(<HaltBanner {...base} halted={halted({ slowModeFuelL: undefined })} />)
    expect(screen.queryByTestId('halt-slow-fuel')).toBeNull()
  })

  it('proceed slowly still works', () => {
    const onProceed = vi.fn()
    render(<HaltBanner {...base} halted={halted()} onProceed={onProceed} />)
    fireEvent.click(screen.getByTestId('halt-proceed'))
    expect(onProceed).toHaveBeenCalledOnce()
  })
})
