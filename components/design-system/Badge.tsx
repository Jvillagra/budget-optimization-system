import { HTMLAttributes } from 'react'
import { cx } from './cx'

export type BadgeTone = 'solido' | 'verde' | 'terracota' | 'hueco' | 'neutral' | 'error'

/** Los tonos se nombran por como se ven, no por lo que significan: el
 *  significado lo pone quien llama. El set anterior heredaba los nombres del
 *  sistema editorial ('verde', 'cafe') pero los habia remapeado a otros
 *  colores, asi que `tone="verde"` pintaba NARANJA y `tone="cafe"` pintaba
 *  beige neutro. En /rendicion eso hacia que Invernadero saliera naranja y
 *  Cierre Perimetral beige, contradiciendo el codigo de color que usa el
 *  resto de la app (SEG_COLOR, TagSegmento, el borde superior de cada panel).
 *
 *  Regla vigente desde 2026-09-09: el naranja --acento identifica UNA sola
 *  cosa, la accion decisiva (el boton "marcar como comprado"). Ningun badge
 *  lo usa, porque un badge nunca es una accion.
 *
 *  Jerarquia: `solido` es el unico con fondo saturado y se reserva para el
 *  estado alcanzado; los tonos de proyecto van suaves para que no compitan
 *  con el en la misma tarjeta. */
const TONE_CLASSES: Record<BadgeTone, string> = {
  solido: 'bg-[var(--marca)] text-[var(--papel)]',
  verde: 'bg-[var(--marca-hueco)] text-[var(--marca-dark)]',
  terracota: 'bg-[var(--marca-calida-hueco)] text-[var(--cafe-dark)]',
  hueco: 'bg-[var(--papel-hueco)] text-[var(--tinta-70)]',
  neutral: 'border border-[var(--linea)] text-[var(--tinta-70)]',
  error: 'bg-[var(--alerta)]/10 text-[var(--alerta)]',
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
