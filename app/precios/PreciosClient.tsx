'use client'

import { useEffect, useState, useRef } from 'react'
import { ScanLine } from 'lucide-react'
import type { CatalogoInsumo, Proveedor } from '@/lib/types'
import { formatCLP } from '@/lib/business-logic'
import type { DatosStaff } from '@/lib/staff-data'

type PrecioMap = Map<string, number | null>
type VisionItem = { nombre_insumo: string; precio_extraido: number }

// `initial` viene del Server Component (app/precios/page.tsx), ver
// lib/staff-data.ts. null = falló server-side, se reintenta con /api/data.
export default function PreciosClient({ initial }: { initial: DatosStaff | null }) {
  const [insumos, setInsumos] = useState<CatalogoInsumo[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [precios, setPrecios] = useState<PrecioMap>(new Map())
  const [saving, setSaving] = useState<Set<string>>(new Set())
  // Celdas cuyo último intento de guardado no llegó a la base. Antes un
  // valor inválido o un POST fallido no producían NINGÚN aviso: el número
  // quedaba en pantalla y el usuario creía que estaba guardado.
  const [errores, setErrores] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [addingProv, setAddingProv] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editNombre, setEditNombre] = useState('')
  // Mobile: la matriz insumo×proveedor no cabe en pantalla chica (celdas de
  // 128px por proveedor). En vez de scroll horizontal se edita un proveedor
  // a la vez, elegido acá, con una tarjeta grande por insumo.
  const [mobileProvId, setMobileProvId] = useState('')
  // IA Vision
  const [showVision, setShowVision] = useState(false)
  const [visionFile, setVisionFile] = useState<File | null>(null)
  const [visionPreview, setVisionPreview] = useState<string | null>(null)
  const [visionLoading, setVisionLoading] = useState(false)
  const [visionData, setVisionData] = useState<VisionItem[] | null>(null)
  const [visionProvId, setVisionProvId] = useState('')
  const [visionError, setVisionError] = useState<string | null>(null)
  const [visionResultado, setVisionResultado] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const datos: DatosStaff | null = initial ?? await fetch('/api/data').then(r => r.ok ? r.json() : null)
      const { catalogoInsumos: ins, proveedores: provs, preciosProveedor: precs } = datos ?? {}
      if (ins) setInsumos(ins as CatalogoInsumo[])
      if (provs) setProveedores(provs as Proveedor[])
      if (precs) {
        const map: PrecioMap = new Map()
        for (const p of precs) map.set(`${p.proveedor_id}_${p.insumo_id}`, p.precio_unitario)
        setPrecios(map)
      }
      if (provs?.length) setMobileProvId(provs[0].id)
      setLoading(false)
    }
    load()
  }, [initial])

  function marcarError(key: string, mensaje: string | null) {
    setErrores(prev => {
      const n = new Map(prev)
      if (mensaje) n.set(key, mensaje); else n.delete(key)
      return n
    })
  }

  async function handleBlur(provId: string, insumoId: string, rawValue: string) {
    const key = `${provId}_${insumoId}`
    const texto = rawValue.trim()

    // parseFloat aceptaba basura con prefijo numérico ("45000 pesos" -> 45000)
    // y devolvía NaN en silencio para el resto. Acá el formato es explícito:
    // vacío = no cotizado, o un número >= 0 (coma o punto decimal).
    let precio: number | null
    if (texto === '') {
      precio = null
    } else if (/^\d+([.,]\d+)?$/.test(texto)) {
      precio = Number(texto.replace(',', '.'))
    } else {
      marcarError(key, 'Escribe solo el número, sin puntos de miles ni texto.')
      return
    }
    if (precio !== null && (!Number.isFinite(precio) || precio < 0)) {
      marcarError(key, 'El precio no puede ser negativo.')
      return
    }

    marcarError(key, null)
    setSaving(s => new Set(s).add(key))
    const res = await fetch('/api/precios-proveedor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proveedor_id: provId, insumo_id: insumoId, precio_unitario: precio }),
    }).catch(() => null)

    if (res?.ok) {
      setPrecios(prev => new Map(prev).set(key, precio))
    } else {
      const data = await res?.json().catch(() => null)
      marcarError(key, data?.error ?? 'No se pudo guardar. Revisa tu conexión e intenta de nuevo.')
    }
    setSaving(s => { const n = new Set(s); n.delete(key); return n })
  }

  async function agregarProveedor() {
    const nombre = nuevoNombre.trim()
    if (!nombre) return
    const res = await fetch('/api/proveedores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre }),
    })
    const { data } = await res.json()
    if (res.ok && data) {
      setProveedores(prev => [...prev, data as Proveedor].sort((a, b) => a.nombre.localeCompare(b.nombre)))
      setMobileProvId(prev => prev || data.id)
      setNuevoNombre('')
      setAddingProv(false)
    }
  }

  async function guardarNombreProveedor(id: string) {
    const nombre = editNombre.trim()
    if (!nombre) { setEditingId(null); return }
    const res = await fetch('/api/proveedores', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, nombre }),
    })
    if (res.ok) setProveedores(prev => prev.map(p => p.id === id ? { ...p, nombre } : p))
    setEditingId(null)
  }

  function handleVisionFile(file: File) {
    setVisionFile(file)
    setVisionData(null)
    const url = URL.createObjectURL(file)
    setVisionPreview(url)
  }

  async function escanearCotizacion() {
    if (!visionFile) return
    setVisionLoading(true)
    setVisionData(null)
    setVisionError(null)
    setVisionResultado(null)
    const fd = new FormData()
    fd.append('image', visionFile)
    fd.append('catalogo', JSON.stringify(insumos.map(i => i.nombre)))
    const res = await fetch('/api/vision', { method: 'POST', body: fd }).catch(() => null)
    const json = await res?.json().catch(() => null)
    // Antes se ignoraba el status: un 403 o un 500 dejaban la lista vacía
    // como si la cotización simplemente no tuviera precios reconocibles.
    if (!res?.ok) {
      setVisionError(json?.error ?? 'No se pudo procesar la imagen.')
    } else {
      setVisionData(json?.data ?? [])
    }
    setVisionLoading(false)
  }

  async function aplicarPrecios() {
    if (!visionData || !visionProvId) return
    setVisionError(null)
    let aplicados = 0
    const omitidos: string[] = []

    for (const item of visionData) {
      // Match EXACTO contra el catálogo. El `includes()` bidireccional
      // anterior hacía que "Malla" calzara con Ursus 80, Ursus 100 e
      // Inchalam a la vez y `find` se quedaba con el primero: se escribía el
      // precio de un producto sobre otro, en bucle y sin confirmación.
      // El endpoint ya solo devuelve nombres que existen en el catálogo.
      const candidatos = insumos.filter(i => i.nombre === item.nombre_insumo)
      if (candidatos.length !== 1) { omitidos.push(item.nombre_insumo); continue }
      const insumo = candidatos[0]

      const key = `${visionProvId}_${insumo.id}`
      const res = await fetch('/api/precios-proveedor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proveedor_id: visionProvId, insumo_id: insumo.id, precio_unitario: item.precio_extraido }),
      }).catch(() => null)
      if (res?.ok) {
        setPrecios(prev => new Map(prev).set(key, item.precio_extraido))
        aplicados++
      } else {
        omitidos.push(item.nombre_insumo)
      }
    }

    setVisionResultado(
      omitidos.length === 0
        ? `${aplicados} precio(s) aplicados.`
        : `${aplicados} precio(s) aplicados. Sin aplicar: ${omitidos.join(', ')}.`
    )
    setShowVision(false)
    setVisionFile(null)
    setVisionPreview(null)
    setVisionData(null)
  }

  function hayPreciosIncompletos(provId: string): boolean {
    return insumos.some(i => {
      const p = precios.get(`${provId}_${i.id}`)
      return p === undefined || p === null
    })
  }

  const segmentos = ['Invernadero', 'Ambos', 'Cierre Perimetral'] as const

  if (loading) return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-10 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.4)' }} />
      ))}
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Cabecera con gestión de proveedores */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-bold" style={{ color: 'var(--verde-dark)' }}>maestro de precios</h1>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(0,0,0,0.4)' }}>
            Edición inline. Celda vacía = no cotizado. ⚠ indica precios incompletos.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowVision(true)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-semibold"
            style={{ background: 'rgba(127,79,36,0.12)', color: 'var(--cafe)', border: '1px solid rgba(127,79,36,0.25)' }}
          >
            <ScanLine size={13} /> Escanear Cotización (IA)
          </button>
          <button
            onClick={() => setAddingProv(v => !v)}
            className="text-xs px-3 py-1.5 rounded-lg font-semibold text-white"
            style={{ background: 'var(--verde)' }}
          >
            + nuevo proveedor
          </button>
        </div>
      </div>

      {visionResultado && (
        <div className="rounded-xl px-3 py-2 text-xs flex items-start justify-between gap-3"
          style={{ background: 'rgba(58,125,68,0.10)', color: 'var(--verde-dark)' }}>
          <span>{visionResultado}</span>
          <button onClick={() => setVisionResultado(null)} aria-label="Cerrar aviso">✕</button>
        </div>
      )}

      {/* Formulario nuevo proveedor */}
      {addingProv && (
        <div className="rounded-xl p-3 flex gap-2 glass-strong">
          <input
            autoFocus
            type="text"
            placeholder="Nombre del proveedor"
            value={nuevoNombre}
            onChange={e => setNuevoNombre(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && agregarProveedor()}
            className="flex-1 rounded-lg px-3 py-1.5 text-sm focus:outline-none"
            style={{ border: '1px solid rgba(58,125,68,0.3)', background: 'rgba(255,255,255,0.8)' }}
          />
          <button
            onClick={agregarProveedor}
            disabled={!nuevoNombre.trim()}
            className="px-4 py-1.5 rounded-lg text-sm text-white font-semibold disabled:opacity-40"
            style={{ background: 'var(--verde)' }}
          >
            guardar
          </button>
          <button
            onClick={() => { setAddingProv(false); setNuevoNombre('') }}
            className="px-3 py-1.5 rounded-lg text-sm"
            style={{ color: 'rgba(0,0,0,0.45)' }}
          >
            cancelar
          </button>
        </div>
      )}

      {/* Mobile: un proveedor a la vez, tarjetas grandes por insumo (ver
          comentario en mobileProvId más arriba). */}
      <div className="sm:hidden space-y-4">
        {proveedores.length === 0 ? (
          <p className="text-xs text-center py-6" style={{ color: 'rgba(0,0,0,0.4)' }}>
            Agrega un proveedor para empezar a cargar precios.
          </p>
        ) : (
          <>
            <div className="rounded-xl p-3 glass-strong flex items-center gap-3">
              <label className="text-xs font-semibold shrink-0" style={{ color: 'var(--cafe)' }}>
                Proveedor
              </label>
              <select
                value={mobileProvId}
                onChange={e => setMobileProvId(e.target.value)}
                className="flex-1 rounded-lg px-3 py-2 text-sm focus:outline-none"
                style={{ border: '1px solid rgba(58,125,68,0.3)', background: 'rgba(255,255,255,0.85)' }}
              >
                {proveedores.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}{hayPreciosIncompletos(p.id) ? ' ⚠ incompleto' : ''}
                  </option>
                ))}
              </select>
            </div>

            {segmentos.map(seg => {
              const items = insumos.filter(i => i.segmento === seg)
              if (!items.length) return null
              return (
                <div key={seg} className="space-y-2">
                  <p
                    className="text-xs font-semibold uppercase tracking-wide px-1"
                    style={{ color: seg === 'Invernadero' ? 'var(--verde-dark)' : seg === 'Cierre Perimetral' ? 'var(--cafe-dark)' : 'rgba(0,0,0,0.5)' }}
                  >
                    {seg}
                  </p>
                  {items.map(insumo => {
                    const key = `${mobileProvId}_${insumo.id}`
                    const precio = precios.get(key)
                    const isSaving = saving.has(key)
                    return (
                      <div key={insumo.id} className="rounded-xl p-3 glass flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate" style={{ color: '#1c1c1c' }}>{insumo.nombre}</p>
                          <p className="text-xs" style={{ color: 'rgba(0,0,0,0.4)' }}>{insumo.formato_venta}</p>
                        </div>
                        <div className="w-28 shrink-0">
                          <PrecioCell
                            initialValue={precio !== undefined ? precio : null}
                            isSaving={isSaving}
                            error={errores.get(key)}
                            big
                            onBlur={val => handleBlur(mobileProvId, insumo.id, val)}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </>
        )}
      </div>

      {/* Matriz de precios — desktop / tablet, edición por celda con scroll
          horizontal (varios proveedores a la vez). En mobile la reemplaza
          la vista de tarjetas de arriba: la matriz no cabe y los inputs sin
          valor no se distinguían de texto plano. */}
      <div className="hidden sm:block rounded-2xl overflow-x-auto glass" style={{ maxHeight: '75vh' }}>
        <table className="w-full text-sm border-collapse">
          <thead style={{ position: 'sticky', top: 0, zIndex: 20 }}>
            <tr style={{ background: 'rgba(45,95,53,0.92)', backdropFilter: 'blur(8px)' }}>
              <th
                className="text-left px-4 py-3 text-xs font-semibold text-white whitespace-nowrap"
                style={{ position: 'sticky', left: 0, zIndex: 30, background: 'var(--verde-dark)', minWidth: '220px' }}
              >
                insumo
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-white whitespace-nowrap" style={{ minWidth: '100px' }}>
                formato
              </th>
              {proveedores.map(p => {
                const incompleto = hayPreciosIncompletos(p.id)
                return (
                  <th key={p.id} className="px-4 py-3 text-xs font-semibold text-white whitespace-nowrap" style={{ minWidth: '160px' }}>
                    <div className="flex items-center justify-end gap-1.5">
                      {incompleto && (
                        <span title="Precios incompletos — no apto para simulación" style={{ color: '#fca5a5', fontSize: '13px' }}>⚠</span>
                      )}
                      {editingId === p.id ? (
                        <input
                          autoFocus
                          type="text"
                          value={editNombre}
                          onChange={e => setEditNombre(e.target.value)}
                          onBlur={() => guardarNombreProveedor(p.id)}
                          onKeyDown={e => e.key === 'Enter' && guardarNombreProveedor(p.id)}
                          className="rounded px-2 py-0.5 text-xs text-gray-900 w-32 focus:outline-none"
                          style={{ background: 'rgba(255,255,255,0.9)' }}
                        />
                      ) : (
                        <button
                          onClick={() => { setEditingId(p.id); setEditNombre(p.nombre) }}
                          className="hover:underline"
                          title="Editar nombre"
                        >
                          {p.nombre}
                        </button>
                      )}
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {segmentos.map(seg => {
              const items = insumos.filter(i => i.segmento === seg)
              if (!items.length) return null
              return [
                <tr key={`seg_${seg}`}>
                  <td
                    colSpan={2 + proveedores.length}
                    className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide"
                    style={{
                      background: seg === 'Invernadero' ? 'var(--verde-muted)' : seg === 'Cierre Perimetral' ? 'var(--cafe-muted)' : 'rgba(0,0,0,0.04)',
                      color: seg === 'Invernadero' ? 'var(--verde-dark)' : seg === 'Cierre Perimetral' ? 'var(--cafe-dark)' : 'rgba(0,0,0,0.5)',
                    }}
                  >
                    {seg}
                  </td>
                </tr>,
                ...items.map(insumo => (
                  <PrecioRow
                    key={insumo.id}
                    insumo={insumo}
                    proveedores={proveedores}
                    precios={precios}
                    saving={saving}
                    errores={errores}
                    onBlur={handleBlur}
                  />
                )),
              ]
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs" style={{ color: 'rgba(0,0,0,0.35)' }}>
        {insumos.length} insumos · {proveedores.length} proveedores · Los precios se guardan al salir de cada celda. Haz clic en el nombre del proveedor para editarlo.
      </p>

      {/* Modal IA Vision */}
      {showVision && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}>
          <div className="rounded-2xl p-6 w-full max-w-md space-y-4 glass-strong" style={{ background: 'rgba(255,255,255,0.96)' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ScanLine size={18} style={{ color: 'var(--cafe)' }} />
                <h2 className="font-bold text-sm" style={{ color: '#1c1c1c' }}>Escanear Cotización (IA)</h2>
              </div>
              <button onClick={() => { setShowVision(false); setVisionFile(null); setVisionPreview(null); setVisionData(null) }}
                className="text-lg leading-none" style={{ color: 'rgba(0,0,0,0.4)' }}>✕</button>
            </div>

            {/* Proveedor destino */}
            <div>
              <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--cafe)' }}>Aplicar precios a</label>
              <select value={visionProvId} onChange={e => setVisionProvId(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                style={{ border: '1px solid rgba(58,125,68,0.25)', background: 'rgba(255,255,255,0.7)' }}>
                <option value="">Seleccionar proveedor...</option>
                {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>

            {/* Drop zone */}
            {!visionPreview ? (
              <label className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed cursor-pointer py-8 gap-2"
                style={{ borderColor: 'rgba(127,79,36,0.3)', background: 'rgba(127,79,36,0.04)' }}>
                <ScanLine size={28} style={{ color: 'rgba(127,79,36,0.5)' }} />
                <span className="text-xs text-center" style={{ color: 'rgba(0,0,0,0.5)' }}>
                  Arrastra una imagen o haz clic para seleccionar.<br />
                  También puedes tomar una foto desde tu celular.
                </span>
                <input type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={e => e.target.files?.[0] && handleVisionFile(e.target.files[0])} />
              </label>
            ) : (
              <div className="space-y-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={visionPreview} alt="Cotización" className="w-full rounded-xl object-contain max-h-40" />
                {!visionData && (
                  <button onClick={escanearCotizacion} disabled={visionLoading || !visionProvId}
                    className="w-full rounded-xl py-2.5 text-sm text-white font-bold disabled:opacity-40 flex items-center justify-center gap-2"
                    style={{ background: 'var(--cafe)' }}>
                    {visionLoading ? (
                      <>
                        <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        Analizando cotización...
                      </>
                    ) : (
                      <><ScanLine size={15} /> Escanear</>
                    )}
                  </button>
                )}
              </div>
            )}

            {visionError && (
              <p className="text-xs rounded-lg px-3 py-2" style={{ background: 'rgba(220,38,38,0.08)', color: '#dc2626' }}>
                {visionError}
              </p>
            )}

            {/* Resultados */}
            {visionData && (
              <div className="space-y-3">
                {visionData.length === 0 ? (
                  <p className="text-xs text-center" style={{ color: 'rgba(0,0,0,0.45)' }}>
                    No se encontraron precios reconocibles en la imagen.
                  </p>
                ) : (
                  <>
                    <p className="text-xs font-semibold" style={{ color: 'var(--verde-dark)' }}>
                      {visionData.length} precio{visionData.length !== 1 ? 's' : ''} detectado{visionData.length !== 1 ? 's' : ''}:
                    </p>
                    <ul className="text-xs rounded-xl overflow-hidden" style={{ border: '1px solid rgba(0,0,0,0.07)' }}>
                      {visionData.map((item, i) => (
                        <li key={i} className="flex justify-between px-3 py-2" style={{ background: i % 2 === 0 ? 'rgba(58,125,68,0.04)' : 'transparent' }}>
                          <span style={{ color: '#1c1c1c' }}>{item.nombre_insumo}</span>
                          <span className="font-semibold" style={{ color: 'var(--verde-dark)' }}>{formatCLP(item.precio_extraido)}</span>
                        </li>
                      ))}
                    </ul>
                    <button onClick={aplicarPrecios} disabled={!visionProvId}
                      className="w-full rounded-xl py-2.5 text-sm text-white font-bold disabled:opacity-40"
                      style={{ background: 'var(--verde)' }}>
                      Aplicar precios a la matriz
                    </button>
                  </>
                )}
                <button onClick={() => { setVisionFile(null); setVisionPreview(null); setVisionData(null) }}
                  className="w-full text-xs py-1.5 rounded-lg" style={{ color: 'rgba(0,0,0,0.4)' }}>
                  Escanear otra imagen
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function PrecioRow({ insumo, proveedores, precios, saving, errores, onBlur }: {
  insumo: CatalogoInsumo
  proveedores: Proveedor[]
  precios: PrecioMap
  saving: Set<string>
  errores: Map<string, string>
  onBlur: (provId: string, insumoId: string, value: string) => void
}) {
  return (
    <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
      <td
        className="px-4 py-2.5 font-medium whitespace-nowrap"
        style={{
          position: 'sticky', left: 0, zIndex: 10,
          background: 'rgba(255,255,255,0.85)',
          color: '#1c1c1c',
          minWidth: '220px',
          backdropFilter: 'blur(8px)',
        }}
      >
        {insumo.nombre}
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap text-xs" style={{ color: 'rgba(0,0,0,0.45)' }}>
        {insumo.formato_venta}
      </td>
      {proveedores.map(prov => {
        const key = `${prov.id}_${insumo.id}`
        const precio = precios.get(key)
        const isSaving = saving.has(key)
        return (
          <td key={prov.id} className="px-2 py-1.5 text-right">
            <PrecioCell
              initialValue={precio !== undefined ? precio : null}
              isSaving={isSaving}
              error={errores.get(key)}
              onBlur={(val) => onBlur(prov.id, insumo.id, val)}
            />
          </td>
        )
      })}
    </tr>
  )
}

function PrecioCell({ initialValue, isSaving, error, onBlur, big = false }: {
  initialValue: number | null
  isSaving: boolean
  error?: string
  onBlur: (val: string) => void
  big?: boolean
}) {
  const [localVal, setLocalVal] = useState(initialValue !== null ? String(initialValue) : '')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setLocalVal(initialValue !== null ? String(initialValue) : '')
  }, [initialValue])

  return (
    <div className="relative flex items-center justify-end">
      {localVal && !isSaving && (
        <span className={`absolute left-2 pointer-events-none ${big ? 'text-sm' : 'text-xs'}`} style={{ color: 'rgba(0,0,0,0.35)' }}>$</span>
      )}
      <input
        ref={inputRef}
        type="number"
        min="0"
        step="100"
        value={localVal}
        placeholder="—"
        onChange={e => setLocalVal(e.target.value)}
        onBlur={e => onBlur(e.target.value)}
        disabled={isSaving}
        aria-invalid={Boolean(error)}
        title={error}
        className={`w-full text-right rounded-lg transition-all ${big ? 'text-base font-semibold px-3 py-2.5' : 'text-sm px-2 py-1'}`}
        style={{
          background: error ? 'rgba(220,38,38,0.07)' : localVal ? 'rgba(58,125,68,0.07)' : 'rgba(0,0,0,0.04)',
          border: error
            ? '1px solid rgba(220,38,38,0.55)'
            : localVal ? '1px solid rgba(58,125,68,0.25)' : `1px solid ${big ? 'rgba(0,0,0,0.12)' : 'transparent'}`,
          color: error ? '#dc2626' : localVal ? 'var(--verde-dark)' : 'rgba(0,0,0,0.35)',
          fontWeight: localVal ? '600' : '400',
          opacity: isSaving ? 0.5 : 1,
        }}
      />
      {isSaving && (
        <span className="absolute right-2 text-xs" style={{ color: 'var(--verde)' }}>...</span>
      )}
    </div>
  )
}
