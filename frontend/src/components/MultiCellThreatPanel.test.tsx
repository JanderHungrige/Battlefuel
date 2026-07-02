import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MultiCellThreatPanel } from './MultiCellThreatPanel'

describe('MultiCellThreatPanel', () => {
  it('shows the selected-cell count (pluralised)', () => {
    render(<MultiCellThreatPanel count={1} onSetThreat={vi.fn()} onClear={vi.fn()} />)
    expect(screen.getByTestId('multi-cell-count').textContent).toBe('1 cell selected')
  })

  it('pluralises for multiple cells', () => {
    render(<MultiCellThreatPanel count={3} onSetThreat={vi.fn()} onClear={vi.fn()} />)
    expect(screen.getByTestId('multi-cell-count').textContent).toBe('3 cells selected')
  })

  it('fires onSetThreat with the chosen level', () => {
    const onSetThreat = vi.fn()
    render(<MultiCellThreatPanel count={2} onSetThreat={onSetThreat} onClear={vi.fn()} />)
    fireEvent.click(screen.getByTestId('multi-threat-4'))
    expect(onSetThreat).toHaveBeenCalledWith(4)
  })

  it('clears the selection', () => {
    const onClear = vi.fn()
    render(<MultiCellThreatPanel count={2} onSetThreat={vi.fn()} onClear={onClear} />)
    fireEvent.click(screen.getByLabelText('Clear cell selection'))
    expect(onClear).toHaveBeenCalled()
  })

  it('marks the level last applied so the click is acknowledged', () => {
    render(<MultiCellThreatPanel count={2} onSetThreat={vi.fn()} onClear={vi.fn()} />)
    const btn = screen.getByTestId('multi-threat-3')
    expect(btn.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(btn)
    expect(btn.getAttribute('aria-pressed')).toBe('true')
    expect(btn.className).toContain('threat-set')
  })
})
