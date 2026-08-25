'use client'

import { useEffect, useRef, useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Trash2, Upload } from 'lucide-react'
import type { Beneficiario, Asignacion, Proveedor } from '@/lib/types'
import { buildPrecioMap, calcularCostoCarrito, formatCLP, PRESUPUESTO_BASE } from '@/lib/business-logic'
import { useProveedor } from '@/lib/proveedor-context'

const COLORES: Record<string, string> = {
  'Invernadero': '#3a7d44',
  'Cierre Perimetral': '#9a6a3a',
  'Ambos': '#6b8fa3',
}
const MAX_FOTOS = 5

type Foto = { id: string; uploaded_at: string; url: string }

export default function MiDashboardPage() {
  const { proveedorId, setProveedorId } = useProveedor()
  const [beneficiario, setBeneficiario] = useState<Beneficiario | null>(null)
  const [asignaciones, setAsignaciones] = useState<Asignacion[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [precioMap, setPrecioMap] = useState(new Map<string, number | null>())
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
      const { beneficiario: ben, asignaciones: asigs, proveedores: provs, preciosProveedor: precs } = await res.json()
      setBeneficiario(ben)
      setAsignaciones(asigs ?? [])
      setProveedores(provs ?? [])
      if (precs) setPrecioMap(buildPrecioMap(precs))
      if (!proveedorId && provs?.length) setProveedorId(provs[0].id)
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

  if (loading) return <div className="text-center py-16 text-gray-400">Cargando…</div>
  if (notFound || !beneficiario) {
    return (
      <div className="max-w-md mx-auto mt-16 text-center space-y-2">
        <h1 className="text-lg font-semibold">Tu cuenta no está habilitada todavía</h1>
        <p className="text-sm text-gray-500">Avisa a la organización del Proyecto PAT para que asocien tu email.</p>
      </div>
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
      <div>
        <h1 className="text-xl font-semibold">Hola, {beneficiario.nombre.split(' ')[0]}</h1>
        <p className="text-sm text-gray-500">{beneficiario.segmento} · Proyecto PAT</p>
      </div>

      {proveedores.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {proveedores.map(p => (
            <button
              key={p.id}
              onClick={() => setProveedorId(p.id)}
              className={`px-3 py-1.5 rounded-full text-sm border ${proveedorId === p.id ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 text-gray-600'}`}
            >
              {p.nombre}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white border border-gray-200 p-4">
          <p className="text-xs text-gray-400">Presupuesto base</p>
          <p className="text-lg font-semibold">{formatCLP(PRESUPUESTO_BASE)}</p>
        </div>
        <div className="rounded-2xl bg-white border border-gray-200 p-4">
          <p className="text-xs text-gray-400">Total de tu compra</p>
          <p className="text-lg font-semibold">{formatCLP(carrito.total)}</p>
        </div>
        <div className="rounded-2xl bg-white border border-gray-200 p-4 col-span-2">
          <p className="text-xs text-gray-400">Aporte de bolsillo</p>
          <p className="text-lg font-semibold">{formatCLP(aporteBolsillo)}</p>
        </div>
      </div>

      {chartData.length > 0 && (
        <div className="rounded-2xl bg-white border border-gray-200 p-4">
          <p className="text-sm font-medium mb-2">Composición de tu compra</p>
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
        </div>
      )}

      <div className="rounded-2xl bg-white border border-gray-200 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Fotos de tu compra</p>
          <p className="text-xs text-gray-400">{fotos.length} de {MAX_FOTOS}</p>
        </div>

        {fotoError && <p className="text-xs text-red-600">{fotoError}</p>}

        {fotosLoading ? (
          <p className="text-sm text-gray-400">Cargando…</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {fotos.map(f => (
              <div key={f.id} className="relative group aspect-square rounded-lg overflow-hidden bg-gray-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url} alt="Comprobante de compra" className="w-full h-full object-cover" />
                <button
                  onClick={() => eliminarFoto(f.id)}
                  className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1.5"
                  aria-label="Eliminar foto"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            {fotos.length < MAX_FOTOS && (
              <label className="aspect-square rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-1 text-gray-400 cursor-pointer">
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
      </div>
    </div>
  )
}
