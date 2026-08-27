import { HTMLAttributes } from 'react'
import { cx } from './cx'

/**
 * Bloque de carga (mismo lenguaje visual en las 4 páginas): reemplaza los
 * "Cargando…" de texto plano heredados de `admin`/`mi-dashboard` por el
 * patrón de `rendicion`, ya con criterio documentado.
 */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx('rounded-2xl animate-pulse', className)}
      style={{ background: 'rgba(255,255,255,0.4)' }}
      aria-hidden="true"
      {...props}
    />
  )
}
