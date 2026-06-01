import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RoleToggle } from './RoleToggle'

describe('RoleToggle', () => {
  it('marks the active role and emits a new role on click', () => {
    const onChange = vi.fn()
    render(<RoleToggle role="OF4" onChange={onChange} />)
    expect(screen.getByTestId('role-OF4').className).toContain('active')
    expect(screen.getByTestId('role-OF8').className).not.toContain('active')
    fireEvent.click(screen.getByTestId('role-OF8'))
    expect(onChange).toHaveBeenCalledWith('OF8')
  })
})
