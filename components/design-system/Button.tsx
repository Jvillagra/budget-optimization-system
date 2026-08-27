import { ButtonHTMLAttributes, forwardRef } from 'react'
import { cx } from './cx'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'
export type ButtonSize = 'sm' | 'md'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-[var(--verde)] text-white hover:bg-[var(--verde-dark)] focus-visible:ring-[var(--verde)]',
  secondary: 'bg-[var(--cafe-muted)] text-[var(--cafe-dark)] hover:bg-[var(--cafe-light)]/25 focus-visible:ring-[var(--cafe)]',
  danger: 'bg-red-50 text-red-700 hover:bg-red-100 focus-visible:ring-red-500',
  ghost: 'bg-transparent text-[var(--cafe)] hover:bg-black/5 focus-visible:ring-[var(--cafe)]',
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'text-xs px-3 py-1.5 gap-1 min-h-[38px]',
  md: 'text-sm px-4 py-2.5 gap-1.5 min-h-[44px]',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', className, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      className={cx(
        'inline-flex items-center justify-center rounded-lg font-semibold transition-transform',
        'active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className
      )}
      {...props}
    />
  )
})
