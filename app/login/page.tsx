'use client'

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

function LoginForm() {
  const params = useSearchParams()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!password || loading) return
    setLoading(true)
    setError(null)
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    setLoading(false)
    if (!res.ok) {
      setError('Contraseña incorrecta')
      return
    }
    // Navegación dura (no router.replace/refresh): el Navbar prefetchea todas
    // las rutas apenas se monta /login, sin sesión -- Next cachea esas
    // respuestas (redirigidas a /login) en el router cache. Un replace()
    // client-side las reutiliza y rebota de vuelta al login aunque la cookie
    // ya esté seteada. window.location fuerza un request nuevo, sin caché.
    window.location.assign(params.get('next') || '/')
  }

  return (
    <div className="max-w-sm mx-auto mt-16 space-y-4">
      <h1 className="text-xl font-semibold text-center">Proyecto PAT</h1>
      <p className="text-sm text-center text-gray-500">Ingresa la contraseña compartida para continuar.</p>
      <form onSubmit={submit} className="space-y-3">
        <input
          type="password"
          autoFocus
          value={password}
          onChange={e => setPassword(e.target.value)}
          className="w-full rounded-xl border border-gray-300 px-4 py-2.5"
          placeholder="Contraseña"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-indigo-600 text-white py-2.5 font-medium disabled:opacity-50"
        >
          {loading ? 'Ingresando…' : 'Ingresar'}
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
