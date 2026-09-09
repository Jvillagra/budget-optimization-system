import { ButtonHTMLAttributes, MouseEvent, forwardRef } from 'react'
import { cx } from './cx'
import { soltarFocoDePuntero } from './foco'

export type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'danger' | 'ghost' | 'link' | 'inverso'
export type ButtonSize = 'sm' | 'md' | 'lg'

/** Sistema corporativo: la accion es verde bosque de marca (--marca, 6.69:1
 *  con texto papel encima) y el acento naranja se reserva para el paso
 *  decisivo de cada pantalla (confirmar la compra). El acento SIEMPRE lleva
 *  texto tinta encima: #e8862b con texto papel da 2.34:1 y no pasa AA.
 *
 *  `link` es para acciones de texto (reenviar correo, ver detalle, editar
 *  nombre): antes cada pantalla las escribia a mano con su propio subrayado.
 *  `inverso` es la unica variante pensada para ir sobre superficie oscura
 *  (lightbox de fotos, overlay sobre una imagen), donde el papel es el trazo
 *  y no el fondo. */
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'btn-solid btn-primary-solid text-[var(--papel)]',
  accent: 'btn-solid btn-accent-solid text-[var(--tinta)]',
  secondary: 'bg-transparent text-[var(--tinta)] border border-[var(--linea-fuerte)] hover:bg-[var(--papel-hueco)]',
  danger: 'bg-transparent text-[var(--alerta)] border border-[var(--alerta)]/40 hover:bg-[var(--alerta)]/8',
  ghost: 'bg-transparent text-[var(--tinta-70)] hover:bg-[var(--papel-hueco)]',
  link: 'btn-link bg-transparent text-[var(--marca-dark)] px-0 border-0',
  inverso: 'bg-[var(--papel)]/10 text-[var(--papel)] border border-[var(--papel)]/30 hover:bg-[var(--papel)]/20',
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'text-xs px-3.5 py-1.5 gap-1.5 min-h-[38px]',
  md: 'text-sm px-5 py-2.5 gap-2 min-h-[44px]',
  // lg es el paso decisivo en el celular en terreno: dedo con guante y vista
  // cansada. En escritorio no hace falta -- ahi se usa md.
  lg: 'text-[15px] px-6 py-3.5 gap-2 min-h-[52px]',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Ocupa el ancho disponible en movil y vuelve a su ancho natural desde sm.
   *  Un boton a ancho completo en escritorio se lee como una franja, no como
   *  un boton. */
  bloqueEnMovil?: boolean
  /** Muestra un spinner y bloquea el boton. El texto se mantiene visible:
   *  reemplazarlo por "Cargando..." hace saltar el ancho del boton. */
  cargando?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', className, bloqueEnMovil, cargando, disabled, children, onClick, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || cargando}
      onClick={(e: MouseEvent<HTMLButtonElement>) => { onClick?.(e); soltarFocoDePuntero(e) }}
      aria-busy={cargando || undefined}
      className={cx(
        'btn-base inline-flex items-center justify-center rounded-[6px] font-semibold tracking-[0.01em]',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        VARIANT_CLASSES[variant],
        variant === 'link' ? 'gap-1.5 min-h-[44px]' : SIZE_CLASSES[size],
        bloqueEnMovil && 'w-full sm:w-auto',
        className
      )}
      {...props}
    >
      {cargando && <span className="btn-spinner" aria-hidden />}
      {children}
    </button>
  )
})
