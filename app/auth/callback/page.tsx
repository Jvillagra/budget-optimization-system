'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

// Con flowType: 'implicit', el link del email trae la sesión en el hash de
// la URL (#access_token=...) -- eso nunca llega al servidor (los hash
// fragments no se envían en el request HTTP), así que hay que leerlo acá,
// del lado del cliente. Pero el canje mismo (setSession/verifyOtp/exchange)
// se manda a POST /api/auth/session -- ese endpoint escribe las cookies de
// sesión vía Set-Cookie del servidor, no vía document.cookie del browser
// client. En un ícono de "Agregar a inicio" en iOS sin service worker, ITP
// trata el storage script-writable (document.cookie incluido) con un cap de
// retención mucho más agresivo que un Set-Cookie real, lo que hacía que la
// sesión se perdiera y volviera a pedir magic link con cada apertura.
function CallbackInner() {
  const params = useSearchParams()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.slice(1))
    const hashError = hashParams.get('error_description')
    if (hashError) {
      setError(hashError.replace(/\+/g, ' '))
      return
    }

    const accessToken = hashParams.get('access_token') ?? undefined
    const refreshToken = hashParams.get('refresh_token') ?? undefined
    const code = params.get('code') ?? undefined
    // token_hash/type van en el query string (no en el hash): es la forma
    // en que ahora armamos el link del correo, apuntando a esta página en
    // vez de al GET /auth/v1/verify de Supabase directamente, para que un
    // prefetcher de cliente de correo (que solo sigue GETs sobre HTML) no
    // consuma el token de un solo uso antes de que la persona haga clic.
    // Misma convención de nombres que parseLinkPegado en app/login/page.tsx.
    const tokenHash = params.get('token') ?? params.get('token_hash') ?? undefined
    const type = params.get('type') ?? undefined

    fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken, refreshToken, code, tokenHash, type }),
    })
      .then(async (res) => {
        if (!res.ok) {
          setError('El link es inválido o ya expiró.')
          return
        }
        // El `next` genérico ('/') sirve para owner/admin, pero un socio no
        // tiene acceso a esas páginas -- lo mandamos directo a su dashboard.
        const whoami = await fetch('/api/whoami').then(r => r.json()).catch(() => null)
        const next = params.get('next')
        const destino = whoami?.role === 'socio' ? '/mi-dashboard' : (next || '/')
        // Navegación dura: mismo motivo que en login/logout (proxy.ts lee la
        // cookie recién seteada, el router cache de Next podría no verla).
        window.location.assign(destino)
      })
      .catch(() => setError('El link es inválido o ya expiró.'))
  }, [params])

  if (error) {
    return (
      <div className="max-w-sm mx-auto mt-16 text-center space-y-3">
        <h1 className="text-lg font-semibold">No pudimos iniciar sesión</h1>
        <p className="text-sm text-gray-500">{error}</p>
        <a href="/login" className="inline-block text-sm text-indigo-600 font-medium">Pedir un link nuevo</a>
      </div>
    )
  }

  return <div className="text-center py-16 text-gray-400">Ingresando…</div>
}

export default function CallbackPage() {
  return (
    <Suspense>
      <CallbackInner />
    </Suspense>
  )
}
