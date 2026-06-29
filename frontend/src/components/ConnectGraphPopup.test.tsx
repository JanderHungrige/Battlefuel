import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ConnectGraphPopup } from './ConnectGraphPopup'

describe('ConnectGraphPopup', () => {
  it('offers first / last / both / none and routes each to onConnect', () => {
    const onConnect = vi.fn()
    render(<ConnectGraphPopup kind="road" onConnect={onConnect} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByTestId('connect-first'))
    fireEvent.click(screen.getByTestId('connect-last'))
    fireEvent.click(screen.getByTestId('connect-both'))
    fireEvent.click(screen.getByTestId('connect-none'))
    expect(onConnect.mock.calls.map((c) => c[0])).toEqual(['first', 'last', 'both', 'none'])
  })

  it('names the drawn kind in the prompt', () => {
    render(<ConnectGraphPopup kind="path" onConnect={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByTestId('connect-graph-popup').textContent).toContain('path')
  })

  it('cancel calls onCancel without connecting', () => {
    const onConnect = vi.fn()
    const onCancel = vi.fn()
    render(<ConnectGraphPopup kind="road" onConnect={onConnect} onCancel={onCancel} />)
    fireEvent.click(screen.getByTestId('connect-cancel'))
    expect(onCancel).toHaveBeenCalledOnce()
    expect(onConnect).not.toHaveBeenCalled()
  })

  it('disables actions while busy', () => {
    render(<ConnectGraphPopup kind="road" busy onConnect={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByTestId('connect-both')).toBeDisabled()
    expect(screen.getByTestId('connect-cancel')).toBeDisabled()
  })
})
