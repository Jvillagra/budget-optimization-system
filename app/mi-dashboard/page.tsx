'use client'

import { useEffect, useRef, useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Trash2, Upload } from 'lucide-react'
import type { Beneficiario, Asignacion, Proveedor } from '@/lib/types'
import { buildPrecioMap, calcularCostoCarrito, formatCLP, PRESUPUESTO_BASE } from '@/lib/business-logic'
import { useProveedor } from '@/lib/proveedor-context'
import { FOTOS_REQUERIDAS } from '@/lib/constants'
import { Card, Alert } from '@/components/design-system'
import { cx } from '@/components/design-system/cx'

const COLORES: Record<string, string> = {
  'Invernadero': '#3a7d44',
  'Cierre Perimetral': '#9a6a3a',
  'Ambos': '#6b8fa3',
}
const MAX_FOTOS = 5

type Foto = { id: string; uploaded_at: string; url: string }

// Foto de perfil vía Gravatar (ver app/api/mi-dashboard/route.ts) con fallback
// a iniciales -- Gravatar responde 404 si el socio nunca configuró una, así
// que el fallback es el camino esperado para la mayoría, no un error real.
function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/)
  return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase()
}

function Avatar({ url, nombre }: { url: string | null; nombre: string }) {
  const [fallo, setFallo] = useState(!url)
  return (
    <div
      className="shrink-0 h-14 w-14 rounded-full p-[2px] motion-safe:animate-[scaleIn_200ms_ease-out]"
      style={{ background: 'linear-gradient(135deg, var(--verde) 0%, var(--cafe) 100%)' }}
    >
      {!fallo && url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={`Foto de perfil de ${nombre}`}
          className="h-full w-full rounded-full object-cover border-2 border-white opacity-0 transition-opacity duration-200 ease-out"
          onLoad={e => e.currentTarget.classList.replace('opacity-0', 'opacity-100')}
          onError={() => setFallo(true)}
        />
      ) : (
        <div
          className="h-full w-full rounded-full border-2 border-white flex items-center justify-center text-sm font-semibold"
          style={{ background: 'var(--verde-muted)', color: 'var(--verde-dark)' }}
        >
          {iniciales(nombre)}
        </div>
      )}
    </div>
  )
}

