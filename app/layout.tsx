import type { Metadata, Viewport } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import Navbar from '@/components/Navbar'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' })

export const metadata: Metadata = {
  title: 'Proyecto PAT — Comunidad Pedro Huisca',
  description: 'Programa de Acción Territorial. Plataforma de gestión comunitaria para optimizar fondos y materiales.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Fondo Comunitario',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
}

export const viewport: Viewport = {
  themeColor: '#4f46e5',
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${geist.variable} h-full antialiased`}>
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
      </head>
      <body className="min-h-full bg-gray-50 flex flex-col">
        <Navbar />
        <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
          {children}
        </main>
        <footer style={{
          background: 'rgba(255,255,255,0.70)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderTop: '1px solid rgba(200,200,200,0.45)',
        }}>
          <div className="mx-auto max-w-7xl px-4 py-5 text-center space-y-0.5">
            <p className="text-xs font-medium" style={{ color: 'rgba(0,0,0,0.4)' }}>
              Comunidad Pedro Huisca
            </p>
            <p className="text-xs font-semibold" style={{ color: 'rgba(0,0,0,0.55)' }}>
              Desarrollado por{' '}
              <span style={{ color: 'var(--verde-dark)', fontWeight: 700 }}>Neurobot Innovations</span>
            </p>
          </div>
        </footer>
      </body>
    </html>
  )
}
