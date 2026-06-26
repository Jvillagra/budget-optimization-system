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
          background: 'rgba(12,20,12,0.88)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderTop: '1px solid rgba(255,255,255,0.08)',
        }}>
          <div className="mx-auto max-w-7xl px-4 py-6 text-center space-y-1">
            <p className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Comunidad Pedro Huisca
            </p>
            <p className="text-sm font-bold" style={{
              background: 'linear-gradient(90deg, #4ade80, #a3e635, #d97706)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>
              Desarrollado por Neurobot Innovations
            </p>
          </div>
        </footer>
      </body>
    </html>
  )
}
