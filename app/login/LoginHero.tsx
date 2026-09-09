'use client'

import Image from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring, useTransform,
} from 'framer-motion'
import { contenedor, item, RESORTE_PUNTERO } from '@/lib/motion'

// Identidad de la pantalla. Lo que antes vivía apretado arriba de la tarjeta
// de login (logo + eyebrow + título) pasa acá y respira.
//
// El seguimiento del puntero NO es un resplandor: globals.css es explícito en
// que este sistema separa superficies con una línea de 1px y no con
// profundidad falsa ("sin blur ni sombras de color"). Así que la profundidad
// se construye con el material que el sistema ya tiene -- el título y los
// filetes se mueven a distinta velocidad. Paralaje, no brillo.

const CONSULTA_HOVER = '(hover: hover) and (pointer: fine)'
/** Amplitud en px. Deliberadamente diminuta: el paralaje se tiene que sentir,
 *  no ver. Si se nota que los elementos se mueven, ya es un efecto y compite
 *  con el formulario, que es lo que la persona vino a hacer. */
const AMPLITUD_TITULO = 6
const AMPLITUD_FILETE = 14

function usePunteroFino() {
  const [fino, setFino] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(CONSULTA_HOVER)
    const aplicar = () => setFino(mq.matches)
    aplicar()
    mq.addEventListener('change', aplicar)
    return () => mq.removeEventListener('change', aplicar)
  }, [])
  return fino
}

export function LoginHero() {
  const reducido = useReducedMotion()
  const punteroFino = usePunteroFino()
  const activo = punteroFino && !reducido
  const ref = useRef<HTMLDivElement>(null)

  // -1..1 respecto del centro del bloque, no coordenadas absolutas: así la
  // amplitud no depende del tamaño de la pantalla.
  const px = useMotionValue(0)
  const py = useMotionValue(0)

  // Sin resorte, atar una transformación a la posición del mouse se siente
  // artificial: el elemento está clavado al cursor y no tiene inercia. El
  // resorte le pone masa. Ver RESORTE_PUNTERO en lib/motion.ts para por qué
  // estos tres números y no otros.
  const sx = useSpring(px, RESORTE_PUNTERO)
  const sy = useSpring(py, RESORTE_PUNTERO)

  // Un solo par de resortes, dos amplitudes derivadas: las dos capas comparten
  // la misma física y solo difieren en cuánto recorren. Si cada capa tuviera
  // su propio resorte podrían desincronizarse y el paralaje se leería como
  // dos animaciones sueltas en vez de una escena con profundidad.
  const tituloX = useTransform(sx, v => v * AMPLITUD_TITULO)
  const tituloY = useTransform(sy, v => v * AMPLITUD_TITULO)
  const fileteX = useTransform(sx, v => v * AMPLITUD_FILETE)
  const fileteY = useTransform(sy, v => v * AMPLITUD_FILETE)

  // `transform` como string y no las props `x`/`y` de Framer: las shorthand
  // se interpolan en el hilo principal con requestAnimationFrame, así que
  // pierden frames justo cuando el navegador está ocupado hidratando la
  // página -- que es exactamente cuando esta pantalla se está pintando.
  const transformTitulo = useMotionTemplate`translate3d(${tituloX}px, ${tituloY}px, 0)`
  const transformFilete = useMotionTemplate`translate3d(${fileteX}px, ${fileteY}px, 0)`

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const nx = (e.clientX - r.left) / r.width - 0.5
    const ny = (e.clientY - r.top) / r.height - 0.5
    px.set(nx * 2)
    py.set(ny * 2)
  }, [px, py])

  // Volver al centro al salir: si se queda donde estaba, la próxima entrada
  // del puntero arranca con un salto.
  const onPointerLeave = useCallback(() => { px.set(0); py.set(0) }, [px, py])

  return (
    <motion.div
      ref={ref}
      variants={contenedor}
      initial="oculto"
      animate="visible"
      onPointerMove={activo ? onPointerMove : undefined}
      onPointerLeave={activo ? onPointerLeave : undefined}
      className="flex flex-col gap-6"
    >
      <motion.div variants={item}>
        <Image src="/logo.png" alt="" width={48} height={48} className="rounded-[4px]" priority />
      </motion.div>

      <motion.div variants={item} className="flex flex-col gap-3">
        <p className="eyebrow">Comunidad Pedro Huisca</p>
        <motion.h1
          className="titulo-xl"
          style={activo ? { transform: transformTitulo, willChange: 'transform' } : undefined}
        >
          Proyecto <em>PAT.</em>
        </motion.h1>
      </motion.div>

      {/* El filete se mueve más que el título: distinta velocidad = distinta
          profundidad. Es el mismo truco de un decorado de teatro. */}
      <motion.div
        variants={item}
        aria-hidden
        className="h-px w-full origin-left"
        style={{
          background: 'var(--linea-fuerte)',
          ...(activo ? { transform: transformFilete, willChange: 'transform' } : {}),
        }}
      />

      <motion.p variants={item} className="max-w-md text-base leading-relaxed" style={{ color: 'var(--tinta-70)' }}>
        Programa de Acción Territorial. Acá cada socio ve su presupuesto, sube
        los comprobantes de su compra y la comunidad compara proveedores antes
        de gastar.
      </motion.p>
    </motion.div>
  )
}
