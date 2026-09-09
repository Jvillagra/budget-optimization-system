'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import {
  Download, LogOut, ClipboardList, Users, Tag, Calculator, ShieldCheck, ShoppingBag,
} from 'lucide-react'

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
 *  un deploy) se ignora a propósito -- la navegación normal lo reintenta. */
function usePrecargaEnIntencion() {
  const yaPedidos = useRef<Set<string>>(new Set())
  return (href: string, chunk: () => Promise<unknown>) => {
    if (yaPedidos.current.has(href)) return
    yaPedidos.current.add(href)
    chunk().catch(() => {})
  }
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
  const links = linksParaViewer(role, tieneBeneficiario)
  const precargar = usePrecargaEnIntencion()

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

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  async function handleInstall() {
    if (!installPrompt) return
    await installPrompt.prompt()
    setInstallPrompt(null)
  }

  return (
    <header className="sticky top-0 z-40" style={{
      background: 'var(--papel)',
      borderBottom: '1px solid var(--linea)',
    }}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-14 items-center justify-between gap-3">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <Image src="/logo.png" alt="Proyecto PAT" width={30} height={30} className="rounded-[4px]" />
            <span className="text-sm font-semibold tracking-tight" style={{ color: 'var(--tinta)' }}>
              Proyecto PAT
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden sm:flex gap-1">
            {links.map(link => (
              <Link
                key={link.href}
                href={link.href}
                onPointerEnter={() => precargar(link.href, link.chunk)}
                onFocus={() => precargar(link.href, link.chunk)}
                className="nav-item px-1 mx-2.5 py-1.5 text-sm font-medium transition-colors"
                style={pathname === link.href
                  ? { color: 'var(--tinta)', fontWeight: 600, boxShadow: 'inset 0 -2px 0 0 var(--tinta)' }
                  : { color: 'var(--tinta-45)' }}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Desktop right actions */}
          <div className="hidden sm:flex items-center gap-2">
            {installPrompt && (
              <button
                onClick={handleInstall}
                className="flex items-center gap-1.5 rounded-[4px] px-3 py-1.5 text-xs font-semibold"
                style={{ background: 'var(--papel-hueco)', color: 'var(--verde-dark)', border: '1px solid var(--linea-fuerte)' }}
              >
                <Download size={13} /> Instalar app
              </button>
            )}
            {links.length > 0 && (
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 rounded-[4px] px-3 py-1.5 text-xs font-semibold"
                style={{ color: 'var(--cafe)' }}
              >
                <LogOut size={13} /> Salir
              </button>
            )}
          </div>

          {/* Mobile right-side actions */}
          <div className="flex sm:hidden items-center gap-2">
            {/* iOS install hint */}
            {isIOS && (
              <button
                onClick={() => setShowIOSHint(v => !v)}
                className="flex items-center justify-center gap-1 rounded-[4px] min-h-[44px] min-w-[44px] text-xs font-semibold"
                style={{ background: 'var(--papel-hueco)', color: 'var(--verde-dark)', border: '1px solid var(--linea-fuerte)' }}
                aria-label="Instalar app"
              >
                <Download size={16} />
              </button>
            )}
            {/* Android/Chrome install */}
            {installPrompt && (
              <button
                onClick={handleInstall}
                className="flex items-center justify-center gap-1 rounded-[4px] min-h-[44px] min-w-[44px] text-xs font-semibold"
                style={{ background: 'var(--papel-hueco)', color: 'var(--verde-dark)', border: '1px solid var(--linea-fuerte)' }}
                aria-label="Instalar app"
              >
                <Download size={16} />
              </button>
            )}
            {/* Salir */}
            {links.length > 0 && (
              <button
                onClick={handleLogout}
                className="flex items-center justify-center rounded-[4px] min-h-[44px] min-w-[44px]"
                style={{ color: 'var(--cafe)' }}
                aria-label="Salir"
              >
                <LogOut size={18} />
              </button>
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

  if (links.length === 0) return null

  return (
    <nav
      className="sm:hidden fixed inset-x-0 bottom-0 z-40 flex"
      style={{
        background: 'var(--papel)',
        borderTop: '1px solid var(--linea)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {links.map(link => {
        const Icon = link.icon
        const active = pathname === link.href
        return (
          <Link
            key={link.href}
            href={link.href}
            // En mobile no hay hover: el touchstart llega ~100ms antes que el
            // click, y esos 100ms son justo el pedido del chunk.
            onTouchStart={() => precargar(link.href, link.chunk)}
            onPointerEnter={() => precargar(link.href, link.chunk)}
            className="nav-item relative flex flex-1 min-w-0 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[10px] font-medium"
            style={{ color: active ? 'var(--tinta)' : 'var(--tinta-45)' }}
            aria-current={active ? 'page' : undefined}
          >
            {active && (
              <span
                aria-hidden
                className="absolute top-0 h-0.5 w-8"
                style={{ background: 'var(--marca)' }}
              />
            )}
            <Icon size={20} strokeWidth={active ? 2.5 : 2} />
            <span className="w-full truncate text-center">{link.corto}</span>
          </Link>
        )
      })}
    </nav>
  )
}
