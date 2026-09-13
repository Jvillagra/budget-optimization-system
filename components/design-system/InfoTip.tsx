'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { HelpCircle } from 'lucide-react'
import { soltarFocoDePuntero } from './foco'

export interface InfoTipProps {
  /** Que explica, en una frase. Es lo que lee Maria Ines en terreno. */
  children: React.ReactNode
  /** Se anuncia en el boton: "Que significa <etiqueta>". */
  etiqueta: string
}

const ANCHO_MAX = 272   // 17rem
const MARGEN = 16       // aire minimo contra el borde de la pantalla

/** Ayuda contextual para la pantalla que mas se usa. Se ABRE AL TOCAR, no al
 *  pasar el mouse: la app se usa en celular en terreno, y un `title=` nativo
 *  no existe para un dedo. Por eso tampoco es un tooltip de hover.
 *
 *  El boton no se anida nunca dentro de otro control -- los cuatro cuadros de
 *  estado del panel de avance YA son botones de filtro, asi que la ayuda vive
 *  en el encabezado del panel y explica los cuatro de una vez, en vez de meter
 *  un control dentro de otro (HTML invalido, y ademas robaria el toque al
 *  filtro).
 *
 *  El panel va en un PORTAL a <body> y no como hijo del boton. Dos razones, y
 *  la segunda costo encontrarla: (1) dentro de la tarjeta lo recortaria
 *  cualquier contenedor con overflow; (2) `.glass` lleva `backdrop-filter`, y
 *  un elemento con backdrop-filter se vuelve BLOQUE CONTENEDOR de sus
 *  descendientes `fixed` -- asi que un `position: fixed` ahi adentro se
 *  posiciona contra la tarjeta, no contra la pantalla, y el panel se salia
 *  por el borde derecho con el texto cortado. */
export function InfoTip({ children, etiqueta }: InfoTipProps) {
  const [abierto, setAbierto] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number; ancho: number } | null>(null)
  const id = useId()
  const boton = useRef<HTMLButtonElement>(null)
  const nota = useRef<HTMLDivElement>(null)

  const ubicar = () => {
    const r = boton.current?.getBoundingClientRect()
    if (!r) return
    const ancho = Math.min(ANCHO_MAX, window.innerWidth - MARGEN * 2)
    const left = Math.min(Math.max(MARGEN, r.left), window.innerWidth - ancho - MARGEN)
    setPos({ top: r.bottom + 6, left, ancho })
  }

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => {
      const t = e.target as Node
      // La nota vive en un portal: no es descendiente del boton, asi que hay
      // que preguntarle a las dos por separado.
      if (!boton.current?.contains(t) && !nota.current?.contains(t)) setAbierto(false)
    }
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false) }
    // Con position:fixed la ayuda no acompana el scroll: se cierra.
    const cerrar = () => setAbierto(false)
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', escape)
    window.addEventListener('scroll', cerrar, true)
    window.addEventListener('resize', cerrar)
    return () => {
      document.removeEventListener('mousedown', fuera)
      document.removeEventListener('keydown', escape)
      window.removeEventListener('scroll', cerrar, true)
      window.removeEventListener('resize', cerrar)
    }
  }, [abierto])

  return (
    <span className="relative inline-flex align-middle no-print">
      <button
        ref={boton}
        type="button"
        aria-label={`Qué significa ${etiqueta}`}
        aria-expanded={abierto}
        aria-controls={id}
        onClick={e => { soltarFocoDePuntero(e); if (!abierto) ubicar(); setAbierto(v => !v) }}
        // 44px de area tactil aunque el icono mida 16: es el minimo que
        // acierta un dedo. El margen negativo evita que ese area empuje la
        // linea de texto donde va la ayuda.
        className="btn-base inline-flex items-center justify-center w-11 h-11 -my-3 -mx-3 rounded-full"
        style={{ color: 'var(--tinta-70)' }}
      >
        <HelpCircle size={16} aria-hidden />
      </button>
      {abierto && pos && createPortal(
        <div
          ref={nota}
          id={id}
          role="note"
          className="fixed z-50 rounded-[6px] p-3 text-xs font-normal normal-case tracking-normal leading-relaxed no-print"
          style={{
            top: pos.top,
            left: pos.left,
            width: pos.ancho,
            background: 'var(--papel-claro)',
            border: '1px solid var(--linea-fuerte)',
            color: 'var(--tinta)',
            boxShadow: '0 8px 24px -8px rgba(31, 36, 25, 0.35)',
          }}
        >
          {children}
        </div>,
        document.body
      )}
    </span>
  )
}
