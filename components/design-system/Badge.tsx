import { HTMLAttributes } from 'react'
import { cx } from './cx'

export type BadgeTone = 'verde' | 'cafe' | 'neutral' | 'error'

/** Los nombres de tono son los del sistema anterior (los usan ~8 pantallas);
 *  lo que cambio es a que color mapea cada uno. 'verde' era el tono de exito
 *  y ahora es el acento; 'cafe' era el secundario y ahora es papel hundido. */
const TONE_CLASSES: Record<BadgeTone, string> = {
  verde: 'bg-[var(--acento)] text-[var(--tinta)]',
  cafe: 'bg-[var(--papel-hueco)] text-[var(--tinta)]',
  neutral: 'border border-[var(--linea)] text-[var(--tinta-70)]',
  error: 'bg-[#9b1c1c]/10 text-[#9b1c1c]',
}

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone
}

export function Badge({ tone = 'neutral', className, ...props }: BadgeProps) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-[3px] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
        TONE_CLASSES[tone],
        className
      )}
      {...props}
    />
  )
}
