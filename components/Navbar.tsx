'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import {
  Download, LogOut, ClipboardList, Users, Tag, Calculator, BarChart3, ShieldCheck, ShoppingBag,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const STAFF_LINKS = [
  { href: '/rendicion', label: 'Rendición', icon: ClipboardList },
  { href: '/beneficiarios', label: 'Beneficiarios', icon: Users },
  { href: '/precios', label: 'Precios', icon: Tag },
  { href: '/simulador', label: 'Simulador', icon: Calculator },
  { href: '/vista-resumen', label: 'Resumen', icon: BarChart3 },
  { href: '/admin', label: 'Admin', icon: ShieldCheck },
]
const SOCIO_LINKS = [{ href: '/mi-dashboard', label: 'Mi compra', icon: ShoppingBag }]

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function Navbar() {
  const pathname = usePathname()
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isIOS, setIsIOS] = useState(false)
  const [showIOSHint, setShowIOSHint] = useState(false)
  const [links, setLinks] = useState<{ href: string; label: string; icon: LucideIcon }[]>([])

  useEffect(() => {
    fetch('/api/whoami')
      .then(r => r.json())
      .then(ctx => {
        if (ctx.role === 'socio') return setLinks(SOCIO_LINKS)
        if (!ctx.role) return setLinks([])
        // Staff que también es socio (beneficiarioId propio, ver lib/roles.ts)
        // ve además "Mi compra", sin perder ningún link de staff.
        const links = ctx.beneficiarioId ? [...STAFF_LINKS, ...SOCIO_LINKS] : STAFF_LINKS
        setLinks(links)
      })
      .catch(() => {})
  }, [])

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
      background: 'rgba(255,255,255,0.90)',
      backdropFilter: 'blur(18px)',
      WebkitBackdropFilter: 'blur(18px)',
      borderBottom: '1px solid rgba(255,255,255,0.6)',
      boxShadow: '0 2px 16px rgba(61,90,54,0.07)',
    }}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-14 items-center justify-between gap-3">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <Image src="/logo.png" alt="Proyecto PAT" width={30} height={30} className="rounded-md" />
            <span className="text-sm font-bold tracking-wide" style={{ color: 'var(--verde-dark)' }}>
              Proyecto PAT
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden sm:flex gap-1">
            {links.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-lg px-3 py-1.5 text-sm font-medium transition-all"
                style={pathname === link.href ? {
                  background: 'var(--verde)', color: '#fff',
                } : { color: 'var(--cafe)' }}
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
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold"
                style={{ background: 'rgba(58,125,68,0.1)', color: 'var(--verde-dark)', border: '1px solid rgba(58,125,68,0.2)' }}
              >
                <Download size={13} /> Instalar app
              </button>
            )}
            {links.length > 0 && (
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold"
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
                className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
                style={{ background: 'rgba(58,125,68,0.1)', color: 'var(--verde-dark)', border: '1px solid rgba(58,125,68,0.2)' }}
              >
                <Download size={13} />
              </button>
            )}
            {/* Android/Chrome install */}
            {installPrompt && (
              <button
                onClick={handleInstall}
                className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
                style={{ background: 'rgba(58,125,68,0.1)', color: 'var(--verde-dark)', border: '1px solid rgba(58,125,68,0.2)' }}
              >
                <Download size={13} />
              </button>
            )}
            {/* Salir */}
            {links.length > 0 && (
              <button
                onClick={handleLogout}
                className="rounded-lg p-2"
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
          <div className="rounded-xl px-4 py-3 text-xs flex items-start gap-2" style={{ background: 'rgba(58,125,68,0.08)', border: '1px solid rgba(58,125,68,0.2)', color: 'var(--verde-dark)' }}>
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
export function MobileTabBar() {
  const pathname = usePathname()
  const [links, setLinks] = useState<{ href: string; label: string; icon: LucideIcon }[]>([])

  useEffect(() => {
    fetch('/api/whoami')
      .then(r => r.json())
      .then(ctx => {
        if (ctx.role === 'socio') return setLinks(SOCIO_LINKS)
        if (!ctx.role) return setLinks([])
        const links = ctx.beneficiarioId ? [...STAFF_LINKS, ...SOCIO_LINKS] : STAFF_LINKS
        setLinks(links)
      })
      .catch(() => {})
  }, [])

  if (links.length === 0) return null

  return (
    <nav
      className="sm:hidden fixed inset-x-0 bottom-0 z-40 flex overflow-x-auto"
      style={{
        background: 'rgba(255,255,255,0.94)',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        borderTop: '1px solid rgba(0,0,0,0.06)',
        boxShadow: '0 -2px 16px rgba(61,90,54,0.07)',
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
            className="flex flex-col items-center justify-center gap-0.5 shrink-0 px-3 py-2 text-[10px] font-medium min-w-[64px]"
            style={{ color: active ? 'var(--verde-dark)' : 'var(--cafe)' }}
          >
            <Icon size={20} strokeWidth={active ? 2.5 : 2} />
            {link.label}
          </Link>
        )
      })}
    </nav>
  )
}
