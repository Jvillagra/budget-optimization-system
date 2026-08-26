'use client'

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { Card, Input, Button, Alert } from '@/components/design-system'

function LoginForm() {
  const params = useSearchParams()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [enviado, setEnviado] = useState(false)

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
            <div className="space-y-2 motion-safe:animate-[fadeIn_200ms_ease-out]">
              <h2 className="text-base font-semibold" style={{ color: '#1c1c1c' }}>
                Revisa tu correo
              </h2>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Te enviamos un link de acceso a <strong>{email}</strong>. Ábrelo desde
                este mismo dispositivo para entrar.
              </p>
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
