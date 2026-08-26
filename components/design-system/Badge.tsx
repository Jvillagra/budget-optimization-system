import { HTMLAttributes } from 'react'
import { cx } from './cx'

export type BadgeTone = 'verde' | 'cafe' | 'neutral' | 'error'

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone
}

const TONE_CLASSES: Record<BadgeTone, string> = {
  verde: 'bg-[var(--verde-muted)] text-[var(--verde-dark)]',
  cafe: 'bg-[var(--cafe-muted)] text-[var(--cafe-dark)]',
  neutral: 'bg-black/6 text-black/70',
  error: 'bg-red-50 text-red-700',
}

export function Badge({ tone = 'neutral', className, ...props }: BadgeProps) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
        TONE_CLASSES[tone],
        className
      )}
      {...props}
    />
  )
}
