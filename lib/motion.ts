import type { Transition, Variants } from 'framer-motion'

// Vocabulario de movimiento de la app. Existe para que cada animación no
// invente sus propios números: lo que hace que una interfaz se sienta de una
// sola pieza no es que cada pantalla esté bien animada por separado, es que
// todas usen las mismas curvas y los mismos tiempos.
//
// Los valores dialogan con lo que ya vive en app/globals.css (.reveal usa
// cubic-bezier(0.22, 1, 0.36, 1)); acá se nombran para poder usarlos desde JS.

// ---------------------------------------------------------------------------
// Curvas
// ---------------------------------------------------------------------------

/**
 * Las curvas built-in de CSS (`ease`, `ease-out`) son demasiado suaves: no
 * tienen el arranque seco que hace que una animación se lea como intencional.
 * Estas son variantes fuertes de las mismas curvas.
 *
 * NUNCA `ease-in` en UI. Empieza lento, y lo lento está justo al principio,
 * que es el momento exacto en que la persona está mirando. Un dropdown con
 * ease-in a 200ms *se siente* más lento que uno con ease-out a 200ms, aunque
 * duren lo mismo.
 */
export const EASE = {
  /** Entradas y salidas. Arranca rápido: la interfaz responde de inmediato. */
  salida: [0.23, 1, 0.32, 1],
  /** Algo que se mueve de un punto a otro ya estando en pantalla. */
  entradaSalida: [0.77, 0, 0.175, 1],
} as const

// ---------------------------------------------------------------------------
// Duraciones
// ---------------------------------------------------------------------------

/**
 * Techo duro: 300ms para cualquier cosa que sea UI. Por encima de eso la
 * pantalla se siente pesada aunque la animación sea bonita.
 */
export const DURACION = {
  presion: 0.14,
  microestado: 0.2,
  /** Entrada escalonada del hero. Con 45ms entre elementos, el ultimo termina
   *  cerca de los 520ms: la entrada completa de una pantalla puede pasarse del
   *  techo de 300ms que rige para una interaccion puntual, pero cada elemento
   *  individual se mantiene por debajo. Si esto sube a 0.42 el ultimo llega a
   *  los 600ms y la pantalla ya se siente lenta. */
  entrada: 0.36,
} as const

// ---------------------------------------------------------------------------
// Resortes
// ---------------------------------------------------------------------------

/**
 * `visualDuration` + `bounce` en vez de mass/stiffness/damping. No es azúcar
 * sintáctica: `visualDuration` es el tiempo hasta que el elemento *llega* al
 * destino por primera vez, que es lo que uno percibe, mientras que la
 * `duration` clásica incluye el coleteo final que casi no se ve. Se puede
 * razonar sobre el número en vez de tantear.
 *
 * `bounce` bajo a propósito (0.1-0.2). El rebote es delicioso una vez y
 * molesto a la tercera; en una pantalla de trabajo se nota rápido.
 */
export const RESORTE = {
  /** Expansión y colapso del panel de detalle. Interrumpible a mitad de
   *  camino: si alguien abre una tarjeta y aprieta Escape enseguida, el
   *  resorte conserva la velocidad y revierte desde donde iba -- una
   *  animación por keyframes reiniciaría desde cero y se vería como un salto. */
  panel: { type: 'spring', visualDuration: 0.42, bounce: 0.16 },
  /** Feedback de presión. bounce 0 porque un botón que rebota al soltarlo
   *  se lee como un error, no como vida. */
  presion: { type: 'spring', visualDuration: 0.14, bounce: 0 },
} as const satisfies Record<string, Transition>

/**
 * Seguimiento del puntero (decorativo). Forma física clásica porque acá los
 * tres números importan y se compensan entre sí:
 *
 *   stiffness 90  — blando. El resplandor va DETRÁS del cursor en vez de
 *                   pegado a él; ese retraso es todo el efecto. Subirlo a 300
 *                   lo clava al puntero y deja de parecer que pesa.
 *   mass 0.7      — menos de 1: llega antes y no se pasa de largo.
 *   damping 20    — el que decide si oscila. Con esta combinación el factor
 *                   de amortiguación es ζ = 20 / (2·√(90·0.7)) = 1.26, o sea
 *                   ligeramente sobreamortiguado: frena y se detiene, no
 *                   vibra. Un adorno que vibra se lee como un bug.
 */
export const RESORTE_PUNTERO = { stiffness: 90, damping: 20, mass: 0.7 } as const

// ---------------------------------------------------------------------------
// Variantes reutilizables
// ---------------------------------------------------------------------------

/**
 * Orquesta a los hijos sin animarse a sí mismo. El escalonado es decorativo:
 * NUNCA bloquea la interacción -- los hijos ya están montados y son
 * clickeables desde el primer frame, solo se están pintando.
 *
 * 45ms entre elementos. Por debajo de ~30ms no se percibe el escalonado y da
 * lo mismo; por encima de ~80ms la última tarjeta llega tarde y la pantalla
 * parece lenta.
 */
export const contenedor: Variants = {
  oculto: {},
  visible: { transition: { staggerChildren: 0.045, delayChildren: 0.04 } },
}

/** Sube 12px y aparece. 12 y no 40: un desplazamiento grande en una entrada
 *  obliga al ojo a seguir el movimiento en vez de leer el contenido. */
export const item: Variants = {
  oculto: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: DURACION.entrada, ease: EASE.salida },
  },
}

/** Aparición sin desplazamiento, para lo que ya está en su lugar. */
export const fundido: Variants = {
  oculto: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: DURACION.microestado, ease: EASE.salida } },
}
