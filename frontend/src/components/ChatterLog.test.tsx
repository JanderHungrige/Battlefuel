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

  it('shows a close button only when onClose is given, and fires it', () => {
    const { rerender } = render(<ChatterLog messages={[]} testId="strategic-feed" />)
    expect(screen.queryByTestId('strategic-feed-close')).not.toBeInTheDocument()

    const onClose = vi.fn()
    rerender(<ChatterLog messages={[]} testId="strategic-feed" onClose={onClose} />)
    fireEvent.click(screen.getByTestId('strategic-feed-close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders a combat line with its MGRS tag + sender and locates by event id', () => {
    const onSelectEvent = vi.fn()
    render(
      <ChatterLog
        messages={[
          {
            id: 3,
            kind: 'status',
            text: 'IED / mine detected or detonated',
            mgrs: '32U PU 12345 67890',
            sender: 'EOD 4-1 (52nd EOD)',
            event_id: 'ied-msr-7',
            lat: 49.215,
            lon: 11.835,
          },
        ]}
        onSelectEvent={onSelectEvent}
      />,
    )
    const msg = screen.getByTestId('chatter-msg')
    expect(msg).toHaveTextContent('32U PU 12345 67890')
    expect(msg).toHaveTextContent('EOD 4-1 (52nd EOD)')
    fireEvent.click(msg)
    expect(onSelectEvent).toHaveBeenCalledWith('ied-msr-7')
  })
})
