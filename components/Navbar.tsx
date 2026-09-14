'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useAlMutarDatos } from '@/lib/invalidar-datos'
import {
  Download, LogOut, ClipboardList, Users, Tag, Calculator, ShieldCheck, ShoppingBag,
} from 'lucide-react'
import { Button, IconButton, soltarFocoDePuntero } from '@/components/design-system'

// "Resumen" (ex /vista-resumen) se consolidó como sub-tab dentro de
// /rendicion -- ver components/VistaResumenContent.tsx -- para que la barra
// mobile (6 tabs no entraban en una pantalla chica, obligando a deslizar
// para llegar a Admin) quede en 5.
// `corto` es la etiqueta de la barra inferior: ahí cada tab tiene ~60px en un
// celular chico y "Beneficiarios" se cortaba a "Benefi…", que no se entiende.
//
// `chunk` precarga el JS de la pantalla destino en cuanto la persona muestra
// intención de ir (hover en desktop, primer contacto del dedo en mobile).
// El <Link> de Next ya prefetchea el RSC, pero en una ruta dinámica con
// loading.tsx solo llega hasta ese esqueleto: el bundle del componente de
// página se descarga recién al navegar, y eso era el salto en blanco al
// cambiar de pestaña. Un import() dinámico sí baja exactamente ese chunk y
// lo deja en caché, sin sumar nada al bundle de la barra.
const STAFF_LINKS = [
  { href: '/rendicion', label: 'Rendición', corto: 'Rendición', icon: ClipboardList, chunk: () => import('@/app/rendicion/RendicionClient') },
  { href: '/beneficiarios', label: 'Beneficiarios', corto: 'Socios', icon: Users, chunk: () => import('@/app/beneficiarios/BeneficiariosClient') },
  { href: '/precios', label: 'Precios', corto: 'Precios', icon: Tag, chunk: () => import('@/app/precios/PreciosClient') },
  { href: '/simulador', label: 'Simulador', corto: 'Simular', icon: Calculator, chunk: () => import('@/app/simulador/SimuladorClient') },
  { href: '/admin', label: 'Admin', corto: 'Admin', icon: ShieldCheck, chunk: () => import('@/app/admin/AdminClient') },
]
const SOCIO_LINKS = [{ href: '/mi-dashboard', label: 'Mi compra', corto: 'Mi compra', icon: ShoppingBag, chunk: () => import('@/app/mi-dashboard/MiDashboardClient') }]

/** Devuelve el handler de precarga para un link. Una sola vez por destino:
 *  el segundo hover ya no dispara nada. Un fallo (offline, chunk viejo tras
 *  un deploy) se ignora a propósito -- la navegación normal lo reintenta.
 *
 *  Precarga solo el JS de la pantalla destino, que es una espera distinta de
 *  la de los datos: el prefetch del <Link> en estas rutas (`force-dynamic`
 *  con `loading.tsx`) llega solo hasta ese esqueleto, así que el bundle del
 *  componente de página se bajaba recién al navegar. Los DATOS los precarga
 *  `usePrefetchEscalonado`, y en otro momento: acá es demasiado tarde. */
function usePrecargaEnIntencion() {
  const yaPedidos = useRef<Set<string>>(new Set())
  return (href: string, chunk: () => Promise<unknown>) => {
    if (yaPedidos.current.has(href)) return
    yaPedidos.current.add(href)
    chunk().catch(() => {})
  }
}

