import { ButtonHTMLAttributes, forwardRef } from 'react'
import { cx } from './cx'

export type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'danger' | 'ghost'
export type ButtonSize = 'sm' | 'md'

/** Sistema papel/tinta/acento: la accion es tinta solida, el acento se
 *  reserva para el paso decisivo de cada pantalla (confirmar la compra) y
 *  siempre lleva texto tinta encima -- #c7ff4a con texto claro no pasa AA. */
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-[var(--tinta)] text-[var(--papel)] hover:opacity-88',
  accent: 'bg-[var(--acento)] text-[var(--tinta)] hover:brightness-95',
  secondary: 'bg-transparent text-[var(--tinta)] border border-[var(--linea-fuerte)] hover:bg-[var(--papel-hueco)]',
  danger: 'bg-transparent text-[#9b1c1c] border border-[#9b1c1c]/35 hover:bg-[#9b1c1c]/8',
  ghost: 'bg-transparent text-[var(--tinta-70)] hover:bg-[var(--papel-hueco)]',
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'text-xs px-3 py-1.5 gap-1 min-h-[38px]',
  md: 'text-sm px-4 py-2.5 gap-1.5 min-h-[44px]',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', className, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      className={cx(
        'inline-flex items-center justify-center rounded-[4px] font-semibold transition-all',
        'active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className
      )}
      {...props}
    />
  )
})
