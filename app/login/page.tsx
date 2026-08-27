'use client'

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { Card, Input, Button, Alert } from '@/components/design-system'

// El link del correo siempre abre en Safari/Mail, nunca en el ícono de
// "Agregar a inicio" -- iOS le da a los webapps standalone su propio
// almacenamiento de cookies, separado del de Safari (no hay forma de
// evitarlo, no es un bug nuestro). Como el ícono tampoco tiene barra de
// direcciones para pegar el link ahí, este textarea es la única puerta:
// el usuario copia el link desde Mail y lo pega directo en el ícono
// instalado, sin salir nunca de su contenedor de sesión.
function parseLinkPegado(input: string): { accessToken?: string; refreshToken?: string; code?: string; tokenHash?: string; type?: string; error?: string } {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    return { error: 'Eso no parece un link válido.' }
  }
  const hashParams = new URLSearchParams(url.hash.slice(1))
  const errorDescription = hashParams.get('error_description')
  if (errorDescription) return { error: errorDescription.replace(/\+/g, ' ') }
  const accessToken = hashParams.get('access_token') ?? undefined
  const refreshToken = hashParams.get('refresh_token') ?? undefined
  const code = url.searchParams.get('code') ?? undefined
  // El link crudo que manda Supabase por correo es el de verificación
  // (https://<ref>.supabase.co/auth/v1/verify?token=...&type=magiclink),
  // no trae `code` -- eso solo aparece después de seguirlo y que Supabase
  // redirija al callback. token/type van en el query string, no en el hash.
  const tokenHash = url.searchParams.get('token') ?? url.searchParams.get('token_hash') ?? undefined
  const type = url.searchParams.get('type') ?? undefined
  if (!accessToken && !code && !tokenHash) return { error: 'Ese link no trae una sesión válida. Pégalo completo, tal como llegó en el correo.' }
  return { accessToken, refreshToken, code, tokenHash, type }
}

function LoginForm() {
  const params = useSearchParams()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [mostrarPegar, setMostrarPegar] = useState(false)
  const [linkPegado, setLinkPegado] = useState('')
  const [pegarError, setPegarError] = useState<string | null>(null)
  const [pegarLoading, setPegarLoading] = useState(false)

  async function entrarConLinkPegado(e: React.FormEvent) {
    e.preventDefault()
    if (!linkPegado || pegarLoading) return
    setPegarLoading(true)
    setPegarError(null)

    const parsed = parseLinkPegado(linkPegado)
    if (parsed.error) {
      setPegarError(parsed.error)
      setPegarLoading(false)
      return
    }

    const supabase = getSupabaseBrowserClient()
    const result = parsed.accessToken && parsed.refreshToken
      ? await supabase.auth.setSession({ access_token: parsed.accessToken, refresh_token: parsed.refreshToken })
      : parsed.tokenHash
        ? await supabase.auth.verifyOtp({ token_hash: parsed.tokenHash, type: (parsed.type ?? 'magiclink') as any })
        : await supabase.auth.exchangeCodeForSession(parsed.code!)

    if (result.error || !result.data.session) {
      setPegarError('El link es inválido o ya expiró. Pide uno nuevo.')
      setPegarLoading(false)
      return
    }

    const whoami = await fetch('/api/whoami').then(r => r.json()).catch(() => null)
    const next = params.get('next')
    const destino = whoami?.role === 'socio' ? '/mi-dashboard' : (next || '/')
    // Navegación dura: proxy.ts lee la cookie recién seteada, el router
    // cache de Next podría no verla (mismo motivo que en auth/callback).
    window.location.assign(destino)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!email || loading) return
    setLoading(true)
    setError(null)

    const supabase = getSupabaseBrowserClient()
    const next = params.get('next') || '/'
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    })

    setLoading(false)
    if (error) {
      setError('No pudimos enviar el link. Intenta de nuevo en unos minutos.')
      return
    }
    setEnviado(true)
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="w-full max-w-sm motion-safe:animate-[fadeIn_250ms_ease-out]">
        <Card strong className="p-8 text-center space-y-6">
          <div className="flex flex-col items-center gap-3">
            <Image src="/logo.png" alt="" width={48} height={48} className="rounded-xl" />
            <div>
              <h1 className="text-lg font-bold" style={{ color: 'var(--verde-dark)' }}>
                Proyecto PAT
              </h1>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                Comunidad Pedro Huisca
              </p>
            </div>
          </div>

          {enviado ? (
            <div className="space-y-4 motion-safe:animate-[fadeIn_200ms_ease-out]">
              <div className="space-y-2">
                <h2 className="text-base font-semibold" style={{ color: '#1c1c1c' }}>
                  Revisa tu correo
                </h2>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  Te enviamos un link de acceso a <strong>{email}</strong>. Ábrelo desde
                  este mismo dispositivo para entrar.
                </p>
              </div>

              {/* Si abrieron la app desde el ícono de inicio, tocar el link
                  del correo los deja en Safari/Mail, no acá -- necesitan
                  copiarlo y pegarlo en esta misma pantalla para entrar. */}
              <div className="pt-2 text-left" style={{ borderTop: '1px solid rgba(0,0,0,0.08)' }}>
                {mostrarPegar ? (
                  <form onSubmit={entrarConLinkPegado} className="space-y-2 pt-3">
                    <label className="text-xs font-medium block" style={{ color: 'var(--text-muted)' }}>
                      ¿Estás usando el ícono de inicio? Copia el link del correo y pégalo acá:
                    </label>
                    <Input
                      type="text"
                      autoFocus
                      value={linkPegado}
                      onChange={e => setLinkPegado(e.target.value)}
                      placeholder="https://..."
                      aria-label="Link de acceso pegado"
                    />
                    {pegarError && <Alert tone="error">{pegarError}</Alert>}
                    <Button type="submit" disabled={pegarLoading} className="w-full">
                      {pegarLoading ? 'Entrando…' : 'Entrar con este link'}
                    </Button>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => setMostrarPegar(true)}
                    className="text-xs font-medium underline underline-offset-2 pt-1"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    ¿Estás en el ícono de inicio? Pega el link acá
                  </button>
                )}
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4 text-left">
              <p className="text-sm text-center" style={{ color: 'var(--text-muted)' }}>
                Ingresa tu email y te mandamos un link de acceso — sin contraseña.
              </p>
              <Input
                type="email"
                autoFocus
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="tu@email.com"
                aria-label="Email"
                required
              />
              {error && <Alert tone="error">{error}</Alert>}
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? 'Enviando…' : 'Enviarme el link'}
              </Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
