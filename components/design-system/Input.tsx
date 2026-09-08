import { InputHTMLAttributes, forwardRef, useId } from 'react'
import { cx } from './cx'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, className, id, ...props },
  ref
) {
  const generatedId = useId()
  const inputId = id ?? generatedId

  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="eyebrow block mb-1.5">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        aria-invalid={!!error}
        className={cx(
          'w-full min-h-[44px] rounded-[4px] border px-3.5 py-2.5 text-sm text-[var(--tinta)] transition-colors',
          'placeholder:text-[var(--tinta-45)] bg-[var(--papel-hueco)]',
          error ? 'border-[#9b1c1c]/50' : 'border-[var(--linea)] hover:border-[var(--linea-fuerte)]',
          className
        )}
        {...props}
      />
      {error && <p className="text-xs" style={{ color: '#9b1c1c' }}>{error}</p>}
    </div>
  )
})
