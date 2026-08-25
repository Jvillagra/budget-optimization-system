'use client'

import { useEffect, useState } from 'react'

interface RoleRow { user_id: string; role: string; email: string }

export default function AdminPage() {
  const [roles, setRoles] = useState<RoleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [nuevoEmail, setNuevoEmail] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [reporte, setReporte] = useState<{ enviados: number; fallidos: number } | null>(null)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setLoading(true)
    const res = await fetch('/api/admin/roles')
    if (res.ok) setRoles((await res.json()).roles)
    setLoading(false)
  }

  async function agregarAdmin() {
    const email = nuevoEmail.trim()
    if (!email) return
    setMsg(null)
    const res = await fetch('/api/admin/roles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    const data = await res.json()
    if (data.pending) setMsg(data.message)
    else if (res.ok) { setNuevoEmail(''); cargar() }
    else setMsg(data.error ?? 'Error')
  }

  async function quitarAdmin(userId: string) {
    await fetch(`/api/admin/roles?userId=${encodeURIComponent(userId)}`, { method: 'DELETE' })
    cargar()
  }

  async function enviarMagicLinks() {
    setEnviando(true)
    setReporte(null)
    const res = await fetch('/api/admin/enviar-magic-links', { method: 'POST' })
    if (res.ok) setReporte(await res.json())
    setEnviando(false)
  }

  return (
    <div className="max-w-xl mx-auto space-y-8">
      <h1 className="text-xl font-semibold">Administración</h1>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-gray-500">Owner / Admin</h2>
        {loading ? <p className="text-sm text-gray-400">Cargando…</p> : (
          <ul className="divide-y divide-gray-200 rounded-xl border border-gray-200 bg-white">
            {roles.map(r => (
              <li key={r.user_id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span>{r.email} <span className="text-gray-400">· {r.role}</span></span>
                {r.role !== 'owner' && (
                  <button onClick={() => quitarAdmin(r.user_id)} className="text-red-600 text-xs">quitar</button>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <input
            value={nuevoEmail}
            onChange={e => setNuevoEmail(e.target.value)}
            placeholder="email@ejemplo.com"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <button onClick={agregarAdmin} className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm">Agregar admin</button>
        </div>
        {msg && <p className="text-xs text-amber-700">{msg}</p>}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-gray-500">Magic Links masivos</h2>
        <p className="text-xs text-gray-400">Envía un link de acceso a todos los socios que tengan email cargado.</p>
        <button
          onClick={enviarMagicLinks}
          disabled={enviando}
          className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm disabled:opacity-50"
        >
          {enviando ? 'Enviando…' : 'Enviar Magic Links a todos los socios'}
        </button>
        {reporte && (
          <p className="text-xs text-gray-600">
            {reporte.enviados} enviados, {reporte.fallidos} fallidos.
          </p>
        )}
      </section>
    </div>
  )
}
