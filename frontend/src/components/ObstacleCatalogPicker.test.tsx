import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ObstacleCatalogPicker } from './ObstacleCatalogPicker'
import type { CombatEventCatalogItem } from '../api/types'

const items: CombatEventCatalogItem[] = [
  {
    id: '001-mine',
    category: 'Threat Events',
    event: 'IED / mine detected or detonated',
    threat_level: 4,
    supply_relevant: true,
  },
  {
    id: '002-choke',
    category: 'Movement & Access',
    event: 'Chokepoint / bottleneck identified',
    threat_level: 3,
    supply_relevant: true,
  },
]

describe('ObstacleCatalogPicker', () => {
  it('renders catalog items with their derived kind', () => {
    render(<ObstacleCatalogPicker items={items} selectedId="" onSelect={() => {}} />)
    expect(screen.getByTestId('catalog-item-001-mine')).toHaveTextContent('minefield')
    expect(screen.getByTestId('catalog-item-002-choke')).toHaveTextContent('roadblock')
  })

  it('filters the list via the search box', () => {
    render(<ObstacleCatalogPicker items={items} selectedId="" onSelect={() => {}} />)
    fireEvent.change(screen.getByTestId('obstacle-search'), { target: { value: 'chokepoint' } })
    expect(screen.queryByTestId('catalog-item-001-mine')).not.toBeInTheDocument()
    expect(screen.getByTestId('catalog-item-002-choke')).toBeInTheDocument()
  })

  it('emits the derived template on select', () => {
    const onSelect = vi.fn()
    render(<ObstacleCatalogPicker items={items} selectedId="" onSelect={onSelect} />)
    fireEvent.click(screen.getByTestId('catalog-item-001-mine'))
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: '001-mine', kind: 'minefield' }),
    )
  })

  it('shows a loading hint when no items are loaded yet', () => {
    render(<ObstacleCatalogPicker items={[]} selectedId="" onSelect={() => {}} />)
    expect(screen.getByText('Loading catalog…')).toBeInTheDocument()
  })
})