/** Habilita el prefetch COMPLETO de los links del menú de a uno, en reposo.
 *  Devuelve cuántos links (en orden) ya pueden precargar sus datos.
 *
 *  Esta es la espera grande: la función de Vercel corre en iad1 y quien usa
 *  la app está en Chile, así que CADA navegación paga un viaje de ida y
 *  vuelta a Washington -- medido en 425-525 ms, idéntico la segunda vez
 *  porque hoy no se cachea nada. Las consultas a Supabase NO son el cuello
 *  (la base está en us-east-1, al lado de la función): es el viaje, y un
 *  viaje solo se arregla haciéndolo antes de que haga falta.
 *
 *  Por qué en reposo y no en el hover/touch del link, que sería lo obvio:
 *  medido, ahí es CONTRAPRODUCENTE. El touchstart llega ~100 ms antes del
 *  click y el viaje tarda 400+, así que el prefetch no alcanza a servir esa
 *  navegación y encima el servidor recibe dos peticiones idénticas (la del
 *  prefetch y la de la navegación). La segunda vuelta de la medición pasó de
 *  ~425 ms a 1.300-3.100 ms.
 *
 *  Tiene que ser `prefetch={true}` en el `<Link>` y no `router.prefetch()`:
 *  medido con el tráfico real del navegador, `router.prefetch()` manda
 *  `next-router-prefetch: 1`, o sea el prefetch PARCIAL -- trae el esqueleto
 *  de `loading.tsx` y ningún dato, así que la navegación seguía costando los
 *  mismos 425-525 ms. `prefetch={true}` es la única forma pública de pedir
 *  la ruta entera en una ruta dinámica.
 *
 *  Escalonado, y no los cinco de golpe: cada uno renderiza una página
 *  completa en el servidor, y en un celular en terreno cinco a la vez le
 *  quitan ancho de banda a la pantalla que la persona está mirando. El
 *  retardo inicial existe por lo mismo -- primero que termine de aparecer lo
 *  que se pidió, después precargamos lo que quizás se pida.
 *
 *  Lo que trae `prefetch={true}` se reutiliza 5 minutos -- cuenta como
 *  `static` en el client cache, no como `dynamic` (que es 0). Eso es lo que
 *  lo hace valer la pena y, a la vez, lo que obliga a invalidarlo cuando se
 *  escribe: ver `lib/invalidar-datos.ts`. */
