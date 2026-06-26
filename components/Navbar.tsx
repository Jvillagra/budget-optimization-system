'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { Menu, X, Download } from 'lucide-react'

const links = [
  { href: '/beneficiarios', label: 'beneficiarios' },
  { href: '/precios', label: 'maestro de precios' },
  { href: '/simulador', label: 'simulador' },
  { href: '/vista-resumen', label: 'vista resumen' },
]

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function Navbar() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isIOS, setIsIOS] = useState(false)
  const [showIOSHint, setShowIOSHint] = useState(false)

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

          {/* Desktop install button */}
          {installPrompt && (
            <button
              onClick={handleInstall}
              className="hidden sm:flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold"
              style={{ background: 'rgba(58,125,68,0.1)', color: 'var(--verde-dark)', border: '1px solid rgba(58,125,68,0.2)' }}
            >
              <Download size={13} /> Instalar app
            </button>
          )}

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
            {/* Hamburger */}
            <button
              onClick={() => setOpen(v => !v)}
              className="rounded-lg p-2"
              style={{ color: 'var(--cafe)' }}
              aria-label="Menú"
            >
              {open ? <X size={20} /> : <Menu size={20} />}
            </button>
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

      {/* Mobile dropdown menu */}
      {open && (
        <div className="sm:hidden border-t px-4 py-3 space-y-1" style={{ borderColor: 'rgba(0,0,0,0.06)', background: 'rgba(255,255,255,0.97)' }}>
          {links.map(link => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="block rounded-xl px-4 py-3 text-sm font-medium"
              style={pathname === link.href ? {
                background: 'var(--verde)', color: '#fff',
              } : { color: 'var(--cafe)', background: 'rgba(0,0,0,0.03)' }}
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </header>
  )
}
