import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { FuelPlatform } from '../api/types'
import { OrderFuelMask } from './OrderFuelMask'

const worldFuel: FuelPlatform = {
  id: 'platform-world-fuel-dfms',
  name: 'World Fuel DFMS',
  logo_key: 'world-fuel',
  is_default: true,
}

const baseProps = {
  platform: worldFuel,
  fuelType: 'diesel',
  destinationName: 'Main Supply Point',
  amount: 5000,
  onPlace: vi.fn(),
  onClose: vi.fn(),
}

describe('OrderFuelMask', () => {
  it('shows the platform logo and prefilled fuel + destination', () => {
    render(<OrderFuelMask {...baseProps} />)
    const logo = screen.getByAltText('World Fuel DFMS') as HTMLImageElement
    expect(logo.getAttribute('src')).toBe('/logos/World-Fuel-Services-Logo.png')
    expect(screen.getByTestId('order-mask-fuel')).toHaveTextContent('diesel')
    expect(screen.getByTestId('order-mask-destination')).toHaveTextContent('Main Supply Point')
    expect(screen.getByTestId('order-mask-amount')).toHaveValue(5000)
  })

  it('falls back to a text badge for an operator-added platform with no committed logo', () => {
    render(
      <OrderFuelMask
        {...baseProps}
        platform={{ id: 'platform-nato-fuel-cell', name: 'NATO Fuel Cell', logo_key: null, is_default: false }}
      />,
    )
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByTestId('order-mask-badge')).toHaveTextContent('NATO Fuel Cell')
  })

  it('places the order with the edited amount, platform id, and inform flags', () => {
    const onPlace = vi.fn()
    render(<OrderFuelMask {...baseProps} onPlace={onPlace} />)
    fireEvent.change(screen.getByTestId('order-mask-amount'), { target: { value: '8000' } })
    fireEvent.click(screen.getByTestId('order-mask-inform-jlsg'))
    fireEvent.click(screen.getByTestId('order-mask-place'))
    expect(onPlace).toHaveBeenCalledWith(8000, {
      platformId: 'platform-world-fuel-dfms',
      informJlsg: true,
      informJtf: false,
      destinationName: 'Main Supply Point',
    })
  })

  it('closes without placing on Cancel', () => {
    const onClose = vi.fn()
    const onPlace = vi.fn()
    render(<OrderFuelMask {...baseProps} onClose={onClose} onPlace={onPlace} />)
    fireEvent.click(screen.getByTestId('order-mask-cancel'))
    expect(onClose).toHaveBeenCalled()
    expect(onPlace).not.toHaveBeenCalled()
  })
})
