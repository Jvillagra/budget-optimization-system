'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/** Limpia el Router Cache de Next en cuanto la app escribe algo.
 *
 *  ## Por qué existe
 *
 *  Los links del menú precargan la pantalla destino COMPLETA, datos
 *  incluidos (`prefetch={true}` en components/Navbar.tsx). Eso es lo que
 *  bajó cada navegación de 425-526 ms a ~60 ms: la persona está en Chile y
 *  la función corre en Washington, así que el único arreglo posible para ese
 *  viaje es hacerlo antes de que haga falta.
 *
 *  El precio es que lo precargado se reutiliza 5 minutos. Sin nada más, esto
 *  pasaría: María Inés agrega una malla al carrito en /beneficiarios, toca
 *  "Rendición", y ve el total de antes -- porque esa pantalla se precargó
 *  hace dos minutos y Next la sirve de memoria sin preguntarle al servidor.
 *  Un número que aparece distinto en dos pantallas es exactamente el bug que
 *  definió este proyecto (ver el proveedor de Marcia Catrilef en PRODUCT.md).
 *  No es un detalle de rendimiento: es correctitud.
 *
 *  ## Qué hace exactamente, y por qué no basta `router.refresh()`
 *
 *  Medido, no supuesto: `router.refresh()` re-renderiza la pantalla en la
 *  que estás parado, pero NO bota lo que ya se precargó de las OTRAS rutas.
 *  Con el interceptor puesto y solo `refresh()`, escribir y tocar "Socios"
 *  seguía resolviéndose en 67 ms sin una sola petición al servidor -- o sea
 *  con los datos de antes de escribir.
 *
 *  Así que además se avisa a los links del menú, que se vuelven a montar y
 *  disparan un prefetch nuevo: ese sobrescribe la entrada del caché con
 *  datos frescos. Los dos hacen falta -- `refresh()` por la pantalla actual,
 *  el re-prefetch por las demás.
 *
 *  ## Por qué interceptando fetch y no llamando a mano
 *
 *  Las escrituras son ~14, repartidas en 7 pantallas, y todas tienen la
 *  misma forma: `fetch('/api/...', { method: 'POST' | 'PATCH' | 'DELETE' })`.
 *  Poner una llamada después de cada una funciona hasta que alguien agregue
 *  la escritura número 15 y se olvide -- y entonces el bug vuelve callado,
 *  con la app mostrando dos cifras distintas y ningún error en consola.
 *
 *  Acá el gancho es uno solo y cubre lo que todavía no está escrito: la
 *  pestaña de reporte, la pantalla que venga después. Es un parche sobre
 *  `window.fetch`, que no es bonito, y esa fealdad es el precio de que no se
 *  pueda olvidar.
 *
 *  ## Detalles que importan
 *
 *  - Solo escrituras a `/api/` de esta misma app, y solo si el servidor
 *    respondió OK: un 4xx/5xx no cambió nada, y refrescar ahí sería pedirle
 *    al servidor una página idéntica por gusto.
 *  - `/api/auth/*` y `/api/vision` quedan fuera: login, logout y el OCR de
 *    boletas no tocan ningún dato de negocio. El logout además navega duro a
 *    /login, y un refresh a medio camino no tiene a quién refrescar.
 *  - Envuelve una sola vez y restaura el `fetch` original al desmontarse,
 *    para no encadenar parches si React vuelve a montar el provider (Strict
 *    Mode en desarrollo lo hace siempre).
 */

const RUTAS_SIN_DATOS = ['/api/auth/', '/api/vision']

/** Avisa a quien dependa de datos precargados que quedaron viejos. Un
 *  EventTarget de módulo y no un contexto de React: lo escucha la barra de
 *  navegación, que vive en el layout raíz, y lo dispara cualquier pantalla
 *  sin tener que pasarse nada entre medio. */
const bus = new EventTarget()
const EVENTO = 'datos-mutados'

export function avisarDatosMutados() {
  bus.dispatchEvent(new Event(EVENTO))
}

/** Ejecuta `fn` cada vez que la app escribe algo. `fn` debe ser estable. */
export function useAlMutarDatos(fn: () => void) {
  useEffect(() => {
    bus.addEventListener(EVENTO, fn)
    return () => bus.removeEventListener(EVENTO, fn)
  }, [fn])
}

function esEscrituraDeDatos(input: RequestInfo | URL, init?: RequestInit): boolean {
  const metodo = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
  if (metodo === 'GET' || metodo === 'HEAD') return false

  const crudo = input instanceof Request ? input.url : input.toString()
  // Las llamadas de la app son relativas ('/api/...'); `URL` necesita base.
  let ruta: string
  try {
    const u = new URL(crudo, window.location.origin)
    if (u.origin !== window.location.origin) return false
    ruta = u.pathname
  } catch {
    return false
  }

  if (!ruta.startsWith('/api/')) return false
  return !RUTAS_SIN_DATOS.some(p => ruta.startsWith(p))
}

export function InvalidarDatosAlEscribir() {
  const router = useRouter()

  useEffect(() => {
    const original = window.fetch

    window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
      const res = await original.call(window, input, init)
      // La respuesta se devuelve tal cual y el refresh se dispara aparte: no
      // debe sumarle ni un milisegundo a lo que la pantalla está esperando.
      if (res.ok && esEscrituraDeDatos(input, init)) {
        router.refresh()      // la pantalla actual
        avisarDatosMutados()  // lo precargado de las demás
      }
      return res
    }

    return () => {
      window.fetch = original
    }
  }, [router])

  return null
}
