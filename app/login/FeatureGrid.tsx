'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ClipboardList, Calculator, Tag, ShoppingBag, FileText, ShieldCheck } from 'lucide-react'
import { contenedor, item, fundido, RESORTE, DURACION, EASE } from '@/lib/motion'

// Qué hace la plataforma, para quien cae en /login sin saberlo. El contenido
// es el producto real, no relleno: cada tarjeta es una pantalla que existe.

type Funcion = {
  id: string
  titulo: string
  resumen: string
  detalle: string
  icon: typeof ClipboardList
}

const FUNCIONES: Funcion[] = [
  {
    id: 'rendicion',
    titulo: 'Rendición',
    resumen: 'Comprobantes de compra con foto, socio por socio.',
    detalle: 'Cada socio sube las fotos de su boleta desde el celular. El staff ve el avance de toda la comunidad en una sola pantalla y marca la compra como completa cuando están las tres. Si después se borra un comprobante, el estado vuelve solo hacia atrás.',
    icon: ClipboardList,
  },
  {
    id: 'simulador',
    titulo: 'Simulador',
    resumen: 'Compara hasta tres proveedores antes de gastar.',
    detalle: 'Toma la ayuda memoria de cada socio y calcula, con los precios de cada proveedor, cuántos materiales alcanza a comprar la comunidad entera. El que rinde más gana. Es una simulación: no toca el carrito de nadie.',
    icon: Calculator,
  },
  {
    id: 'precios',
    titulo: 'Precios',
    resumen: 'Catálogo por proveedor, editable en el momento.',
    detalle: 'Los precios cambian entre una cotización y la compra. Acá se actualizan sin pasar por nadie, y quedan congelados en la compra ya confirmada para que la rendición no se mueva cuando el precio sí.',
    icon: Tag,
  },
  {
    id: 'mi-compra',
    titulo: 'Mi compra',
    resumen: 'Cada socio ve su presupuesto y en qué lo gastó.',
    detalle: 'El total de la compra, cuánto queda del presupuesto y cuánto salió del bolsillo. Sin planillas compartidas ni preguntar por WhatsApp cuánto le tocaba.',
    icon: ShoppingBag,
  },
  {
    id: 'informe',
    titulo: 'Informe',
    resumen: 'El PDF para la consultora, generado solo.',
    detalle: 'Un documento con el detalle por socio, los materiales asignados y los comprobantes. Se genera desde los mismos datos que ve la comunidad, así que no hay dos versiones de la verdad.',
    icon: FileText,
  },
  {
    id: 'acceso',
    titulo: 'Acceso',
    resumen: 'Sin contraseñas. Un link al correo y listo.',
    detalle: 'Cada persona entra con un link de un solo uso, o con un código de seis dígitos si el link se abre en otro dispositivo. Quién ve qué lo define su rol, y todo cambio queda registrado.',
    icon: ShieldCheck,
  },
]

