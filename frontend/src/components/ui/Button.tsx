import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  busy?: boolean
  children: ReactNode
}

export function Button({ variant = 'secondary', busy = false, disabled, className, children, ...rest }: ButtonProps) {
  return (
    <button
      className={['btn', `btn-${variant}`, className].filter(Boolean).join(' ')}
      disabled={disabled || busy}
      aria-busy={busy}
      {...rest}
    >
      {busy ? 'Working…' : children}
    </button>
  )
}
