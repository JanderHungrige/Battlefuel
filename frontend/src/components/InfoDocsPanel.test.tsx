import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { groupDocs } from '../lib/infoDocs'
import { InfoDocsPanel } from './InfoDocsPanel'

const groups = groupDocs([
  'AJP_4_4_C1_2022_Movement_UK.pdf',
  'AJP_4_6_C1_2018_doctrine_nato_joint_logistic_support_group_ajp.pdf',
])

describe('InfoDocsPanel', () => {
  it('lists grouped doc links that open the served PDF', () => {
    render(<InfoDocsPanel groups={groups} onClose={vi.fn()} />)
    expect(screen.getByText('NATO logistics doctrine (AJP)')).toBeInTheDocument()
    const links = screen.getAllByTestId('info-doc-link')
    expect(links).toHaveLength(2)
    expect(links[0]).toHaveAttribute('href', '/docs/AJP_4_4_C1_2022_Movement_UK.pdf')
    expect(links[0]).toHaveAttribute('target', '_blank')
  })

  it('shows an empty state with no docs', () => {
    render(<InfoDocsPanel groups={[]} onClose={vi.fn()} />)
    expect(screen.getByTestId('info-docs-empty')).toBeInTheDocument()
  })

  it('closes', () => {
    const onClose = vi.fn()
    render(<InfoDocsPanel groups={groups} onClose={onClose} />)
    fireEvent.click(screen.getByTestId('info-docs-close'))
    expect(onClose).toHaveBeenCalled()
  })

  it('renders each group section once', () => {
    const g = groupDocs(['AJP_4_4_C1_2022_Movement_UK.pdf', 'briefing_notes.pdf'])
    render(<InfoDocsPanel groups={g} onClose={vi.fn()} />)
    const other = screen.getByText('Other documents').closest('section') as HTMLElement
    expect(within(other).getAllByTestId('info-doc-link')).toHaveLength(1)
  })
})
