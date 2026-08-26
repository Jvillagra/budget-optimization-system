'use client'

import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Card, Button, Input, Badge, Alert } from '@/components/design-system'

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

  const owners = roles.filter(r => r.role === 'owner').length
  const admins = roles.filter(r => r.role === 'admin').length

  return (
    <div className="max-w-xl mx-auto space-y-8">
      <h1 className="text-lg font-bold" style={{ color: 'var(--verde-dark)' }}>Administración</h1>

      <Card className="p-4 grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-semibold" style={{ color: 'var(--verde-dark)' }}>Owners</p>
          <p className="text-xl font-bold mt-1" style={{ color: '#1c1c1c' }}>{loading ? '—' : owners}</p>
        </div>
        <div>
          <p className="text-xs font-semibold" style={{ color: 'var(--cafe-dark)' }}>Admins</p>
          <p className="text-xl font-bold mt-1" style={{ color: '#1c1c1c' }}>{loading ? '—' : admins}</p>
        </div>
      </Card>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
          Owner / Admin
        </h2>
        {loading ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</p>
        ) : (
          <Card className="divide-y divide-black/6 overflow-hidden">
            {roles.map(r => (
              <div key={r.user_id} className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="flex items-center gap-2" style={{ color: '#1c1c1c' }}>
                  {r.email}
                  <Badge tone={r.role === 'owner' ? 'verde' : 'cafe'}>{r.role}</Badge>
                </span>
                {r.role !== 'owner' && (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => quitarAdmin(r.user_id)}
                    aria-label={`Quitar a ${r.email} de admin`}
                  >
                    <Trash2 size={12} /> quitar
                  </Button>
                )}
              </div>
            ))}
          </Card>
        )}
        <div className="flex gap-2">
          <div className="flex-1">
            <Input
              value={nuevoEmail}
              onChange={e => setNuevoEmail(e.target.value)}
              placeholder="email@ejemplo.com"
              aria-label="Email del nuevo admin"
            />
          </div>
          <Button onClick={agregarAdmin}>Agregar admin</Button>
        </div>
        {msg && <Alert tone="warning">{msg}</Alert>}
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
          Informe para consultora
        </h2>
        <Card className="p-4 space-y-3">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Descarga un PDF con el total general y el detalle por beneficiario
            (proveedor de compra, total cotizado y fotos de comprobante) para
            enviar a la empresa consultora que audita el proyecto.
          </p>
          <a href="/api/admin/informe-consultora">
            <Button>Descargar informe PDF</Button>
          </a>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
          Magic Links masivos
        </h2>
        <Card className="p-4 space-y-3">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Envía un link de acceso a todos los socios que tengan email cargado.
          </p>
          <Button onClick={enviarMagicLinks} disabled={enviando}>
            {enviando ? 'Enviando…' : 'Enviar Magic Links a todos los socios'}
          </Button>
          {reporte && (
            <Alert tone="info">
              {reporte.enviados} enviados, {reporte.fallidos} fallidos.
            </Alert>
          )}
        </Card>
      </section>
    </div>
  )
}
