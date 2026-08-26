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
        <label htmlFor={inputId} className="block text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        aria-invalid={!!error}
        className={cx(
          'w-full rounded-xl border px-4 py-2.5 text-sm text-[#1c1c1c] transition-colors',
          'placeholder:text-black/35',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
          error
            ? 'border-red-300 focus-visible:ring-red-400'
            : 'border-black/12 bg-white/70 focus-visible:ring-[var(--verde)] focus-visible:border-[var(--verde)]',
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  )
})
