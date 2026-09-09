import { ButtonHTMLAttributes, MouseEvent, forwardRef } from 'react'
import { cx } from './cx'
import { soltarFocoDePuntero } from './foco'

export type IconButtonTone = 'neutro' | 'peligro' | 'inverso'

/** Boton de solo icono: cerrar una hoja, borrar una fila, quitar una foto.
 *  Estaban escritos a mano en cinco pantallas, cada uno con su tamano y su
 *  fondo -- y varios por debajo del target de 44px que exige el uso en
 *  terreno. Aca el area tactil es siempre 44px aunque el circulo visible sea
 *  mas chico: el padding es parte del boton, no del icono. */
const TONE_CLASSES: Record<IconButtonTone, string> = {
  neutro: 'text-[var(--tinta-70)] hover:bg-[var(--papel-hueco)] hover:text-[var(--tinta)]',
  peligro: 'text-[var(--alerta)] hover:bg-[var(--alerta)]/10',
  inverso: 'text-[var(--papel)]/85 hover:bg-[var(--papel)]/15 hover:text-[var(--papel)]',
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: IconButtonTone
  /** Obligatorio: un boton sin texto necesita nombre accesible. */
  'aria-label': string
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { tone = 'neutro', className, type = 'button', onClick, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      onClick={(e: MouseEvent<HTMLButtonElement>) => { onClick?.(e); soltarFocoDePuntero(e) }}
      className={cx(
        'btn-base inline-flex items-center justify-center rounded-full',
        'h-11 w-11 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed',
        TONE_CLASSES[tone],
        className
      )}
      {...props}
    />
  )
})
