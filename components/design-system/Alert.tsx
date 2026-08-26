import { HTMLAttributes } from 'react'
import { cx } from './cx'

export type AlertTone = 'error' | 'warning' | 'info'

export interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  tone?: AlertTone
}

const TONE_CLASSES: Record<AlertTone, string> = {
  error: 'bg-red-50 text-red-700',
  warning: 'bg-amber-50 text-amber-700',
  info: 'bg-[var(--verde-muted)] text-[var(--verde-dark)]',
}

export function Alert({ tone = 'info', className, role, ...props }: AlertProps) {
  return (
    <div
      role={role ?? (tone === 'error' ? 'alert' : 'status')}
      className={cx('rounded-lg px-3 py-2 text-sm font-medium', TONE_CLASSES[tone], className)}
      {...props}
    />
  )
}
