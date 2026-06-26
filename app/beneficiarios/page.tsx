'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Beneficiario, CatalogoInsumo, Asignacion, AyudaMemoria, Proveedor } from '@/lib/types'
import { buildPrecioMap, calcularCostoCarrito, formatCLP, PRESUPUESTO_BASE } from '@/lib/business-logic'

type Filtro = 'todos' | 'Invernadero' | 'Cierre Perimetral'

export default function BeneficiariosPage() {
  const [beneficiarios, setBeneficiarios] = useState<Beneficiario[]>([])
  const [insumos, setInsumos] = useState<CatalogoInsumo[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [asignaciones, setAsignaciones] = useState<Record<string, Asignacion[]>>({})
  const [ayudaMemoria, setAyudaMemoria] = useState<Record<string, AyudaMemoria[]>>({})
  const [precioMap, setPrecioMap] = useState(new Map<string, number | null>())
  const [seleccionado, setSeleccionado] = useState<string | null>(null)
  const [proveedorId, setProveedorId] = useState<string>('')
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [insumoForm, setInsumoForm] = useState('')
  const [cantidadForm, setCantidadForm] = useState(1)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: bens }, { data: ins }, { data: provs }, { data: asigs }, { data: ams }, { data: precs }] = await Promise.all([
        supabase.from('beneficiarios').select('*').order('segmento').order('nombre'),
        supabase.from('catalogo_insumos').select('*').order('segmento').order('nombre'),
        supabase.from('proveedores').select('*').eq('es_activo', true).order('nombre'),
        supabase.from('asignaciones').select('*, catalogo_insumos(*)'),
        supabase.from('ayuda_memoria').select('*, catalogo_insumos(*)'),
        supabase.from('precios_proveedor').select('*'),
      ])
      if (bens) setBeneficiarios(bens as Beneficiario[])
      if (ins) setInsumos(ins as CatalogoInsumo[])
      if (provs) {
        setProveedores(provs as Proveedor[])
        if (provs.length > 0) setProveedorId(provs[0].id)
      }
      if (asigs) {
        const map: Record<string, Asignacion[]> = {}
        for (const a of asigs as Asignacion[]) {
          if (!map[a.beneficiario_id]) map[a.beneficiario_id] = []
          map[a.beneficiario_id].push(a)
        }
        setAsignaciones(map)
      }
      if (ams) {
        const map: Record<string, AyudaMemoria[]> = {}
        for (const am of ams as AyudaMemoria[]) {
          if (!map[am.beneficiario_id]) map[am.beneficiario_id] = []
          map[am.beneficiario_id].push(am)
        }
        setAyudaMemoria(map)
      }
      if (precs) setPrecioMap(buildPrecioMap(precs))
      setLoading(false)
    }
    load()
  }, [])

  const benSeleccionado = beneficiarios.find(b => b.id === seleccionado)
  const asigsBen = seleccionado ? (asignaciones[seleccionado] ?? []) : []
  const ayudaBen = seleccionado ? (ayudaMemoria[seleccionado] ?? []) : []

  const insumosCompatibles = benSeleccionado
    ? insumos.filter(i => i.segmento === benSeleccionado.segmento || i.segmento === 'Ambos')
    : []

  const carritoCalc = proveedorId
    ? calcularCostoCarrito(asigsBen, proveedorId, precioMap)
    : { total: 0, itemsConPrecio: 0, itemsSinPrecio: 0 }
  const { total, itemsSinPrecio } = carritoCalc

  const aporteBolsillo = Math.max(0, total - PRESUPUESTO_BASE)
  const porcentaje = Math.min(100, (total / PRESUPUESTO_BASE) * 100)

  const bensFiltrados = filtro === 'todos' ? beneficiarios : beneficiarios.filter(b => b.segmento === filtro)

  async function agregar() {
    if (!seleccionado || !insumoForm) return
    const { data } = await supabase
      .from('asignaciones')
      .insert({ beneficiario_id: seleccionado, insumo_id: insumoForm, cantidad: cantidadForm })
      .select('*, catalogo_insumos(*)')
      .single()
    if (data) {
      setAsignaciones(prev => ({
        ...prev,
        [seleccionado]: [...(prev[seleccionado] ?? []), data as Asignacion],
      }))
      setInsumoForm('')
      setCantidadForm(1)
    }
  }

  async function eliminar(asignacionId: string) {
    await supabase.from('asignaciones').delete().eq('id', asignacionId)
    setAsignaciones(prev => ({
      ...prev,
      [seleccionado!]: (prev[seleccionado!] ?? []).filter(a => a.id !== asignacionId),
    }))
  }

  if (loading) return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-20 rounded-2xl animate-pulse" style={{ background: 'rgba(255,255,255,0.4)' }} />
      ))}
    </div>
  )

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Lista de beneficiarios */}
      <div className="lg:col-span-2 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-lg font-bold" style={{ color: 'var(--verde-dark)' }}>
            beneficiarios <span className="font-normal text-sm" style={{ color: 'rgba(0,0,0,0.35)' }}>({beneficiarios.length})</span>
          </h1>
          <div className="flex gap-1">
            {(['todos', 'Invernadero', 'Cierre Perimetral'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFiltro(f)}
                className="text-xs px-3 py-1 rounded-full border transition-all"
                style={filtro === f
                  ? { background: 'var(--verde)', color: '#fff', borderColor: 'var(--verde)' }
                  : { color: 'var(--cafe)', borderColor: 'rgba(127,79,36,0.3)' }}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {bensFiltrados.map(ben => {
            const asigs = asignaciones[ben.id] ?? []
            const { total: costoTotal } = proveedorId ? calcularCostoCarrito(asigs, proveedorId, precioMap) : { total: 0 }
            const tieneAporte = proveedorId && costoTotal > PRESUPUESTO_BASE
            const pct = Math.min(100, (costoTotal / PRESUPUESTO_BASE) * 100)
            const isSelected = seleccionado === ben.id
            const itemsCarrito = asigs.length

            return (
              <button
                key={ben.id}
                onClick={() => setSeleccionado(isSelected ? null : ben.id)}
                className="text-left rounded-2xl p-3 transition-all"
                style={isSelected ? {
                  background: 'rgba(58,125,68,0.12)',
                  border: '1.5px solid var(--verde)',
                  boxShadow: '0 4px 16px rgba(58,125,68,0.15)',
                  backdropFilter: 'blur(14px)',
                } : {
                  background: 'rgba(255,255,255,0.65)',
                  border: '1px solid rgba(255,255,255,0.55)',
                  backdropFilter: 'blur(14px)',
                }}
              >
                <p className="font-semibold text-sm truncate" style={{ color: '#1c1c1c' }}>{ben.nombre}</p>
                <span className="text-xs mt-0.5 inline-block" style={{
                  color: ben.segmento === 'Invernadero' ? 'var(--verde-dark)' : 'var(--cafe-dark)'
                }}>
                  {ben.segmento}
                </span>
                {proveedorId && itemsCarrito > 0 && (
                  <>
                    <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.08)' }}>
                      <div className="h-full rounded-full" style={{
                        width: `${pct}%`,
                        background: tieneAporte ? '#dc2626' : 'var(--verde)',
                      }} />
                    </div>
                    {tieneAporte && (
                      <p className="text-xs mt-1 font-semibold" style={{ color: '#dc2626' }}>
                        +{formatCLP(costoTotal - PRESUPUESTO_BASE)}
                      </p>
                    )}
                  </>
                )}
                <p className="text-xs mt-1" style={{ color: 'rgba(0,0,0,0.35)' }}>
                  {itemsCarrito} ítem{itemsCarrito !== 1 ? 's' : ''} en carrito
                </p>
              </button>
            )
          })}
        </div>
      </div>

      {/* Panel lateral */}
      <div className="space-y-3">
        {/* Selector de proveedor */}
        <div className="rounded-2xl p-4 glass">
          <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--cafe)' }}>
            ver precios de
          </label>
          <select
            value={proveedorId}
            onChange={e => setProveedorId(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
            style={{ border: '1px solid rgba(58,125,68,0.25)', background: 'rgba(255,255,255,0.7)' }}
          >
            <option value="">— sin precios —</option>
            {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>

        {benSeleccionado ? (
          <div className="rounded-2xl p-4 glass space-y-4">
            {/* Cabecera */}
            <div>
              <p className="font-bold" style={{ color: '#1c1c1c' }}>{benSeleccionado.nombre}</p>
              <span className="text-xs px-2 py-0.5 rounded-full inline-block mt-0.5 font-medium" style={
                benSeleccionado.segmento === 'Invernadero'
                  ? { background: 'var(--verde-muted)', color: 'var(--verde-dark)' }
                  : { background: 'var(--cafe-muted)', color: 'var(--cafe-dark)' }
              }>
                {benSeleccionado.segmento}
              </span>
            </div>

            {/* Ayuda Memoria */}
            {ayudaBen.length > 0 && (
              <div className="rounded-xl p-3 space-y-1" style={{
                background: 'rgba(127,79,36,0.06)',
                border: '1px solid rgba(127,79,36,0.15)',
              }}>
                <p className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--cafe)' }}>
                  ayuda memoria
                </p>
                <p className="text-xs mb-2" style={{ color: 'rgba(0,0,0,0.45)' }}>
                  Lo que el socio solicitó originalmente:
                </p>
                <ul className="space-y-1">
                  {ayudaBen.map(am => (
                    <li key={am.id} className="flex items-start gap-1.5 text-xs" style={{ color: 'rgba(0,0,0,0.65)' }}>
                      <span style={{ color: 'var(--cafe)', marginTop: '1px' }}>·</span>
                      <span>{am.detalle_original ?? am.catalogo_insumos?.nombre ?? 'Insumo'}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Barra presupuesto */}
            {proveedorId && asigsBen.length > 0 && (
              <div>
                <div className="flex justify-between text-xs mb-1" style={{ color: 'rgba(0,0,0,0.45)' }}>
                  <span>presupuesto usado</span>
                  <span>{porcentaje.toFixed(1)}%</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.07)' }}>
                  <div className="h-full rounded-full transition-all" style={{
                    width: `${porcentaje}%`,
                    background: aporteBolsillo > 0 ? '#dc2626' : 'var(--verde)',
                  }} />
                </div>
                <div className="flex justify-between text-xs mt-1">
                  <span style={{ color: 'rgba(0,0,0,0.4)' }}>{formatCLP(total)}</span>
                  <span style={{ color: 'rgba(0,0,0,0.4)' }}>{formatCLP(PRESUPUESTO_BASE)}</span>
                </div>
                {itemsSinPrecio > 0 && (
                  <p className="text-xs mt-1" style={{ color: 'var(--cafe)' }}>
                    {itemsSinPrecio} ítem{itemsSinPrecio > 1 ? 's' : ''} sin precio cotizado
                  </p>
                )}
                {aporteBolsillo > 0 && (
                  <div className="rounded-xl p-3 mt-2" style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)' }}>
                    <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#dc2626' }}>
                      Aporte de Bolsillo Requerido
                    </p>
                    <p className="text-xl font-bold" style={{ color: '#dc2626' }}>{formatCLP(aporteBolsillo)}</p>
                  </div>
                )}
              </div>
            )}

            {/* Carrito real */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'rgba(0,0,0,0.35)' }}>
                carrito real
              </p>
              {asigsBen.length === 0 ? (
                <p className="text-xs" style={{ color: 'rgba(0,0,0,0.35)' }}>
                  Carrito vacío. Agrega insumos una vez definido el proveedor.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {asigsBen.map(a => {
                    const precio = proveedorId ? (precioMap.get(`${proveedorId}_${a.insumo_id}`) ?? null) : null
                    const costo = precio !== null ? a.cantidad * precio : null
                    return (
                      <li key={a.id} className="flex items-center gap-2 text-xs group">
                        <div className="flex-1 min-w-0">
                          <span className="font-medium truncate block" style={{ color: '#1c1c1c' }}>
                            {a.catalogo_insumos?.nombre ?? 'Insumo'} × {a.cantidad}
                          </span>
                          {costo !== null && (
                            <span style={{ color: 'var(--verde-dark)' }}>{formatCLP(costo)}</span>
                          )}
                        </div>
                        <button
                          onClick={() => eliminar(a.id)}
                          className="shrink-0 p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                          style={{ color: '#dc2626', background: '#fee2e2' }}
                          title="Quitar del carrito"
                        >
                          <TrashIcon />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {/* Agregar insumo */}
            <div className="space-y-2 pt-2" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'rgba(0,0,0,0.35)' }}>
                agregar insumo
              </p>
              <select
                value={insumoForm}
                onChange={e => setInsumoForm(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                style={{ border: '1px solid rgba(58,125,68,0.25)', background: 'rgba(255,255,255,0.7)' }}
              >
                <option value="">seleccionar...</option>
                {insumosCompatibles.map(i => (
                  <option key={i.id} value={i.id}>{i.nombre} ({i.formato_venta})</option>
                ))}
              </select>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={1}
                  value={cantidadForm}
                  onChange={e => setCantidadForm(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-20 rounded-lg px-3 py-2 text-sm focus:outline-none"
                  style={{ border: '1px solid rgba(58,125,68,0.25)', background: 'rgba(255,255,255,0.7)' }}
                />
                <button
                  onClick={agregar}
                  disabled={!insumoForm}
                  className="flex-1 rounded-lg text-sm text-white font-semibold py-2 disabled:opacity-40"
                  style={{ background: 'var(--verde)' }}
                >
                  agregar
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl p-6 glass text-center">
            <p className="text-sm" style={{ color: 'rgba(0,0,0,0.35)' }}>
              Selecciona un beneficiario para ver su carrito.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  )
}
