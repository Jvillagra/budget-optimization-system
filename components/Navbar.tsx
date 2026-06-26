'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'

const links = [
  { href: '/beneficiarios', label: 'Beneficiarios' },
  { href: '/precios', label: 'Maestro de precios' },
  { href: '/simulador', label: 'Simulador' },
]

export default function Navbar() {
  const pathname = usePathname()

  return (
    <header className="sticky top-0 z-40" style={{
      background: 'rgba(255,255,255,0.75)',
      backdropFilter: 'blur(18px)',
      WebkitBackdropFilter: 'blur(18px)',
      borderBottom: '1px solid rgba(255,255,255,0.6)',
      boxShadow: '0 2px 16px rgba(61,90,54,0.07)',
    }}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-14 items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo.png" alt="Proyecto PAT" width={32} height={32} className="rounded-md" />
            <span className="text-sm font-bold tracking-wide" style={{ color: 'var(--verde-dark)' }}>Proyecto PAT</span>
          </Link>
          <nav className="flex gap-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-lg px-3 py-1.5 text-sm font-medium transition-all"
                style={pathname === link.href ? {
                  background: 'var(--verde)',
                  color: '#fff',
                } : {
                  color: 'var(--cafe)',
                }}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </header>
  )
}