function usePrefetchEscalonado(total: number) {
  const [habilitados, setHabilitados] = useState(0)
  // Cambia en cada escritura y entra en la `key` de los <Link>: eso los
  // vuelve a montar, y un Link recién montado con prefetch={true} pide la
  // ruta de nuevo y sobrescribe lo que había en caché. Es la única forma
  // pública de refrescar lo precargado de OTRA ruta -- router.refresh() solo
  // alcanza a la pantalla actual (ver lib/invalidar-datos.tsx).
  const [generacion, setGeneracion] = useState(0)

  const alEscribir = useCallback(() => {
    setGeneracion(g => g + 1)
    // Vuelve a cero para que el re-prefetch también salga escalonado y no
    // dispare cinco renders de página juntos justo después de guardar.
    setHabilitados(0)
  }, [])
  useAlMutarDatos(alEscribir)

  useEffect(() => {
    if (total === 0) return
    const timers: ReturnType<typeof setTimeout>[] = []
    const enReposo = (fn: () => void) =>
      'requestIdleCallback' in window
        ? window.requestIdleCallback(fn, { timeout: 3000 })
        : setTimeout(fn, 0)

    for (let i = 1; i <= total; i++) {
      timers.push(setTimeout(() => enReposo(() => setHabilitados(n => Math.max(n, i))), 800 + (i - 1) * 400))
    }
    return () => timers.forEach(clearTimeout)
  }, [total, generacion])

  return { hasta: habilitados, generacion }
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** Quién ve qué. Antes esto se resolvía con un fetch a /api/whoami desde el
 * cliente -- y lo hacían Navbar y MobileTabBar por separado, o sea dos
 * round-trips (cada uno con su getUser() contra Supabase) en CADA carga de
 * página, solo para saber qué links pintar. El resultado visible era una
 * barra vacía durante ~medio segundo y la barra inferior apareciendo de
 * golpe. Ahora el rol lo resuelve el servidor una vez en app/layout.tsx y
 * baja como prop, así el HTML ya llega con la navegación pintada. */
export type NavRole = 'owner' | 'admin' | 'socio' | null

export function linksParaViewer(role: NavRole, tieneBeneficiario: boolean) {
  if (role === 'socio') return SOCIO_LINKS
  if (!role) return []
  // Staff que también es socio (beneficiarioId propio, ver lib/roles.ts)
  // ve además "Mi compra", sin perder ningún link de staff.
  return tieneBeneficiario ? [...STAFF_LINKS, ...SOCIO_LINKS] : STAFF_LINKS
}

export default function Navbar({ role, tieneBeneficiario }: { role: NavRole; tieneBeneficiario: boolean }) {
  const pathname = usePathname()
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isIOS, setIsIOS] = useState(false)
  const [showIOSHint, setShowIOSHint] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const links = linksParaViewer(role, tieneBeneficiario)
  const precargar = usePrecargaEnIntencion()
  // El menú de escritorio está en display:none en móvil, así que ahí no
  // prefetchea nada (Next usa IntersectionObserver): el del celular lo hace
  // MobileTabBar por su cuenta. Un mismo destino pedido por los dos es un
  // acierto de caché en el segundo, no una petición más.
  const { hasta: prefetchHasta, generacion } = usePrefetchEscalonado(links.length)

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    // Navegación dura, no router.replace: mismo motivo que en login (ver
    // app/login/page.tsx) -- el router cache de Next puede servir una
    // página ya cacheada como si la sesión siguiera activa.
    window.location.assign('/login')
  }

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)

    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent.toLowerCase())
    const standalone = window.matchMedia('(display-mode: standalone)').matches
    if (ios && !standalone) setIsIOS(true)

    // La cabecera solo se separa del contenido cuando hay algo desplazado
    // debajo. El listener es pasivo y solo escribe estado cuando cruza el
    // umbral: no re-renderiza en cada píxel de scroll.
    const onScroll = () => setScrolled(prev => {
      const ahora = window.scrollY > 4
      return prev === ahora ? prev : ahora
    })
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('scroll', onScroll)
    }
  }, [])

  async function handleInstall() {
    if (!installPrompt) return
    await installPrompt.prompt()
    setInstallPrompt(null)
  }

  return (
    <header
      className="app-header material-chrome sticky top-0 z-40"
      data-scrolled={scrolled}
      style={{
        borderBottom: '1px solid var(--linea)',
      }}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-14 sm:h-16 items-center justify-between gap-3">

          {/* Marca. El separador vertical existe solo en escritorio: es lo que
              hace que el logo lea como firma y no como el primer ítem del
              menú. */}
          <div className="flex items-center gap-4 min-w-0">
            <Link href="/" className="nav-item flex items-center gap-2.5 shrink-0 rounded-full">
              <Image src="/logo.png" alt="Proyecto PAT" width={32} height={32} className="rounded-full" />
              <span
                className="text-[15px] font-semibold tracking-[-0.01em]"
                style={{ color: 'var(--tinta)' }}
              >
                Proyecto PAT
              </span>
            </Link>
            {links.length > 0 && (
              <span aria-hidden className="hidden sm:block h-6 w-px" style={{ background: 'var(--linea)' }} />
            )}
          </div>

          {/* Menú de escritorio */}
          <nav className="hidden sm:flex items-center gap-1">
            {links.map((link, i) => (
              <Link
                key={`${link.href}:${generacion}`}
                href={link.href}
                prefetch={i < prefetchHasta ? true : undefined}
                onPointerEnter={() => precargar(link.href, link.chunk)}
                onFocus={() => precargar(link.href, link.chunk)}
                onClick={soltarFocoDePuntero}
                className="nav-item nav-pill px-3.5 h-9 text-sm"
                data-activo={pathname === link.href}
                aria-current={pathname === link.href ? 'page' : undefined}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Desktop right actions */}
          <div className="hidden sm:flex items-center gap-2">
            {installPrompt && (
              <Button size="sm" variant="secondary" onClick={handleInstall} className="rounded-full">
                <Download size={14} /> Instalar app
              </Button>
            )}
            {links.length > 0 && (
              <Button size="sm" variant="ghost" onClick={handleLogout} className="rounded-full">
                <LogOut size={14} /> Salir
              </Button>
            )}
          </div>

          {/* Mobile right-side actions */}
          <div className="flex sm:hidden items-center gap-2">
            {/* iOS install hint */}
            {isIOS && (
              <IconButton onClick={() => setShowIOSHint(v => !v)} aria-label="Instalar app">
                <Download size={18} />
              </IconButton>
            )}
            {/* Android/Chrome install */}
            {installPrompt && (
              <IconButton onClick={handleInstall} aria-label="Instalar app">
                <Download size={18} />
              </IconButton>
            )}
            {/* Salir */}
            {links.length > 0 && (
              <IconButton onClick={handleLogout} aria-label="Salir">
                <LogOut size={18} />
              </IconButton>
            )}
          </div>
        </div>
      </div>

      {/* iOS install hint banner */}
      {showIOSHint && isIOS && (
        <div className="sm:hidden px-4 pb-3 pt-0">
          <div className="rounded-[6px] px-4 py-3 text-xs flex items-start gap-2" style={{ background: 'var(--linea)', border: '1px solid var(--linea-fuerte)', color: 'var(--verde-dark)' }}>
            <span className="text-base shrink-0">📲</span>
            <span>
              Para instalar la app: toca el botón <strong>Compartir</strong> (⎋) en Safari y luego <strong>"Agregar a pantalla de inicio"</strong>.
            </span>
          </div>
        </div>
      )}
    </header>
  )
}

/** Barra de tabs fija en la parte inferior, solo mobile (reemplaza al menú hamburguesa). */
export function MobileTabBar({ role, tieneBeneficiario }: { role: NavRole; tieneBeneficiario: boolean }) {
  const pathname = usePathname()
  const links = linksParaViewer(role, tieneBeneficiario)
  const precargar = usePrecargaEnIntencion()
  const { hasta: prefetchHasta, generacion } = usePrefetchEscalonado(links.length)

  if (links.length === 0) return null

  return (
    <nav
      className="sm:hidden fixed inset-x-0 bottom-0 z-40 flex material-chrome"
      style={{
        borderTop: '1px solid var(--linea)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {links.map((link, i) => {
        const Icon = link.icon
        const active = pathname === link.href
        return (
          <Link
            key={`${link.href}:${generacion}`}
            href={link.href}
            prefetch={i < prefetchHasta ? true : undefined}
            // En mobile no hay hover: el touchstart llega ~100ms antes que el
            // click, y esos 100ms son justo el pedido del chunk.
            onTouchStart={() => precargar(link.href, link.chunk)}
            onPointerEnter={() => precargar(link.href, link.chunk)}
            onClick={soltarFocoDePuntero}
            className="nav-item flex flex-1 min-w-0 flex-col items-center justify-center gap-1 px-1 pt-2 pb-1.5 text-[10px] font-medium"
            style={{ color: active ? 'var(--marca-dark)' : 'var(--tinta-70)' }}
            aria-current={active ? 'page' : undefined}
          >
            {/* La pastilla es el mismo indicador que el menú de escritorio,
                acá detrás del ícono: la barra de 2px pegada al borde superior
                quedaba tapada por la sombra del contenido al hacer scroll. */}
            <span
              className="nav-pill flex h-7 w-12 items-center justify-center"
              data-activo={active}
            >
              <Icon size={19} strokeWidth={active ? 2.4 : 2} />
            </span>
            <span className="w-full truncate text-center">{link.corto}</span>
          </Link>
        )
      })}
    </nav>
  )
}
