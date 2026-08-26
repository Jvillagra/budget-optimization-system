'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'

// Con flowType: 'implicit', el link del email trae la sesión en el hash de
// la URL (#access_token=...) -- eso nunca llega al servidor (los hash
// fragments no se envían en el request HTTP), así que el canje tiene que
// pasar por acá, del lado del cliente. El browser client de @supabase/ssr
// detecta el hash automáticamente (detectSessionInUrl) y guarda la sesión
// en cookies -- ahí proxy.ts ya la puede leer.
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

    const supabase = getSupabaseBrowserClient()
    const accessToken = hashParams.get('access_token')
    const refreshToken = hashParams.get('refresh_token')

    // Dos formas posibles de traer la sesión, según cómo se generó el link:
    // 1. Tokens en el hash (#access_token=...) -- el SDK no siempre los
    //    detecta solo; los seteamos a mano con setSession().
    // 2. `?code=` en la URL -- lo resuelve el detectSessionInUrl automático
    //    del SDK, alcanza con getSession().
    const resolveSession = accessToken && refreshToken
      ? supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      : supabase.auth.getSession()

    resolveSession.then((result) => {
      const session = 'session' in result.data ? result.data.session : null
      if (result.error || !session) {
        setError('El link es inválido o ya expiró.')
        return
      }
      // Navegación dura: mismo motivo que en login/logout (proxy.ts lee la
      // cookie recién seteada, el router cache de Next podría no verla).
      window.location.assign(params.get('next') || '/')
    })
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
