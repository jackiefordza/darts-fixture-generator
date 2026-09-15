import type { ReactNode } from 'react'

interface EmptyStateProps {
  title: string
  description?: string
  action?: ReactNode
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="state-block state-empty">
      <p className="state-title">{title}</p>
      {description && <p className="state-description">{description}</p>}
      {action}
    </div>
  )
}