export function FeatureGrid() {
  const reducido = useReducedMotion()
  const [abierta, setAbierta] = useState<Funcion | null>(null)
  // Para devolver el foco a la tarjeta de origen al cerrar: si el foco se
  // pierde al fondo del documento, quien navega con teclado tiene que
  // recorrer la página entera para volver a donde estaba.
  const origen = useRef<HTMLButtonElement | null>(null)
  const panel = useRef<HTMLDivElement>(null)

  const cerrar = useCallback(() => {
    setAbierta(null)
    origen.current?.focus()
  }, [])

  useEffect(() => {
    if (!abierta) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar() }
    document.addEventListener('keydown', onKey)
    panel.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [abierta, cerrar])

  // Con movimiento reducido no hay transición de elemento compartido: el
  // panel no viaja desde la tarjeta, aparece con un fundido. Se conserva la
  // información (de dónde salió lo dice el contenido), se saca el recorrido.
  const compartido = (id: string) => (reducido ? {} : { layoutId: id })

  return (
    <>
      <motion.ul
        variants={contenedor}
        initial="oculto"
        animate="visible"
        className="grid grid-cols-1 sm:grid-cols-2 gap-3"
      >
        {FUNCIONES.map(f => {
          const Icon = f.icon
          return (
            <motion.li key={f.id} variants={item}>
              {/* whileTap en vez de :active en CSS para que la escala use el
                  mismo resorte que el resto de la pantalla. */}
              <motion.button
                type="button"
                {...compartido(`tarjeta-${f.id}`)}
                onClick={e => { origen.current = e.currentTarget as HTMLButtonElement; setAbierta(f) }}
                whileTap={reducido ? undefined : { scale: 0.985 }}
                transition={RESORTE.presion}
                aria-expanded={abierta?.id === f.id}
                aria-label={`${f.titulo}: ${f.resumen}`}
                className="glass w-full h-full rounded-[6px] p-4 text-left flex flex-col gap-2"
              >
                <motion.span {...compartido(`icono-${f.id}`)} className="inline-flex" style={{ color: 'var(--marca)' }}>
                  <Icon size={18} strokeWidth={2} />
                </motion.span>
                <motion.span {...compartido(`titulo-${f.id}`)} className="text-sm font-semibold" style={{ color: 'var(--tinta)' }}>
                  {f.titulo}
                </motion.span>
                <span className="text-xs leading-relaxed" style={{ color: 'var(--tinta-70)' }}>
                  {f.resumen}
                </span>
              </motion.button>
            </motion.li>
          )
        })}
      </motion.ul>

      <AnimatePresence>
        {abierta && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
            {/* Solo opacidad: el telón nunca se mueve ni se escala. */}
            <motion.div
              variants={fundido}
              initial="oculto"
              animate="visible"
              exit="oculto"
              onClick={cerrar}
              // Mismo valor que components/design-system/ConfirmDialog.tsx: la
              // app ya tiene un telon y este tiene que ser ese, no uno nuevo.
              className="absolute inset-0 bg-[rgba(23,24,21,0.55)]"
            />

            <motion.div
              ref={panel}
              role="dialog"
              aria-modal="true"
              aria-labelledby={`panel-titulo-${abierta.id}`}
              tabIndex={-1}
              {...compartido(`tarjeta-${abierta.id}`)}
              // Sin layoutId (movimiento reducido) el panel necesita su propia
              // entrada. NUNCA desde scale(0): nada en el mundo real aparece
              // de la nada. 0.97 ya tiene forma.
              initial={reducido ? { opacity: 0, scale: 0.97 } : false}
              animate={reducido ? { opacity: 1, scale: 1 } : undefined}
              exit={reducido ? { opacity: 0, scale: 0.97 } : undefined}
              transition={reducido ? { duration: DURACION.microestado, ease: EASE.salida } : RESORTE.panel}
              className="glass-strong relative w-full max-w-lg rounded-[6px] p-6 flex flex-col gap-4 outline-none"
            >
              <motion.span {...compartido(`icono-${abierta.id}`)} className="inline-flex" style={{ color: 'var(--marca)' }}>
                <abierta.icon size={22} strokeWidth={2} />
              </motion.span>

              <motion.h2
                id={`panel-titulo-${abierta.id}`}
                {...compartido(`titulo-${abierta.id}`)}
                className="titulo-md"
              >
                {abierta.titulo}
              </motion.h2>

              {/* El cuerpo no participa del elemento compartido: no existe en
                  la tarjeta, así que entra por su cuenta y con un pelo de
                  retraso, cuando el panel ya casi terminó de crecer. Si entra
                  al mismo tiempo, el texto se lee mientras se deforma. */}
              <motion.p
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0, transition: { delay: 0.12, duration: DURACION.microestado, ease: EASE.salida } }}
                exit={{ opacity: 0, transition: { duration: 0.1 } }}
                className="text-sm leading-relaxed"
                style={{ color: 'var(--tinta-70)' }}
              >
                {abierta.detalle}
              </motion.p>

              <motion.button
                type="button"
                onClick={cerrar}
                whileTap={reducido ? undefined : { scale: 0.97 }}
                transition={RESORTE.presion}
                className="self-start text-xs font-semibold underline underline-offset-2 min-h-[44px]"
                style={{ color: 'var(--tinta-70)' }}
              >
                Cerrar
              </motion.button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  )
}