export default function MiDashboardPage() {
  const { proveedorId, setProveedorId } = useProveedor()
  const [beneficiario, setBeneficiario] = useState<Beneficiario | null>(null)
  const [asignaciones, setAsignaciones] = useState<Asignacion[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [precioMap, setPrecioMap] = useState(new Map<string, number | null>())
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [fotos, setFotos] = useState<Foto[]>([])
  const [fotosLoading, setFotosLoading] = useState(true)
  const [subiendo, setSubiendo] = useState(false)
  const [fotoError, setFotoError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function load() {
      const res = await fetch('/api/mi-dashboard')
      if (!res.ok) { setNotFound(true); setLoading(false); return }
      const { beneficiario: ben, asignaciones: asigs, proveedores: provs, preciosProveedor: precs, avatarUrl: avatar } = await res.json()
      setBeneficiario(ben)
      setAsignaciones(asigs ?? [])
      setProveedores(provs ?? [])
      setAvatarUrl(avatar ?? null)
      if (precs) setPrecioMap(buildPrecioMap(precs))
      const idsDisponibles = new Set((provs ?? []).map((p: Proveedor) => p.id))
      if ((!proveedorId || !idsDisponibles.has(proveedorId)) && provs?.length) setProveedorId(provs[0].id)
      setLoading(false)
    }
    load()
    cargarFotos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function cargarFotos() {
    setFotosLoading(true)
    const res = await fetch('/api/fotos')
    if (res.ok) {
      const { fotos } = await res.json()
      setFotos(fotos)
    }
    setFotosLoading(false)
  }

  async function subirFotos(files: FileList | null) {
    if (!files || files.length === 0) return
    setFotoError(null)
    setSubiendo(true)
    for (const file of Array.from(files)) {
      if (fotos.length >= MAX_FOTOS) {
        setFotoError(`Ya tienes el máximo de ${MAX_FOTOS} fotos.`)
        break
      }
      try {
        const urlRes = await fetch('/api/fotos/upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contentType: file.type, size: file.size }),
        })
        const urlData = await urlRes.json()
        if (!urlRes.ok) { setFotoError(urlData.error ?? 'Error al subir'); continue }

        const putRes = await fetch(urlData.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file })
        if (!putRes.ok) { setFotoError('Error al subir la imagen'); continue }

        await fetch('/api/fotos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: urlData.key }),
        })
      } catch {
        setFotoError('Error al subir la imagen')
      }
    }
    setSubiendo(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
    cargarFotos()
  }

  async function eliminarFoto(id: string) {
    setFotos(prev => prev.filter(f => f.id !== id))
    await fetch(`/api/fotos?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
  }

  if (loading) return (
    <div className="text-center py-16 text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</div>
  )
  if (notFound || !beneficiario) {
    return (
      <Card strong className="max-w-md mx-auto mt-16 p-8 text-center space-y-2">
        <h1 className="text-lg font-semibold" style={{ color: '#1c1c1c' }}>Tu cuenta no está habilitada todavía</h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Avisa a la organización del Proyecto PAT para que asocien tu email.
        </p>
      </Card>
    )
  }

  const carrito = proveedorId ? calcularCostoCarrito(asignaciones, proveedorId, precioMap) : { total: 0 }
  const aporteBolsillo = Math.max(0, carrito.total - PRESUPUESTO_BASE)

  const porSegmento = new Map<string, number>()
  if (proveedorId) {
    for (const a of asignaciones) {
      const seg = a.catalogo_insumos?.segmento ?? 'Otro'
      const precio = precioMap.get(`${proveedorId}_${a.insumo_id}`)
      if (precio == null) continue
      porSegmento.set(seg, (porSegmento.get(seg) ?? 0) + a.cantidad * precio)
    }
  }
  const chartData = Array.from(porSegmento.entries()).map(([segmento, valor]) => ({ segmento, valor }))

  return (
    <div className="space-y-8 max-w-2xl mx-auto">
      <div className="flex items-center gap-3">
        <Avatar url={avatarUrl} nombre={beneficiario.nombre} />
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--verde-dark)' }}>
            Hola, {beneficiario.nombre.split(' ')[0]}
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{beneficiario.segmento} · Proyecto PAT</p>
        </div>
      </div>

      {proveedores.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {proveedores.map(p => (
            <button
              key={p.id}
              onClick={() => setProveedorId(p.id)}
              className={cx(
                'px-3 py-1.5 rounded-full text-sm font-medium border transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[var(--verde)]',
                proveedorId === p.id ? 'text-white border-transparent' : 'border-black/12'
              )}
              style={proveedorId === p.id
                ? { background: 'var(--verde)' }
                : { color: 'var(--text-muted)' }}
            >
              {p.nombre}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4 motion-safe:animate-[riseIn_220ms_ease-out]">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Presupuesto base</p>
          <p className="text-lg font-semibold" style={{ color: '#1c1c1c' }}>{formatCLP(PRESUPUESTO_BASE)}</p>
        </Card>
        <Card className="p-4 motion-safe:animate-[riseIn_220ms_ease-out]" style={{ animationDelay: '40ms' }}>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Total de tu compra</p>
          <p className="text-lg font-semibold" style={{ color: '#1c1c1c' }}>{formatCLP(carrito.total)}</p>
        </Card>
        <Card className="p-4 col-span-2 motion-safe:animate-[riseIn_220ms_ease-out]" style={{ animationDelay: '80ms' }}>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Aporte de bolsillo</p>
          <p className="text-lg font-semibold" style={{ color: '#1c1c1c' }}>{formatCLP(aporteBolsillo)}</p>
        </Card>
      </div>

      {chartData.length > 0 && (
        <Card className="p-4">
          <p className="text-sm font-semibold mb-2" style={{ color: '#1c1c1c' }}>Composición de tu compra</p>
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={chartData} dataKey="valor" nameKey="segmento" cx="50%" cy="50%" outerRadius={80} label={(props: { name?: string; percent?: number }) => `${props.name} ${((props.percent ?? 0) * 100).toFixed(0)}%`}>
                  {chartData.map(d => <Cell key={d.segmento} fill={COLORES[d.segmento] ?? '#999'} />)}
                </Pie>
                <Tooltip formatter={(v) => formatCLP(Number(v))} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold" style={{ color: '#1c1c1c' }}>Fotos de tu compra</p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {fotos.length} de {MAX_FOTOS} · mínimo {FOTOS_REQUERIDAS} para tu rendición
          </p>
        </div>

        {fotoError && <Alert tone="error">{fotoError}</Alert>}

        {fotosLoading ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {fotos.map(f => (
              <div key={f.id} className="relative group aspect-square rounded-lg overflow-hidden" style={{ background: 'rgba(0,0,0,0.04)' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url} alt="Comprobante de compra" className="w-full h-full object-cover" />
                <button
                  onClick={() => eliminarFoto(f.id)}
                  className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1.5 transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  aria-label="Eliminar foto"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            {fotos.length < MAX_FOTOS && (
              <label
                className={cx(
                  'aspect-square rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors',
                  'hover:border-[var(--verde)] hover:text-[var(--verde-dark)] focus-within:ring-2 focus-within:ring-[var(--verde)] focus-within:ring-offset-1'
                )}
                style={{ borderColor: 'rgba(0,0,0,0.15)', color: 'var(--text-muted)' }}
              >
                <Upload size={18} />
                <span className="text-xs">{subiendo ? 'Subiendo…' : 'Agregar'}</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                  multiple
                  className="hidden"
                  disabled={subiendo}
                  onChange={e => subirFotos(e.target.files)}
                />
              </label>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}
