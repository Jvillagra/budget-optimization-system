'use client'

import { motion, useReducedMotion, type HTMLMotionProps } from 'framer-motion'
import { RESORTE } from '@/lib/motion'

// Feedback táctil. Es la animación más barata y la que más se nota: sin ella
// la interfaz parece que no escuchó el toque, sobre todo en un celular donde
// no hay hover que confirme nada antes del tap.
//
// 0.97 y no 0.9: la escala tiene que ser una insinuación. Si se ve el botón
// achicarse, ya es demasiado. El límite práctico está entre 0.95 y 0.98.
//
// El hover va detrás de `(hover: hover) and (pointer: fine)`: en pantallas
// táctiles el navegador dispara :hover al tocar y el estado queda pegado
// después de soltar. Framer no expone esa media query, así que el hover se
// resuelve con `whileHover` solo cuando el dispositivo lo soporta de verdad.

const CONSULTA_HOVER = '(hover: hover) and (pointer: fine)'

export type PressableProps = HTMLMotionProps<'button'> & {
  /** Escala en :active. Entre 0.95 y 0.98. */
  presion?: number
  /** Escala en hover, solo en dispositivos con puntero fino. */
  elevacion?: number
}

export function Pressable({ presion = 0.97, elevacion, children, ...props }: PressableProps) {
  const reducido = useReducedMotion()

  // Con prefers-reduced-motion no se elimina el feedback, se cambia de canal:
  // la escala desaparece y queda la transición de color/opacidad que el
  // propio botón ya trae. Movimiento reducido significa menos movimiento, no
  // una interfaz muda.
  if (reducido) return <motion.button {...props}>{children}</motion.button>

  const puedeHover = typeof window !== 'undefined' && window.matchMedia(CONSULTA_HOVER).matches

  return (
    <motion.button
      whileTap={{ scale: presion }}
      whileHover={puedeHover && elevacion ? { scale: elevacion } : undefined}
      transition={RESORTE.presion}
      {...props}
    >
      {children}
    </motion.button>
  )
}
