import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ScenarioSummary } from '../api/types'
import { ScenarioPanel } from './ScenarioPanel'

const scn = (id: string, name: string): ScenarioSummary => ({
  id,
  name,
  created_at: '2026-07-02T00:00:00',
})

function renderPanel(overrides: Partial<Parameters<typeof ScenarioPanel>[0]> = {}) {
  const props = {
    scenarios: [] as ScenarioSummary[],
    onSave: vi.fn(),
    onLoad: vi.fn(),
    onDelete: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  }
  render(<ScenarioPanel {...props} />)
  return props
}

describe('ScenarioPanel', () => {
  it('shows an empty state when nothing is saved', () => {
    renderPanel()
    expect(screen.getByTestId('scenario-empty')).toBeTruthy()
  })

  it('disables Save until a non-blank name is entered', () => {
    renderPanel()
    const save = screen.getByTestId('scenario-save') as HTMLButtonElement
    expect(save.disabled).toBe(true)
    fireEvent.change(screen.getByTestId('scenario-name'), { target: { value: '  ' } })
    expect(save.disabled).toBe(true)
    fireEvent.change(screen.getByTestId('scenario-name'), { target: { value: 'Alpha' } })
    expect(save.disabled).toBe(false)
  })

  it('saves the trimmed name', () => {
    const props = renderPanel()
    fireEvent.change(screen.getByTestId('scenario-name'), { target: { value: '  Bravo  ' } })
    fireEvent.click(screen.getByTestId('scenario-save'))
    expect(props.onSave).toHaveBeenCalledWith('Bravo')
  })

  it('lists saved scenarios with load + delete', () => {
    const props = renderPanel({ scenarios: [scn('scn-1', 'Defense'), scn('scn-2', 'Assault')] })
    expect(screen.getByTestId('scenario-list').children).toHaveLength(2)
    fireEvent.click(screen.getByTestId('scenario-load-scn-1'))
    expect(props.onLoad).toHaveBeenCalledWith('scn-1')
    fireEvent.click(screen.getByTestId('scenario-delete-scn-2'))
    expect(props.onDelete).toHaveBeenCalledWith('scn-2')
  })
})
