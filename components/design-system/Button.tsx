import { ButtonHTMLAttributes, forwardRef } from 'react'
import { cx } from './cx'

export type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'danger' | 'ghost'
export type ButtonSize = 'sm' | 'md'

/** Sistema corporativo: la accion es verde bosque de marca (--marca, 6.69:1
 *  con texto papel encima) y el acento naranja se reserva para el paso
 *  decisivo de cada pantalla (confirmar la compra). El acento SIEMPRE lleva
 *  texto tinta encima: #e8862b con texto papel da 2.34:1 y no pasa AA. */
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'btn-solid btn-primary-solid text-[var(--papel)]',
  accent: 'btn-solid btn-accent-solid text-[var(--tinta)]',
  secondary: 'bg-transparent text-[var(--tinta)] border border-[var(--linea-fuerte)] hover:bg-[var(--papel-hueco)]',
  danger: 'bg-transparent text-[var(--alerta)] border border-[var(--alerta)]/40 hover:bg-[var(--alerta)]/8',
  ghost: 'bg-transparent text-[var(--tinta-70)] hover:bg-[var(--papel-hueco)]',
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'text-xs px-3.5 py-1.5 gap-1.5 min-h-[38px]',
  md: 'text-sm px-5 py-2.5 gap-2 min-h-[44px]',
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
        'inline-flex items-center justify-center rounded-[6px] font-semibold tracking-[0.01em] transition-all',
        'active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className
      )}
      {...props}
    />
  )
})
