import { HTMLAttributes } from 'react'
import { cx } from './cx'

export type AlertTone = 'error' | 'warning' | 'info'

const TONE_CLASSES: Record<AlertTone, string> = {
  error: 'border-l-2 border-[#9b1c1c] bg-[#9b1c1c]/6 text-[#9b1c1c]',
  warning: 'border-l-2 border-[#8a6d1f] bg-[#8a6d1f]/8 text-[#8a6d1f]',
  info: 'border-l-2 border-[var(--tinta)] bg-[var(--papel-hueco)] text-[var(--tinta)]',
}

export interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  tone?: AlertTone
}

export function Alert({ tone = 'info', className, role, ...props }: AlertProps) {
  return (
    <div
      role={role ?? (tone === 'error' ? 'alert' : 'status')}
      className={cx('rounded-r-[4px] px-3 py-2 text-sm font-medium', TONE_CLASSES[tone], className)}
      {...props}
    />
  )
}
