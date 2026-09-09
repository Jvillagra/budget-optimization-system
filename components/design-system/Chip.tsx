import { ButtonHTMLAttributes, MouseEvent, forwardRef } from 'react'
import { cx } from './cx'
import { soltarFocoDePuntero } from './foco'

/** Chip de filtro o de eleccion dentro de un grupo (filtros de socios,
 *  proveedor en /mi-dashboard, leyenda de los graficos). Es un control con
 *  estado, no un boton de accion: por eso lleva aria-pressed y no comparte
 *  las superficies solidas de Button.
 *
 *  Activo = relleno de marca con texto papel (6.69:1). Inactivo = solo linea.
 *  No hay un tercer estado de color: pintar el inactivo de gris tenue era lo
 *  que hacia ilegible el grupo en el celular. */
export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  activo: boolean
}

export const Chip = forwardRef<HTMLButtonElement, ChipProps>(function Chip(
  { activo, className, type = 'button', onClick, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-pressed={activo}
      onClick={(e: MouseEvent<HTMLButtonElement>) => { onClick?.(e); soltarFocoDePuntero(e) }}
      className={cx(
        'btn-base inline-flex items-center justify-center gap-2 rounded-full border',
        'px-4 min-h-[40px] text-xs font-semibold tracking-[0.01em]',
        activo
          ? 'bg-[var(--marca)] text-[var(--papel)] border-[var(--marca)]'
          : 'bg-transparent text-[var(--tinta-70)] border-[var(--linea-fuerte)] hover:bg-[var(--papel-hueco)] hover:text-[var(--tinta)]',
        className
      )}
      {...props}
    />
  )
})
