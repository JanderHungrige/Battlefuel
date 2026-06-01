import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ChatterLog } from './ChatterLog'

describe('ChatterLog', () => {
  it('renders an empty state with no messages', () => {
    render(<ChatterLog messages={[]} onSelect={() => {}} />)
    expect(screen.getByText('No radio traffic yet.')).toBeInTheDocument()
  })

  it('shows newest first and selects the sector of a clicked message', () => {
    const onSelect = vi.fn()
    render(
      <ChatterLog
        messages={[
          { id: 1, kind: 'status', text: 'older', h3_index: 'h1' },
          { id: 2, kind: 'order', text: 'newest order' },
        ]}
        onSelect={onSelect}
      />,
    )
    const msgs = screen.getAllByTestId('chatter-msg')
    expect(msgs[0]).toHaveTextContent('newest order') // newest first
    fireEvent.click(msgs[1]) // the status line with a sector
    expect(onSelect).toHaveBeenCalledWith('h1')
  })
})
