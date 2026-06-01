import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ObstacleKindPicker } from './ObstacleKindPicker'

describe('ObstacleKindPicker', () => {
  it('marks the selected kind and emits a new selection on click', () => {
    const onSelect = vi.fn()
    render(<ObstacleKindPicker selected="minefield" onSelect={onSelect} />)
    expect(screen.getByTestId('kind-minefield').className).toContain('active')
    fireEvent.click(screen.getByTestId('kind-roadblock'))
    expect(onSelect).toHaveBeenCalledWith('roadblock')
  })
})
