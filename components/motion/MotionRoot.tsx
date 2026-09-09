'use client'

import { MotionConfig } from 'framer-motion'
import type { ReactNode } from 'react'

/**
 * Red de seguridad de accesibilidad para todo el subárbol.
 *
 * `reducedMotion="user"` hace que Framer, cuando el sistema pide movimiento
 * reducido, ignore las animaciones de transform (x, y, scale, rotate) y deje
 * pasar solo las de opacidad. Eso cubre las variantes compartidas de
 * lib/motion.ts sin que cada componente tenga que acordarse.
 *
 * No reemplaza al `useReducedMotion()` de cada componente: eso se usa para
 * decisiones estructurales que una config global no puede tomar -- apagar el
 * seguimiento del puntero, o no usar layoutId para que el panel de detalle
 * aparezca en su lugar en vez de viajar desde la tarjeta.
 */
export function MotionRoot({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>
}
