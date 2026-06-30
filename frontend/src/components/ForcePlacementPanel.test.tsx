import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { UnitType } from '../api/types'
import { ForcePlacementPanel } from './ForcePlacementPanel'

const ut = (id: string, nato: string): UnitType => ({
  id,
  name: id,
  nato_unit_type: nato,
  echelon: 'company',
  sidc: '10031000151205000000',
  recon_level: 'none',
  fuel: {
    fuel_type: 'diesel',
    capacity_liters: 1000,
    consumption_normal_lph: 10,
    consumption_combat_lph: 20,
    consumption_idle_lph: 1,
  },
  endurance_hours_normal: null,
  endurance_hours_combat: null,
  description: null,
})

const types = [ut('armor', 'armor'), ut('tanker', 'fuel_supply')]

function renderPanel(overrides: Partial<Parameters<typeof ForcePlacementPanel>[0]> = {}) {
  const props = {
    unitTypes: types,
    side: 'blue' as const,
    onSide: vi.fn(),
    tab: 'troops' as const,
    onTab: vi.fn(),
    selectedTypeId: null,
    onSelectType: vi.fn(),
    selectedForceName: null,
    onDeleteSelected: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  }
  render(<ForcePlacementPanel {...props} />)
  return props
}

describe('ForcePlacementPanel', () => {
  it('lists only the active tab unit types in the dropdown', () => {
    renderPanel({ tab: 'fuel' })
    const select = screen.getByTestId('force-type-select') as HTMLSelectElement
    const values = [...select.options].map((o) => o.value).filter(Boolean)
    expect(values).toEqual(['tanker'])
  })

  it('switches side when a side button is clicked', () => {
    const props = renderPanel()
    fireEvent.click(screen.getByTestId('force-side-red'))
    expect(props.onSide).toHaveBeenCalledWith('red')
  })

  it('switches tab when a tab is clicked', () => {
    const props = renderPanel()
    fireEvent.click(screen.getByTestId('force-tab-fuel'))
    expect(props.onTab).toHaveBeenCalledWith('fuel')
  })

  it('reports the chosen unit type', () => {
    const props = renderPanel()
    fireEvent.change(screen.getByTestId('force-type-select'), { target: { value: 'armor' } })
    expect(props.onSelectType).toHaveBeenCalledWith('armor')
  })

  it('shows a place hint naming the side and selected type', () => {
    renderPanel({ selectedTypeId: 'armor', side: 'red' })
    expect(screen.getByTestId('force-hint').textContent).toContain('red')
    expect(screen.getByTestId('force-hint').textContent).toContain('armor')
  })

  it('disables Delete unit until a force is selected', () => {
    renderPanel({ selectedForceName: null })
    expect((screen.getByTestId('force-delete') as HTMLButtonElement).disabled).toBe(true)
  })

  it('deletes the selected force when Delete unit is clicked', () => {
    const props = renderPanel({ selectedForceName: 'COBRA' })
    expect(screen.getByTestId('force-selected').textContent).toContain('COBRA')
    const btn = screen.getByTestId('force-delete') as HTMLButtonElement
    expect(btn.disabled).toBe(false)
    fireEvent.click(btn)
    expect(props.onDeleteSelected).toHaveBeenCalled()
  })
})
