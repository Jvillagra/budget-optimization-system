'use client'

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'

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

  if (enviado) {
    return (
      <div className="max-w-sm mx-auto mt-16 space-y-4 text-center">
        <h1 className="text-xl font-semibold">Revisa tu correo</h1>
        <p className="text-sm text-gray-500">
          Te enviamos un link de acceso a <strong>{email}</strong>. Ábrelo desde
          este mismo dispositivo para entrar.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-sm mx-auto mt-16 space-y-4">
      <h1 className="text-xl font-semibold text-center">Proyecto PAT</h1>
      <p className="text-sm text-center text-gray-500">
        Ingresa tu email y te mandamos un link de acceso — sin contraseña.
      </p>
      <form onSubmit={submit} className="space-y-3">
        <input
          type="email"
          autoFocus
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="w-full rounded-xl border border-gray-300 px-4 py-2.5"
          placeholder="tu@email.com"
          required
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-indigo-600 text-white py-2.5 font-medium disabled:opacity-50"
        >
          {loading ? 'Enviando…' : 'Enviarme el link'}
        </button>
      </form>
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
