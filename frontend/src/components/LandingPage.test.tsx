import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LandingPage } from './LandingPage'

describe('LandingPage', () => {
  it('shows the BattleFuel hero and the powered-by logos', () => {
    render(<LandingPage onEnter={() => {}} verifyMs={0} />)
    expect(screen.getByRole('heading', { name: /battlefuel/i })).toBeInTheDocument()
    expect(screen.getByAltText('Eraneos')).toBeInTheDocument()
    expect(screen.getByAltText('World Fuel Services')).toBeInTheDocument()
  })

  it('verifies clearance, then approves and enables Enter', async () => {
    render(<LandingPage onEnter={() => {}} verifyMs={0} />)
    // Enter is disabled while clearance is still being verified.
    expect(screen.getByTestId('landing-enter')).toBeDisabled()
    // After the (here-instant) check it reads APPROVED and Enter is enabled.
    await screen.findByTestId('landing-approved')
    await waitFor(() => expect(screen.getByTestId('landing-enter')).toBeEnabled())
  })

  it('calls onEnter when the enabled Enter button is clicked', async () => {
    const onEnter = vi.fn()
    render(<LandingPage onEnter={onEnter} verifyMs={0} />)
    await waitFor(() => expect(screen.getByTestId('landing-enter')).toBeEnabled())
    fireEvent.click(screen.getByTestId('landing-enter'))
    expect(onEnter).toHaveBeenCalledOnce()
  })

  it('does not fire onEnter while clearance is still pending', () => {
    const onEnter = vi.fn()
    // A long verify window keeps Enter disabled.
    render(<LandingPage onEnter={onEnter} verifyMs={100000} />)
    fireEvent.click(screen.getByTestId('landing-enter'))
    expect(onEnter).not.toHaveBeenCalled()
  })
})
