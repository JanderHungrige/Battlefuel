import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { TileAlert } from '../api/types'
import { ThreatAlerts } from './ThreatAlerts'

const alert = (id: number, threat: number): TileAlert => ({
  id,
  h3_index: '8811aabbccddeeff',
  threat_level: threat,
  terrain: 'forest',
})

describe('ThreatAlerts', () => {
  it('renders nothing when there are no alerts', () => {
    const { container } = render(<ThreatAlerts alerts={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders one info field per alert with threat and sector', () => {
    render(<ThreatAlerts alerts={[alert(1, 4), alert(2, 5)]} />)
    const items = screen.getAllByTestId('threat-alert')
    expect(items).toHaveLength(2)
    expect(screen.getByTestId('threat-alerts')).toHaveTextContent('4/5')
    expect(screen.getByTestId('threat-alerts')).toHaveTextContent('forest sector')
  })

  it('shows the most recent alert first', () => {
    render(<ThreatAlerts alerts={[alert(1, 3), alert(2, 5)]} />)
    const items = screen.getAllByTestId('threat-alert')
    expect(items[0]).toHaveTextContent('5/5') // id 2 (latest) on top
  })
})
