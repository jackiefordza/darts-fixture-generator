import { Button } from './Button'
import { InlineError } from './InlineError'
import { Modal } from './Modal'
import type { ApiError } from '../../api/http'

interface ConfirmDialogProps {
  title: string
  description: string
  confirmLabel?: string
  variant?: 'primary' | 'danger'
  busy?: boolean
  error?: ApiError | string | null
  onConfirm: () => void
  onCancel: () => void
}

/** Used before any destructive or schedule-changing action (delete, generate, regenerate, move). */
export function ConfirmDialog({
  title,
  description,
  confirmLabel = 'Confirm',
  variant = 'primary',
  busy = false,
  error = null,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant={variant} onClick={onConfirm} busy={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p>{description}</p>
      <InlineError error={error ?? null} />
    </Modal>
  )
}
