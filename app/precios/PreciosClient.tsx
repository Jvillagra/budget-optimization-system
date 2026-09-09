'use client'

import { useEffect, useState, useRef } from 'react'
import { ScanLine, Pencil, EyeOff, RotateCcw, X } from 'lucide-react'
import type { CatalogoInsumo, Proveedor, CompraSegmento } from '@/lib/types'
import { formatCLP } from '@/lib/business-logic'
import type { DatosStaff } from '@/lib/staff-data'
import { Button, Alert, ConfirmDialog, IconButton } from '@/components/design-system'
import { PageHeader } from '@/components/Editorial'

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
  // Desactivar es el "eliminar" reversible de un proveedor (ver PATCH de
  // /api/proveedores): no borra precios ni historial, lo saca de la matriz
  // y de los selectores. El error va a la vista porque el server puede
  // negarse (proveedor de una compra ya confirmada).
  const [provError, setProvError] = useState<string | null>(null)
  const [aDesactivar, setADesactivar] = useState<Proveedor | null>(null)
  const [gestionAbierta, setGestionAbierta] = useState(false)
  // Segmentos con compra confirmada: sus precios quedaron congelados en el
  // momento de confirmar (compras_segmento_precio). Editar acá sigue siendo
  // legitimo -- hace falta para cotizar el otro proyecto, y "Polines" lo
  // comparten los dos -- pero ya no mueve lo comprado, y eso hay que decirlo.
  const [compras, setCompras] = useState<CompraSegmento[]>([])
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
      const { catalogoInsumos: ins, proveedores: provs, preciosProveedor: precs, compras: comps } = datos ?? {}
      if (comps) setCompras(comps)
      if (ins) setInsumos(ins as CatalogoInsumo[])
      if (provs) setProveedores(provs as Proveedor[])
      if (precs) {
        const map: PrecioMap = new Map()
        for (const p of precs) map.set(`${p.proveedor_id}_${p.insumo_id}`, p.precio_unitario)
        setPrecios(map)
      }
      const primerActivo = (provs as Proveedor[] | undefined)?.find(pr => pr.es_activo)
      if (primerActivo) setMobileProvId(primerActivo.id)
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

  async function cambiarActivo(prov: Proveedor, es_activo: boolean) {
    setProvError(null)
    const res = await fetch('/api/proveedores', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: prov.id, es_activo }),
    }).catch(() => null)
    if (!res?.ok) {
      const data = await res?.json().catch(() => null)
      setProvError(data?.error ?? 'No se pudo actualizar el proveedor.')
      setADesactivar(null)
      return
    }
    setProveedores(prev => prev.map(x => x.id === prov.id ? { ...x, es_activo } : x))
    // Si el proveedor apagado era el que se estaba editando en mobile, se
    // salta al primero que siga activo para no dejar la pantalla en blanco.
    if (!es_activo && mobileProvId === prov.id) {
      const siguiente = proveedores.find(x => x.es_activo && x.id !== prov.id)
      setMobileProvId(siguiente?.id ?? '')
    }
    setADesactivar(null)
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

  // La lista completa incluye desactivados (ver lib/staff-data.ts); todo lo
  // operativo usa solo los activos.
  const activos = proveedores.filter(p => p.es_activo)

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
        <div key={i} className="h-10 rounded-[6px] animate-pulse" style={{ background: 'var(--papel-hueco)' }} />
      ))}
    </div>
  )

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="03 / Maestro de precios"
        titulo={<>Lo que cuesta<br /><em>cada material.</em></>}
        bajada="Un precio por proveedor y por insumo. La celda vacía significa que ese proveedor todavía no lo cotizó."
        acciones={
          <>
            <Button size="sm" variant="secondary" onClick={() => setShowVision(true)}>
              <ScanLine size={14} /> Escanear cotización
            </Button>
            <Button size="sm" onClick={() => setGestionAbierta(v => !v)}>
              Proveedores ({activos.length})
            </Button>
          </>
        }
      />

      {provError && <Alert tone="error" className="mb-4">{provError}</Alert>}

      {compras.length > 0 && (
        <Alert tone="warning" className="mb-4">
          {compras.map(c => c.segmento).join(' y ')} ya {compras.length > 1 ? 'tienen' : 'tiene'} la compra confirmada:
          {' '}cambiar precios acá no altera lo ya comprado, porque quedó guardado el precio que se pagó.
        </Alert>
      )}

      {visionResultado && (
        <Alert tone="info" className="mb-4 flex items-start justify-between gap-3">
          <span>{visionResultado}</span>
          <IconButton onClick={() => setVisionResultado(null)} className="h-8 w-8 -mr-1" aria-label="Cerrar aviso">
            <X size={16} />
          </IconButton>
        </Alert>
      )}

      {/* Panel de proveedores: renombrar y desactivar/reactivar. Antes el
          nombre solo se podía editar haciendo clic en el encabezado de la
          matriz -- invisible como afordancia, e inexistente en mobile porque
          ahí la matriz no se muestra. */}
      {gestionAbierta && (
        <section className="mb-8 rounded-[6px] glass-strong">
          <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--linea)' }}>
            <p className="eyebrow">Proveedores</p>
            <Button size="sm" variant="ghost" onClick={() => setAddingProv(v => !v)}>
              {addingProv ? 'Cancelar' : '+ Agregar'}
            </Button>
          </div>

          {addingProv && (
            <div className="px-5 py-4 flex gap-2" style={{ borderBottom: '1px solid var(--linea)' }}>
              <input
                autoFocus
                type="text"
                placeholder="Nombre del proveedor"
                value={nuevoNombre}
                onChange={e => setNuevoNombre(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && agregarProveedor()}
                className="flex-1 rounded-[4px] px-3 py-2 text-sm min-h-[44px]"
                style={{ border: '1px solid var(--linea)', background: 'var(--papel-hueco)' }}
              />
              <Button onClick={agregarProveedor} disabled={!nuevoNombre.trim()}>Guardar</Button>
            </div>
          )}

          <ul>
            {proveedores.map(prov => (
              <li
                key={prov.id}
                className="px-5 py-3 flex items-center justify-between gap-3 flex-wrap"
                style={{ borderBottom: '1px solid var(--linea)', opacity: prov.es_activo ? 1 : 0.55 }}
              >
                {editingId === prov.id ? (
                  <input
                    autoFocus
                    type="text"
                    value={editNombre}
                    onChange={e => setEditNombre(e.target.value)}
                    onBlur={() => guardarNombreProveedor(prov.id)}
                    onKeyDown={e => e.key === 'Enter' && guardarNombreProveedor(prov.id)}
                    className="flex-1 min-w-0 rounded-[4px] px-3 py-2 text-sm min-h-[44px]"
                    style={{ border: '1px solid var(--tinta)', background: 'var(--papel-hueco)' }}
                  />
                ) : (
                  <span className="text-sm font-semibold flex items-center gap-2 min-w-0">
                    <span className="truncate">{prov.nombre}</span>
                    {!prov.es_activo && (
                      <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-[3px]"
                        style={{ border: '1px solid var(--linea-fuerte)', color: 'var(--tinta-70)' }}>
                        Desactivado
                      </span>
                    )}
                    {prov.es_activo && hayPreciosIncompletos(prov.id) && (
                      <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: '#8a6d1f' }}>
                        Precios incompletos
                      </span>
                    )}
                  </span>
                )}
                <span className="flex items-center gap-1 shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => { setEditingId(prov.id); setEditNombre(prov.nombre) }}>
                    <Pencil size={14} /> Renombrar
                  </Button>
                  {prov.es_activo ? (
                    <Button size="sm" variant="danger" onClick={() => setADesactivar(prov)}>
                      <EyeOff size={14} /> Desactivar
                    </Button>
                  ) : (
                    <Button size="sm" variant="secondary" onClick={() => cambiarActivo(prov, true)}>
                      <RotateCcw size={14} /> Reactivar
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <p className="px-5 py-3 text-xs" style={{ color: 'var(--tinta-45)' }}>
            Desactivar no borra nada: el proveedor y sus precios quedan guardados, pero deja de aparecer en el comparador y en las listas.
          </p>
        </section>
      )}

      {/* Mobile: un proveedor a la vez, tarjetas grandes por insumo (ver
          comentario en mobileProvId más arriba). */}
      <div className="sm:hidden space-y-4">
        {activos.length === 0 ? (
          <p className="text-xs text-center py-6" style={{ color: 'var(--tinta-45)' }}>
            Agrega un proveedor para empezar a cargar precios.
          </p>
        ) : (
          <>
            <div className="rounded-[6px] p-3 glass-strong flex items-center gap-3">
              <label className="text-xs font-semibold shrink-0" style={{ color: 'var(--cafe)' }}>
                Proveedor
              </label>
              <select
                value={mobileProvId}
                onChange={e => setMobileProvId(e.target.value)}
                className="flex-1 rounded-[4px] px-3 py-2 text-sm focus:outline-none"
                style={{ border: '1px solid var(--linea-fuerte)', background: 'var(--papel)' }}
              >
                {activos.map(p => (
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
                    style={{ color: seg === 'Invernadero' ? 'var(--verde-dark)' : seg === 'Cierre Perimetral' ? 'var(--cafe-dark)' : 'var(--tinta-45)' }}
                  >
                    {seg}
                  </p>
                  {items.map(insumo => {
                    const key = `${mobileProvId}_${insumo.id}`
                    const precio = precios.get(key)
                    const isSaving = saving.has(key)
                    return (
                      <div key={insumo.id} className="rounded-[6px] p-3 glass flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate" style={{ color: 'var(--tinta)' }}>{insumo.nombre}</p>
                          <p className="text-xs" style={{ color: 'var(--tinta-45)' }}>{insumo.formato_venta}</p>
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
      <div className="hidden sm:block rounded-[6px] overflow-x-auto glass" style={{ maxHeight: '75vh' }}>
        <table className="w-full text-sm border-collapse">
          <thead style={{ position: 'sticky', top: 0, zIndex: 20 }}>
            <tr style={{ background: 'var(--marca)', backdropFilter: 'none' }}>
              <th
                className="text-left px-4 py-3 text-xs font-semibold text-[var(--papel)] whitespace-nowrap"
                style={{ position: 'sticky', left: 0, zIndex: 30, background: 'var(--verde-dark)', minWidth: '220px' }}
              >
                insumo
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--papel)] whitespace-nowrap" style={{ minWidth: '100px' }}>
                formato
              </th>
              {activos.map(p => {
                const incompleto = hayPreciosIncompletos(p.id)
                return (
                  <th key={p.id} className="px-4 py-3 text-xs font-semibold text-[var(--papel)] whitespace-nowrap" style={{ minWidth: '160px' }}>
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
                          style={{ background: 'var(--papel)' }}
                        />
                      ) : (
                        <Button
                          variant="link"
                          size="sm"
                          onClick={() => { setEditingId(p.id); setEditNombre(p.nombre) }}
                          className="min-h-0 font-semibold text-[inherit]"
                          title="Editar nombre"
                        >
                          {p.nombre}
                        </Button>
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
                    colSpan={2 + activos.length}
                    className="px-4 py-2 eyebrow"
                    style={{ background: 'var(--papel-hueco)', color: 'var(--tinta-70)' }}
                  >
                    {seg}
                  </td>
                </tr>,
                ...items.map(insumo => (
                  <PrecioRow
                    key={insumo.id}
                    insumo={insumo}
                    proveedores={activos}
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

      <p className="text-xs" style={{ color: 'var(--tinta-45)' }}>
        {insumos.length} insumos · {activos.length} proveedores activos · Los precios se guardan al salir de cada celda.
      </p>

      {/* Modal IA Vision */}
      {showVision && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'var(--tinta-70)', backdropFilter: 'none' }}>
          <div className="rounded-[6px] p-6 w-full max-w-md space-y-4 glass-strong" style={{ background: 'var(--papel)' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ScanLine size={18} style={{ color: 'var(--cafe)' }} />
                <h2 className="font-bold text-sm" style={{ color: 'var(--tinta)' }}>Escanear Cotización (IA)</h2>
              </div>
              <IconButton
                onClick={() => { setShowVision(false); setVisionFile(null); setVisionPreview(null); setVisionData(null) }}
                className="-mr-2"
                aria-label="Cerrar el escaneo"
              >
                <X size={18} />
              </IconButton>
            </div>

            {/* Proveedor destino */}
            <div>
              <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--cafe)' }}>Aplicar precios a</label>
              <select value={visionProvId} onChange={e => setVisionProvId(e.target.value)}
                className="w-full rounded-[4px] px-3 py-2 text-sm focus:outline-none"
                style={{ border: '1px solid var(--linea-fuerte)', background: 'var(--papel)' }}>
                <option value="">Seleccionar proveedor...</option>
                {activos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>

            {/* Drop zone */}
            {!visionPreview ? (
              <label className="flex flex-col items-center justify-center rounded-[6px] border-2 border-dashed cursor-pointer py-8 gap-2"
                style={{ borderColor: 'var(--linea-fuerte)', background: 'var(--papel-hueco)' }}>
                <ScanLine size={28} style={{ color: 'var(--tinta-45)' }} />
                <span className="text-xs text-center" style={{ color: 'var(--tinta-45)' }}>
                  Arrastra una imagen o haz clic para seleccionar.<br />
                  También puedes tomar una foto desde tu celular.
                </span>
                <input type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={e => e.target.files?.[0] && handleVisionFile(e.target.files[0])} />
              </label>
            ) : (
              <div className="space-y-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={visionPreview} alt="Cotización" className="w-full rounded-[6px] object-contain max-h-40" />
                {!visionData && (
                  <Button
                    onClick={escanearCotizacion}
                    disabled={!visionProvId}
                    cargando={visionLoading}
                    className="w-full"
                  >
                    {visionLoading
                      ? 'Analizando cotización…'
                      : <><ScanLine size={15} /> Escanear</>}
                  </Button>
                )}
              </div>
            )}

            {visionError && (
              <p className="text-xs rounded-[4px] px-3 py-2" style={{ background: 'color-mix(in srgb, var(--alerta) 10%, transparent)', color: 'var(--alerta)' }}>
                {visionError}
              </p>
            )}

            {/* Resultados */}
            {visionData && (
              <div className="space-y-3">
                {visionData.length === 0 ? (
                  <p className="text-xs text-center" style={{ color: 'var(--tinta-45)' }}>
                    No se encontraron precios reconocibles en la imagen.
                  </p>
                ) : (
                  <>
                    <p className="text-xs font-semibold" style={{ color: 'var(--verde-dark)' }}>
                      {visionData.length} precio{visionData.length !== 1 ? 's' : ''} detectado{visionData.length !== 1 ? 's' : ''}:
                    </p>
                    <ul className="text-xs rounded-[6px] overflow-hidden" style={{ border: '1px solid var(--linea)' }}>
                      {visionData.map((item, i) => (
                        <li key={i} className="flex justify-between px-3 py-2" style={{ background: i % 2 === 0 ? 'var(--papel-hueco)' : 'transparent' }}>
                          <span style={{ color: 'var(--tinta)' }}>{item.nombre_insumo}</span>
                          <span className="font-semibold" style={{ color: 'var(--verde-dark)' }}>{formatCLP(item.precio_extraido)}</span>
                        </li>
                      ))}
                    </ul>
                    <Button onClick={aplicarPrecios} disabled={!visionProvId} className="w-full">
                      Aplicar precios a la matriz
                    </Button>
                  </>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setVisionFile(null); setVisionPreview(null); setVisionData(null) }}
                  className="w-full"
                >
                  Escanear otra imagen
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {aDesactivar && (
        <ConfirmDialog
          title={`Desactivar ${aDesactivar.nombre}`}
          description="Deja de aparecer en el comparador y en las listas. No se borra nada: sus precios quedan guardados y puedes reactivarlo cuando quieras."
          confirmLabel="Desactivar"
          onConfirm={() => cambiarActivo(aDesactivar, false)}
          onCancel={() => setADesactivar(null)}
        />
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
    <tr style={{ borderBottom: '1px solid var(--linea)' }}>
      <td
        className="px-4 py-2.5 font-medium whitespace-nowrap"
        style={{
          position: 'sticky', left: 0, zIndex: 10,
          background: 'var(--papel)',
          color: 'var(--tinta)',
          minWidth: '220px',
          backdropFilter: 'none',
        }}
      >
        {insumo.nombre}
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap text-xs" style={{ color: 'var(--tinta-45)' }}>
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
        <span className={`absolute left-2 pointer-events-none ${big ? 'text-sm' : 'text-xs'}`} style={{ color: 'var(--tinta-45)' }}>$</span>
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
        className={`w-full text-right rounded-[4px] transition-all ${big ? 'text-base font-semibold px-3 py-2.5' : 'text-sm px-2 py-1'}`}
        style={{
          background: error ? 'rgba(155,28,28,0.08)' : localVal ? 'var(--papel)' : 'var(--papel-hueco)',
          border: error
            ? '1px solid rgba(220,38,38,0.55)'
            : localVal ? '1px solid var(--linea-fuerte)' : `1px solid ${big ? 'var(--linea)' : 'transparent'}`,
          color: error ? 'var(--alerta)' : localVal ? 'var(--verde-dark)' : 'var(--tinta-45)',
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
