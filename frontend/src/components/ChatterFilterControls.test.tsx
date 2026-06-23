import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ChatterFilterControls } from './ChatterFilterControls'
import { DEFAULT_CHATTER_FILTERS } from '../lib/chatterFilter'

describe('ChatterFilterControls', () => {
  it('marks the active mode and emits a mode change', () => {
    const onChange = vi.fn()
    render(<ChatterFilterControls value={DEFAULT_CHATTER_FILTERS} onChange={onChange} />)

    expect(screen.getByTestId('cf-mode-all')).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByTestId('cf-mode-supply'))
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_CHATTER_FILTERS, mode: 'supply' })
  })

  it('emits a threshold change from the slider', () => {
    const onChange = vi.fn()
    render(<ChatterFilterControls value={DEFAULT_CHATTER_FILTERS} onChange={onChange} />)

    fireEvent.change(screen.getByTestId('cf-threshold'), { target: { value: '4' } })
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_CHATTER_FILTERS, minThreat: 4 })
  })

  it('toggles a zone checkbox', () => {
    const onChange = vi.fn()
    render(<ChatterFilterControls value={DEFAULT_CHATTER_FILTERS} onChange={onChange} />)

    fireEvent.click(screen.getByTestId('cf-zone-blocked'))
    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULT_CHATTER_FILTERS,
      zones: { ...DEFAULT_CHATTER_FILTERS.zones, blocked: false },
    })
  })
})
