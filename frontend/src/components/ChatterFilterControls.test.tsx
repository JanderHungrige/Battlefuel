import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ChatterFilterControls } from './ChatterFilterControls'
import { DEFAULT_CHATTER_FILTERS } from '../lib/chatterFilter'

function setup(over: { hoverDetails?: boolean } = {}) {
  const onChange = vi.fn()
  const onHoverDetailsChange = vi.fn()
  render(
    <ChatterFilterControls
      value={DEFAULT_CHATTER_FILTERS}
      onChange={onChange}
      hoverDetails={over.hoverDetails ?? false}
      onHoverDetailsChange={onHoverDetailsChange}
    />,
  )
  return { onChange, onHoverDetailsChange }
}

describe('ChatterFilterControls', () => {
  it('marks the active mode and emits a mode change', () => {
    const { onChange } = setup()
    expect(screen.getByTestId('cf-mode-all')).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByTestId('cf-mode-supply'))
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_CHATTER_FILTERS, mode: 'supply' })
  })

  it('emits a threshold change from the slider', () => {
    const { onChange } = setup()
    fireEvent.change(screen.getByTestId('cf-threshold'), { target: { value: '4' } })
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_CHATTER_FILTERS, minThreat: 4 })
  })

  it('toggles the cell-hover-details checkbox', () => {
    const { onHoverDetailsChange } = setup({ hoverDetails: false })
    fireEvent.click(screen.getByTestId('cf-hover-details'))
    expect(onHoverDetailsChange).toHaveBeenCalledWith(true)
  })
})
