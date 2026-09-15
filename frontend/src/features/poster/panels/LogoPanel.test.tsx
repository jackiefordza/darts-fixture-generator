import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LogoPanel } from './LogoPanel'
import type { LogoElement } from '../posterTypes'

vi.mock('../imageUtils', () => ({
  readImageFile: vi.fn(),
}))

import { readImageFile } from '../imageUtils'

function makeElement(overrides: Partial<LogoElement> = {}): LogoElement {
  return {
    id: 'logo-1',
    type: 'logo',
    role: 'league',
    name: 'League logo',
    rect: { x: 0, y: 0, width: 30, height: 30 },
    visible: true,
    removable: false,
    src: null,
    aspectLocked: true,
    style: {},
    ...overrides,
  }
}

describe('LogoPanel', () => {
  it('replaces the image when a file is uploaded', async () => {
    vi.mocked(readImageFile).mockResolvedValue({ src: 'data:image/png;base64,xyz', width: 200, height: 100 })
    const onReplace = vi.fn()
    const user = userEvent.setup()
    render(
      <LogoPanel
        element={makeElement()}
        onReplace={onReplace}
        onRemoveImage={vi.fn()}
        onToggleAspectLock={vi.fn()}
        onReset={vi.fn()}
        onDeleteElement={vi.fn()}
      />,
    )

    const file = new File(['x'], 'logo.png', { type: 'image/png' })
    const input = screen.getByLabelText('Replace League logo')
    await user.upload(input, file)

    expect(onReplace).toHaveBeenCalledWith('data:image/png;base64,xyz', 200, 100)
  })

  it('removes the current image', async () => {
    const onRemoveImage = vi.fn()
    const user = userEvent.setup()
    render(
      <LogoPanel
        element={makeElement({ src: 'data:image/png;base64,abc' })}
        onReplace={vi.fn()}
        onRemoveImage={onRemoveImage}
        onToggleAspectLock={vi.fn()}
        onReset={vi.fn()}
        onDeleteElement={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Remove image' }))
    expect(onRemoveImage).toHaveBeenCalled()
  })

  it('toggles aspect ratio lock', async () => {
    const onToggleAspectLock = vi.fn()
    const user = userEvent.setup()
    render(
      <LogoPanel
        element={makeElement({ aspectLocked: true })}
        onReplace={vi.fn()}
        onRemoveImage={vi.fn()}
        onToggleAspectLock={onToggleAspectLock}
        onReset={vi.fn()}
        onDeleteElement={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('checkbox', { name: 'Preserve aspect ratio when resizing' }))
    expect(onToggleAspectLock).toHaveBeenCalledWith(false)
  })

  it('offers reset for a standard (non-removable) logo and delete for an added image', async () => {
    const user = userEvent.setup()
    const onReset = vi.fn()
    const { rerender } = render(
      <LogoPanel
        element={makeElement({ removable: false })}
        onReplace={vi.fn()}
        onRemoveImage={vi.fn()}
        onToggleAspectLock={vi.fn()}
        onReset={onReset}
        onDeleteElement={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Reset this logo' }))
    expect(onReset).toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Remove from poster' })).not.toBeInTheDocument()

    const onDeleteElement = vi.fn()
    rerender(
      <LogoPanel
        element={{ ...makeElement({ removable: true }), type: 'image' } as never}
        onReplace={vi.fn()}
        onRemoveImage={vi.fn()}
        onToggleAspectLock={vi.fn()}
        onReset={vi.fn()}
        onDeleteElement={onDeleteElement}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Remove from poster' }))
    expect(onDeleteElement).toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Reset this logo' })).not.toBeInTheDocument()
  })
})
