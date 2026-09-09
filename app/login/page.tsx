'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { Card, Input, Button, Alert } from '@/components/design-system'

// Segundos que hay que esperar antes de poder reenviar: Supabase rechaza un
// segundo OTP para el mismo email dentro de los 60s, así que el botón
// "Reenviar" refleja esa ventana en vez de fallar en silencio.
const REENVIO_SEGUNDOS = 60
const CODIGO_LARGO = 6

// Ir al destino con navegación dura: proxy.ts lee la cookie recién seteada
// por /api/auth/session y el router cache de Next podría no verla.
async function irADestino(next: string | null) {
  const whoami = await fetch('/api/whoami').then(r => r.json()).catch(() => null)
  window.location.assign(whoami?.role === 'socio' ? '/mi-dashboard' : (next || '/'))
}

function LoginForm() {
  const params = useSearchParams()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  // `?codigo=1` llega desde /auth/callback cuando el link falló: la persona
  // ya tiene el correo en la mano, así que se salta el paso de pedirlo.
  const [enviado, setEnviado] = useState(params.get('codigo') === '1')
  const [cooldown, setCooldown] = useState(0)
  const [codigo, setCodigo] = useState('')
  const [codigoError, setCodigoError] = useState<string | null>(null)
  const [codigoLoading, setCodigoLoading] = useState(false)

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  async function enviarLink() {
    setLoading(true)
    setError(null)

    const supabase = await getSupabaseBrowserClient()
    const next = params.get('next') || '/'
    // El template del correo arma el link como `{{ .RedirectTo }}&token_hash=...`:
    // emailRedirectTo es obligatorio y tiene que traer `?` (ver
    // app/api/admin/enviar-magic-links/route.ts para el mismo caso).
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    })

    setLoading(false)
    if (error) {
      setError('No pudimos enviar el correo. Espera un minuto e intenta de nuevo.')
      return
    }
    setEnviado(true)
    setCooldown(REENVIO_SEGUNDOS)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!email || loading) return
    await enviarLink()
  }

  async function entrarConCodigo(e: React.FormEvent) {
    e.preventDefault()
    if (!email || codigo.length < CODIGO_LARGO || codigoLoading) return
    setCodigoLoading(true)
    setCodigoError(null)

    // El canje se resuelve en el servidor (POST /api/auth/session) para que
    // la sesión salga en un Set-Cookie real -- ver app/auth/callback/page.tsx.
    const res = await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp: codigo }),
    }).catch(() => null)

    if (!res || !res.ok) {
      setCodigoError('El código no es válido o ya venció. Revisa que sea el del correo más reciente.')
      setCodigoLoading(false)
      return
    }
    await irADestino(params.get('next'))
  }

  return (
    <div className="min-h-[70dvh] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm motion-safe:animate-[fadeIn_250ms_ease-out]">
        <Card strong className="p-8 space-y-7">
          <div className="flex flex-col gap-4">
            <Image src="/logo.png" alt="" width={44} height={44} className="rounded-[4px]" />
            <div>
              <p className="eyebrow">Comunidad Pedro Huisca</p>
              <h1 className="titulo-md mt-2">
                Proyecto <em>PAT.</em>
              </h1>
            </div>
          </div>

          {enviado ? (
            <div className="space-y-5 motion-safe:animate-[fadeIn_200ms_ease-out]">
              <div className="space-y-2">
                <h2 className="text-base font-semibold" style={{ color: 'var(--tinta)' }}>
                  Revisa tu correo
                </h2>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  {email ? (
                    <>Te enviamos a <strong>{email}</strong> un link y un código de {CODIGO_LARGO} dígitos. Toca el botón del correo, o escribe el código acá.</>
                  ) : (
                    <>Escribe tu email y el código de {CODIGO_LARGO} dígitos que viene en el correo.</>
                  )}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Llega de parte de <strong>Comunidad Pedro Huisca</strong>. Si no aparece en un minuto, revisa la carpeta de spam.
                </p>
              </div>

              <form onSubmit={entrarConCodigo} className="space-y-3 text-left">
                {!email && (
                  <Input
                    type="email"
                    autoFocus
                    autoComplete="email"
                    inputMode="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="tu@email.com"
                    aria-label="Email"
                    required
                  />
                )}
                <Input
                  type="text"
                  autoFocus={!!email}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={CODIGO_LARGO}
                  value={codigo}
                  onChange={e => setCodigo(e.target.value.replace(/\D/g, '').slice(0, CODIGO_LARGO))}
                  placeholder="Código de 6 dígitos"
                  aria-label="Código de acceso"
                  className="text-center tracking-[0.3em] text-lg"
                  required
                />
                {codigoError && <Alert tone="error">{codigoError}</Alert>}
                <Button type="submit" disabled={codigoLoading || codigo.length < CODIGO_LARGO || !email} className="w-full">
                  {codigoLoading ? 'Entrando…' : 'Entrar con el código'}
                </Button>
              </form>

              <div className="flex items-center justify-center gap-4 text-sm pt-1" style={{ color: 'var(--text-muted)' }}>
                <button
                  type="button"
                  onClick={enviarLink}
                  disabled={loading || cooldown > 0 || !email}
                  className="font-medium underline underline-offset-2 min-h-[44px] disabled:no-underline disabled:opacity-60"
                >
                  {loading ? 'Enviando…' : cooldown > 0 ? `Reenviar en ${cooldown}s` : 'Reenviar correo'}
                </button>
                <span aria-hidden>·</span>
                <button
                  type="button"
                  onClick={() => { setEnviado(false); setCodigo(''); setCodigoError(null); setError(null) }}
                  className="font-medium underline underline-offset-2 min-h-[44px]"
                >
                  Cambiar email
                </button>
              </div>
              {error && <Alert tone="error">{error}</Alert>}
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4 text-left">
              <p className="text-sm text-center" style={{ color: 'var(--text-muted)' }}>
                Ingresa tu email y te mandamos un link de acceso — sin contraseña.
              </p>
              <Input
                type="email"
                autoFocus
                autoComplete="email"
                inputMode="email"
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
