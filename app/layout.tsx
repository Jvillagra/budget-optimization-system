import type { Metadata, Viewport } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import Navbar, { MobileTabBar } from '@/components/Navbar'
import { ProveedorProvider } from '@/lib/proveedor-context'
import { getViewerContext } from '@/lib/roles'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' })

export const metadata: Metadata = {
  title: 'Proyecto PAT — Comunidad Pedro Huisca',
  description: 'Programa de Acción Territorial. Plataforma de gestión comunitaria para optimizar fondos y materiales.',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
    shortcut: '/favicon-32x32.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Proyecto PAT',
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
  // Sin viewport-fit=cover, env(safe-area-inset-*) vale 0 SIEMPRE: la barra
  // inferior de tabs ya pedía ese padding pero el navegador se lo daba en 0,
  // así que en iPhone con indicador de inicio (y en la PWA standalone) los
  // tabs quedaban pisados por el gesto de home.
  viewportFit: 'cover',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // El rol se resuelve acá, una sola vez por request: Navbar y MobileTabBar
  // lo recibían antes vía dos fetch('/api/whoami') desde el cliente -- ver
  // components/Navbar.tsx.
  const ctx = await getViewerContext()

  return (
    <html lang="es" className={`${geist.variable} h-full antialiased`}>
      <head />
      {/* .app-shell (globals.css) reserva el hueco de la barra de tabs
          incluyendo el safe area de iOS, y lo saca en desktop. */}
      <body className="min-h-full bg-gray-50 flex flex-col app-shell">
        <ProveedorProvider>
        <Navbar role={ctx.role} tieneBeneficiario={ctx.beneficiarioId !== null} />
        <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
          {children}
        </main>
        <MobileTabBar role={ctx.role} tieneBeneficiario={ctx.beneficiarioId !== null} />
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
        </ProveedorProvider>
      </body>
    </html>
  )
}
