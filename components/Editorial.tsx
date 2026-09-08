'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Revela su contenido al entrar al viewport: opacity + translateY(22px) en
 * 0.75s. El estado inicial (oculto) vive en .reveal de globals.css para que
 * no haya un parpadeo de contenido visible antes de hidratar, y ahi mismo se
 * neutraliza con prefers-reduced-motion.
 *
 * Se desconecta despues del primer disparo: es una entrada, no un efecto que
 * deba repetirse al hacer scroll hacia arriba.
 */
export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    // Sin IntersectionObserver (o si el elemento ya nacio en pantalla en un
    // navegador que no lo soporta) el contenido se muestra igual: nunca
    // dejar contenido invisible por un fallo del observador.
    if (typeof IntersectionObserver === 'undefined') {
      // Diferido a propósito: un setState síncrono dentro del efecto encadena
      // un render extra (y lo marca react-hooks/set-state-in-effect).
      const t = setTimeout(() => setVisible(true), 0)
      return () => clearTimeout(t)
    }
    const obs = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting) {
          setVisible(true)
          obs.disconnect()
        }
      },
      { rootMargin: '0px 0px -8% 0px' }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={className ? `reveal ${className}` : 'reveal'}
      data-visible={visible ? 'true' : 'false'}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  )
}

/**
 * Encabezado de pantalla del sistema editorial: numero de seccion + nombre
 * en mayusculas chicas, y debajo el titulo grande. Reemplaza a los <h1>
 * en negrita de 24px del diseno anterior.
 */
export function PageHeader({
  eyebrow,
  titulo,
  bajada,
  acciones,
}: {
  eyebrow: string
  titulo: ReactNode
  bajada?: ReactNode
  acciones?: ReactNode
}) {
  return (
    <header className="pb-6 mb-6" style={{ borderBottom: '1px solid var(--linea)' }}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <p className="eyebrow mb-3">{eyebrow}</p>
          <h1 className="titulo-lg">{titulo}</h1>
          {bajada && (
            <p className="mt-4 text-sm max-w-[52ch]" style={{ color: 'var(--tinta-70)' }}>
              {bajada}
            </p>
          )}
        </div>
        {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
      </div>
    </header>
  )
}
