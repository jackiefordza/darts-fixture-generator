import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmDialog } from './ConfirmDialog'

describe('ConfirmDialog', () => {
  it('never calls onConfirm when the user cancels', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    const user = userEvent.setup()

    render(
      <ConfirmDialog
        title="Remove venue"
        description='Remove "The Anchor"? This cannot be undone.'
        confirmLabel="Remove"
        variant="danger"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('calls onConfirm when the user confirms', async () => {
    const onConfirm = vi.fn()
    const user = userEvent.setup()

    render(
      <ConfirmDialog
        title="Remove venue"
        description='Remove "The Anchor"?'
        confirmLabel="Remove"
        variant="danger"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Remove' }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('disables cancel while busy and surfaces a failure', () => {
    render(
      <ConfirmDialog
        title="Remove venue"
        description="Remove this venue?"
        confirmLabel="Remove"
        busy
        error="Venue is still referenced by a team"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(screen.getByText('Venue is still referenced by a team')).toBeInTheDocument()
  })
})
