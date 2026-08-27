'use client'

import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Card, Button, Input, Badge, Alert, ConfirmDialog, Skeleton } from '@/components/design-system'

interface RoleRow { user_id: string; role: string; email: string }

const ROL_LABEL: Record<string, string> = {
  owner: 'Propietario',
  admin: 'Administrador',
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function AdminPage() {
  const [roles, setRoles] = useState<RoleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [nuevoEmail, setNuevoEmail] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [reporte, setReporte] = useState<{ enviados: number; fallidos: number } | null>(null)
  const [quitarObjetivo, setQuitarObjetivo] = useState<RoleRow | null>(null)
  const [quitando, setQuitando] = useState(false)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setLoading(true)
    setLoadError(false)
    try {
      const res = await fetch('/api/admin/roles')
      if (!res.ok) throw new Error('load failed')
      setRoles((await res.json()).roles)
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  async function agregarAdmin() {
    const email = nuevoEmail.trim()
    if (!email) return
    if (!EMAIL_RE.test(email)) {
      setMsg('Ese email no parece válido. Revísalo e intenta de nuevo.')
      return
    }
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

  async function confirmarQuitarAdmin() {
    if (!quitarObjetivo) return
    setQuitando(true)
    await fetch(`/api/admin/roles?userId=${encodeURIComponent(quitarObjetivo.user_id)}`, { method: 'DELETE' })
    setQuitando(false)
    setQuitarObjetivo(null)
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

  if (loadError) return (
    <div className="max-w-xl mx-auto">
      <Card className="p-8 text-center space-y-3">
        <p className="text-sm font-semibold" style={{ color: 'var(--cafe-dark)' }}>Error al cargar la administración</p>
        <Button onClick={cargar}>Reintentar</Button>
      </Card>
    </div>
  )

  return (
    <div className="max-w-xl mx-auto space-y-8">
      <h1 className="text-lg font-bold" style={{ color: 'var(--verde-dark)' }}>Administración</h1>

      {loading ? (
        <Skeleton className="h-24" />
      ) : (
        <Card className="p-4 grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--verde-dark)' }}>Propietarios</p>
            <p className="text-xl font-bold mt-1" style={{ color: '#1c1c1c' }}>{owners}</p>
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--cafe-dark)' }}>Administradores</p>
            <p className="text-xl font-bold mt-1" style={{ color: '#1c1c1c' }}>{admins}</p>
          </div>
        </Card>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
          Propietarios y administradores
        </h2>
        {loading ? (
          <Skeleton className="h-40" />
        ) : (
          <Card className="divide-y divide-black/6 overflow-hidden">
            {roles.map(r => (
              <div key={r.user_id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="flex items-center gap-2 min-w-0" style={{ color: '#1c1c1c' }}>
                  <span className="truncate">{r.email}</span>
                  <Badge tone={r.role === 'owner' ? 'verde' : 'cafe'} className="shrink-0">
                    {ROL_LABEL[r.role] ?? r.role}
                  </Badge>
                </span>
                {r.role !== 'owner' && (
                  <Button
                    variant="danger"
                    size="sm"
                    className="shrink-0"
                    onClick={() => setQuitarObjetivo(r)}
                    aria-label={`Quitar a ${r.email} de administrador`}
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
              type="email"
              autoComplete="email"
              inputMode="email"
            />
          </div>
          <Button onClick={agregarAdmin}>Agregar admin</Button>
        </div>
        {msg && <Alert tone="warning">{msg}</Alert>}
      </section>

      {quitarObjetivo && (
        <ConfirmDialog
          title="Quitar administrador"
          description={`${quitarObjetivo.email} dejará de tener acceso de administrador. Podrás volver a agregarlo/a después si es necesario.`}
          confirmLabel="Quitar"
          onConfirm={confirmarQuitarAdmin}
          onCancel={() => setQuitarObjetivo(null)}
          busy={quitando}
        />
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
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
        <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
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
