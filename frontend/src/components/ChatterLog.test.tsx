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

  it('expands a combat line in-place to reveal detail, and still locates (Wave 4 F3)', () => {
    const onSelectEvent = vi.fn()
    render(
      <ChatterLog
        messages={[
          {
            id: 4,
            kind: 'status',
            text: 'Convoy ambushed on MSR',
            mgrs: '32U PU 11111 22222',
            sender: 'RECON 2-7',
            event_id: 'ambush-1',
            category: 'Engagements & Fires',
            estimated_threat: 5,
            supply_relevant: true,
            detail: 'Resupply column halted; request route advisory.',
            game_s: 612,
          },
        ]}
        onSelectEvent={onSelectEvent}
      />,
    )
    // Collapsed by default — no detail block.
    expect(screen.queryByTestId('chatter-detail')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('chatter-msg'))
    // Single click both locates (Wave-3 contract) and expands (F3).
    expect(onSelectEvent).toHaveBeenCalledWith('ambush-1')
    const detail = screen.getByTestId('chatter-detail')
    expect(detail).toHaveTextContent('Engagements & Fires')
    expect(detail).toHaveTextContent('5/5')
    expect(detail).toHaveTextContent('SUPPLY-RELEVANT')
    expect(detail).toHaveTextContent('T+612s')
    expect(detail).toHaveTextContent('Resupply column halted')

    // Clicking again collapses.
    fireEvent.click(screen.getByTestId('chatter-msg'))
    expect(screen.queryByTestId('chatter-detail')).not.toBeInTheDocument()
  })
})
