import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DrawnEdgeEditPanel } from './DrawnEdgeEditPanel'

describe('DrawnEdgeEditPanel', () => {
  it('names the selected kind and removes on click', () => {
    const onRemove = vi.fn()
    render(<DrawnEdgeEditPanel kind="path" onRemove={onRemove} onCancel={vi.fn()} />)
    expect(screen.getByTestId('drawn-edge-edit-panel').textContent).toContain('path')
    fireEvent.click(screen.getByTestId('drawn-edge-remove'))
    expect(onRemove).toHaveBeenCalledOnce()
  })

  it('cancel deselects without removing', () => {
    const onRemove = vi.fn()
    const onCancel = vi.fn()
    render(<DrawnEdgeEditPanel kind="road" onRemove={onRemove} onCancel={onCancel} />)
    fireEvent.click(screen.getByTestId('drawn-edge-deselect'))
    expect(onCancel).toHaveBeenCalledOnce()
    expect(onRemove).not.toHaveBeenCalled()
  })

  it('disables the actions and shows progress while busy', () => {
    render(<DrawnEdgeEditPanel kind="road" busy onRemove={vi.fn()} onCancel={vi.fn()} />)
    const remove = screen.getByTestId('drawn-edge-remove')
    expect(remove).toBeDisabled()
    expect(remove.textContent).toContain('Removing')
    expect(screen.getByTestId('drawn-edge-deselect')).toBeDisabled()
  })
})
