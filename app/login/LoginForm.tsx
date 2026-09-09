'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { Input, Button, Alert } from '@/components/design-system'
import { DURACION, EASE, RESORTE } from '@/lib/motion'

// La LÓGICA de este formulario está en producción y tiene gotchas ganados a
// pulso (emailRedirectTo obligatorio por el template del correo, canje del
// OTP en el servidor, navegación dura al final). No se tocó nada de eso: lo
// único que cambió respecto de la versión anterior es la presentación y el
// paso de un estado al otro.

const REENVIO_SEGUNDOS = 60
const CODIGO_LARGO = 6

// Ir al destino con navegación dura: proxy.ts lee la cookie recién seteada
// por /api/auth/session y el router cache de Next podría no verla.
async function irADestino(next: string | null) {
  const whoami = await fetch('/api/whoami').then(r => r.json()).catch(() => null)
  window.location.assign(whoami?.role === 'socio' ? '/mi-dashboard' : (next || '/'))
}

export function LoginForm() {
  const reducido = useReducedMotion()
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

  // El paso "pedir email" -> "escribir código" cambia la altura de la
  // tarjeta. `layout` la anima con transform (escala + contraescala en los
  // hijos), no interpolando `height`: animar height dispara layout y paint en
  // cada frame, que es justo lo que no se puede pagar en un celular de gama
  // baja. Con movimiento reducido la tarjeta salta y solo cruzan las
  // opacidades.
  const transicionCaja = reducido ? { duration: 0 } : RESORTE.panel
  const paso = { duration: DURACION.microestado, ease: EASE.salida }

  return (
    <motion.div
      layout={!reducido}
      transition={transicionCaja}
      className="glass-strong rounded-[6px] p-6 sm:p-8"
    >
      {/* mode="wait": el estado saliente termina antes de que entre el
          siguiente. Si se cruzan, por un instante hay dos formularios
          superpuestos y se ven dos campos de email. */}
      <AnimatePresence mode="wait" initial={false}>
        {enviado ? (
          <motion.div
            key="codigo"
            initial={{ opacity: 0, y: reducido ? 0 : 8 }}
            animate={{ opacity: 1, y: 0, transition: paso }}
            exit={{ opacity: 0, y: reducido ? 0 : -8, transition: { duration: 0.12, ease: EASE.salida } }}
            className="space-y-5"
          >
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
          </motion.div>
        ) : (
          <motion.form
            key="email"
            onSubmit={submit}
            initial={{ opacity: 0, y: reducido ? 0 : 8 }}
            animate={{ opacity: 1, y: 0, transition: paso }}
            exit={{ opacity: 0, y: reducido ? 0 : -8, transition: { duration: 0.12, ease: EASE.salida } }}
            className="space-y-4 text-left"
          >
            <div className="space-y-1">
              <p className="eyebrow">Entrar</p>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Ingresa tu email y te mandamos un link de acceso — sin contraseña.
              </p>
            </div>
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
          </motion.form>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
