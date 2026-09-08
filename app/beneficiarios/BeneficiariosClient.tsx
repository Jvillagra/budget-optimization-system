'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { Beneficiario, CatalogoInsumo, Asignacion, AyudaMemoria, Proveedor } from '@/lib/types'
import { buildPrecioMap, calcularCostoCarrito, formatCLP, PRESUPUESTO_BASE } from '@/lib/business-logic'
import { useProveedor, proveedorPorDefecto, STORAGE_KEY } from '@/lib/proveedor-context'
import type { DatosStaff } from '@/lib/staff-data'

type Filtro = 'todos' | 'Invernadero' | 'Cierre Perimetral'

// `initial` viene del Server Component (app/beneficiarios/page.tsx): los
// datos llegan dentro del RSC y no hay fetch al montar. Si viene null
// (falló la carga server-side) se intenta /api/data como antes.
export default function BeneficiariosClient({ initial }: { initial: DatosStaff | null }) {
  const { proveedorId, setProveedorId } = useProveedor()
  const [beneficiarios, setBeneficiarios] = useState<Beneficiario[]>([])
  const [insumos, setInsumos] = useState<CatalogoInsumo[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [asignaciones, setAsignaciones] = useState<Record<string, Asignacion[]>>({})
  const [ayudaMemoria, setAyudaMemoria] = useState<Record<string, AyudaMemoria[]>>({})
  const [precioMap, setPrecioMap] = useState(new Map<string, number | null>())
  const [seleccionado, setSeleccionado] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [insumoForm, setInsumoForm] = useState('')
  const [cantidadForm, setCantidadForm] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [agregando, setAgregando] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    async function load() {
      try {
        const datos: DatosStaff | null = initial ?? await fetch('/api/data').then(r => r.ok ? r.json() : null)
        if (!datos) throw new Error('load failed')
        const { beneficiarios: bens, catalogoInsumos: ins, proveedores: todosProvs, asignaciones: asigs, ayudaMemoria: ams, preciosProveedor: precs } = datos
        const provs = (todosProvs as Proveedor[] | undefined)?.filter(p => p.es_activo)
        if (bens) setBeneficiarios(bens as Beneficiario[])
        if (ins) setInsumos(ins as CatalogoInsumo[])
        if (provs) {
          setProveedores(provs as Proveedor[])
          const savedId = localStorage.getItem(STORAGE_KEY)
          const validSaved = savedId && (provs as Proveedor[]).find(p => p.id === savedId)
          const porDefecto = proveedorPorDefecto(provs as Proveedor[])
          if (!validSaved && porDefecto) {
            setProveedorId(porDefecto.id)
          }
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
      } catch {
        setLoadError(true)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [initial])

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
  // El presupuesto es una columna por beneficiario (beneficiarios.presupuesto_base),
  // que es la que usa la simulación. Usar la constante global acá hacía que
  // la ficha mostrara un aporte de bolsillo equivocado para cualquier socio
  // con presupuesto distinto del default.
  const presupuestoSel = benSeleccionado?.presupuesto_base ?? PRESUPUESTO_BASE
  const aporteBolsillo = Math.max(0, total - presupuestoSel)
  const porcentaje = presupuestoSel > 0 ? Math.min(100, (total / presupuestoSel) * 100) : 0
  const bensFiltrados = filtro === 'todos' ? beneficiarios : beneficiarios.filter(b => b.segmento === filtro)

  async function agregar() {
    if (!seleccionado || !insumoForm || agregando) return
    setAgregando(true)
    const res = await fetch('/api/asignaciones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ beneficiario_id: seleccionado, insumo_id: insumoForm, cantidad: cantidadForm }),
    })
    const { data } = await res.json()
    if (res.ok && data) {
      setAsignaciones(prev => ({
        ...prev,
        [seleccionado]: [...(prev[seleccionado] ?? []), data as Asignacion],
      }))
      setInsumoForm('')
      setCantidadForm(1)
    }
    setAgregando(false)
  }

  async function eliminar(asignacionId: string) {
    const res = await fetch(`/api/asignaciones?id=${encodeURIComponent(asignacionId)}`, { method: 'DELETE' })
    if (!res.ok) return
    setAsignaciones(prev => ({
      ...prev,
      [seleccionado!]: (prev[seleccionado!] ?? []).filter(a => a.id !== asignacionId),
    }))
  }

  function seleccionarBen(id: string) {
    const mismo = seleccionado === id
    setSeleccionado(mismo ? null : id)
    if (!mismo) setSheetOpen(true)
  }

  if (loading) return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-20 rounded-[6px] animate-pulse" style={{ background: 'var(--papel-hueco)' }} />
      ))}
    </div>
  )

  if (loadError) return (
    <div className="rounded-[6px] p-8 glass text-center space-y-3">
      <p className="text-sm font-semibold" style={{ color: 'var(--cafe-dark)' }}>Error al cargar los datos</p>
      <p className="text-xs" style={{ color: 'var(--tinta-45)' }}>Revisa tu conexión e intenta nuevamente.</p>
      <button
        onClick={() => { setLoadError(false); setLoading(true); window.location.reload() }}
        className="text-sm font-semibold px-4 py-2 rounded-[4px]"
        style={{ background: 'var(--verde)', color: 'var(--papel)' }}
      >
        Reintentar
      </button>
    </div>
  )

  const panelProps = {
    ben: benSeleccionado,
    asigsBen, ayudaBen, insumosCompatibles,
    proveedorId, proveedores, precioMap,
    total, itemsSinPrecio, aporteBolsillo, porcentaje,
    insumoForm, cantidadForm, agregando,
    setProveedorId, setInsumoForm,
    setCantidadForm: (v: number) => setCantidadForm(v),
    agregar, eliminar,
  }

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lista */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="eyebrow mb-2">01 / Beneficiarios</p>
              <h1 className="titulo-md">
                {beneficiarios.length} <em>socios.</em>
              </h1>
            </div>
            <div className="flex gap-1">
              {(['todos', 'Invernadero', 'Cierre Perimetral'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFiltro(f)}
                  className="text-xs px-3 py-2 min-h-[38px] rounded-[4px] border transition-all font-semibold"
                  style={filtro === f
                    ? { background: 'var(--tinta)', color: 'var(--papel)', borderColor: 'var(--tinta)' }
                    : { color: 'var(--tinta-70)', borderColor: 'var(--linea)' }}
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
              const presupuestoBen = ben.presupuesto_base ?? PRESUPUESTO_BASE
              const tieneAporte = Boolean(proveedorId) && costoTotal > presupuestoBen
              const pct = presupuestoBen > 0 ? Math.min(100, (costoTotal / presupuestoBen) * 100) : 0
              const isSelected = seleccionado === ben.id
              const itemsCarrito = asigs.length

              return (
                <button
                  key={ben.id}
                  onClick={() => seleccionarBen(ben.id)}
                  className="text-left rounded-[6px] p-3 transition-all"
                  style={isSelected ? {
                    background: 'var(--papel-hueco)',
                    border: '1.5px solid var(--verde)',
                    boxShadow: '0 4px 16px var(--linea)',
                    
                  } : {
                    background: 'rgba(244,240,231,0.65)',
                    border: '1px solid var(--linea)',
                    
                  }}
                >
                  <p className="font-semibold text-sm truncate" style={{ color: 'var(--tinta)' }}>{ben.nombre}</p>
                  <span className="text-xs mt-0.5 inline-block" style={{
                    color: ben.segmento === 'Invernadero' ? 'var(--verde-dark)' : 'var(--cafe-dark)'
                  }}>
                    {ben.segmento}
                  </span>
                  {proveedorId && itemsCarrito > 0 && (
                    <>
                      <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--linea)' }}>
                        <div className="h-full rounded-full" style={{
                          width: `${pct}%`,
                          background: tieneAporte ? '#dc2626' : 'var(--verde)',
                        }} />
                      </div>
                      {tieneAporte && (
                        <p className="text-xs mt-1 font-semibold" style={{ color: '#dc2626' }}>
                          +{formatCLP(costoTotal - presupuestoBen)}
                        </p>
                      )}
                    </>
                  )}
                  <p className="text-xs mt-1" style={{ color: 'var(--tinta-45)' }}>
                    {itemsCarrito} ítem{itemsCarrito !== 1 ? 's' : ''} en carrito
                  </p>
                </button>
              )
            })}
          </div>
        </div>

        {/* Panel lateral — desktop only */}
        <div className="hidden lg:block space-y-3">
          <DetailPanel {...panelProps} />
        </div>
      </div>

      {/* Bottom sheet — mobile only */}
      {isMobile && sheetOpen && benSeleccionado && (
        <>
          {/* Overlay */}
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={() => setSheetOpen(false)}
          />
          {/* Sheet */}
          <div
            className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl overflow-hidden"
            style={{ background: 'var(--papel)', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}
          >
            {/* Handle + header */}
            <div className="flex items-center justify-between px-5 pt-4 pb-3 shrink-0" style={{ borderBottom: '1px solid var(--linea)' }}>
              <div>
                <div className="w-10 h-1 rounded-full mx-auto mb-3" style={{ background: 'var(--linea)' }} />
                <p className="font-bold text-sm" style={{ color: 'var(--tinta)' }}>{benSeleccionado.nombre}</p>
                <span className="text-xs font-medium" style={{
                  color: benSeleccionado.segmento === 'Invernadero' ? 'var(--verde-dark)' : 'var(--cafe-dark)'
                }}>
                  {benSeleccionado.segmento}
                </span>
              </div>
              <button
                onClick={() => setSheetOpen(false)}
                className="rounded-full p-2"
                style={{ background: 'var(--linea)', color: 'var(--tinta-45)' }}
              >
                <X size={16} />
              </button>
            </div>
            {/* Scrollable content */}
            <div className="overflow-y-auto flex-1 p-4 space-y-3">
              <DetailPanel {...panelProps} />
            </div>
          </div>
        </>
      )}
    </>
  )
}

type PanelProps = {
  ben: Beneficiario | undefined
  asigsBen: Asignacion[]
  ayudaBen: AyudaMemoria[]
  insumosCompatibles: CatalogoInsumo[]
  proveedorId: string
  proveedores: Proveedor[]
  precioMap: Map<string, number | null>
  total: number
  itemsSinPrecio: number
  aporteBolsillo: number
  porcentaje: number
  insumoForm: string
  cantidadForm: number
  agregando: boolean
  setProveedorId: (v: string) => void
  setInsumoForm: (v: string) => void
  setCantidadForm: (v: number) => void
  agregar: () => void
  eliminar: (id: string) => void
}

function DetailPanel({ ben, asigsBen, ayudaBen, insumosCompatibles, proveedorId, proveedores, precioMap, total, itemsSinPrecio, aporteBolsillo, porcentaje, insumoForm, cantidadForm, agregando, setProveedorId, setInsumoForm, setCantidadForm, agregar, eliminar }: PanelProps) {
  return (
    <>
      {/* Selector de proveedor */}
      <div className="rounded-[6px] p-4 glass">
        <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--cafe)' }}>
          ver precios de
        </label>
        <select
          value={proveedorId}
          onChange={e => setProveedorId(e.target.value)}
          className="w-full rounded-[4px] px-3 py-2 text-sm focus:outline-none"
          style={{ border: '1px solid var(--linea-fuerte)', background: 'var(--papel)' }}
        >
          <option value="">— sin precios —</option>
          {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
      </div>

      {ben ? (
        <div className="rounded-[6px] p-4 glass space-y-4">
          <div>
            <p className="font-bold" style={{ color: 'var(--tinta)' }}>{ben.nombre}</p>
            <span className="text-xs px-2 py-0.5 rounded-full inline-block mt-0.5 font-medium" style={
              ben.segmento === 'Invernadero'
                ? { background: 'var(--verde-muted)', color: 'var(--verde-dark)' }
                : { background: 'var(--cafe-muted)', color: 'var(--cafe-dark)' }
            }>
              {ben.segmento}
            </span>
          </div>

          {ayudaBen.length > 0 && (
            <div className="rounded-[6px] p-3 space-y-1" style={{
              background: 'var(--papel-hueco)',
              border: '1px solid var(--linea)',
            }}>
              <p className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--cafe)' }}>
                ayuda memoria
              </p>
              <p className="text-xs mb-2" style={{ color: 'var(--tinta-45)' }}>
                Lo que el socio solicitó originalmente:
              </p>
              <ul className="space-y-1">
                {ayudaBen.map(am => {
                  const sinPrecio = proveedorId && am.catalogo_insumos
                    ? (precioMap.get(`${proveedorId}_${am.insumo_id}`) ?? null) === null
                    : false
                  return (
                    <li key={am.id} className="flex items-start gap-1.5 text-xs" style={{ color: 'var(--tinta-70)' }}>
                      <span style={{ color: 'var(--cafe)', marginTop: '1px' }}>·</span>
                      <span>
                        {am.detalle_original ?? am.catalogo_insumos?.nombre ?? 'Insumo'}
                        {sinPrecio && (
                          <span className="ml-1.5 text-xs font-medium" style={{ color: 'var(--cafe)' }}>
                            · sin precio en este proveedor
                          </span>
                        )}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {proveedorId && asigsBen.length > 0 && (
            <div>
              <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--tinta-45)' }}>
                <span>presupuesto usado</span>
                <span>{porcentaje.toFixed(1)}%</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--linea)' }}>
                <div className="h-full rounded-full transition-all" style={{
                  width: `${porcentaje}%`,
                  background: aporteBolsillo > 0 ? '#dc2626' : 'var(--verde)',
                }} />
              </div>
              <div className="flex justify-between text-xs mt-1">
                <span style={{ color: 'var(--tinta-45)' }}>{formatCLP(total)}</span>
                <span style={{ color: 'var(--tinta-45)' }}>{formatCLP(ben.presupuesto_base ?? PRESUPUESTO_BASE)}</span>
              </div>
              {itemsSinPrecio > 0 && (
                <p className="text-xs mt-1" style={{ color: 'var(--cafe)' }}>
                  {itemsSinPrecio} ítem{itemsSinPrecio > 1 ? 's' : ''} sin precio cotizado
                </p>
              )}
              {aporteBolsillo > 0 && (
                <div className="rounded-[6px] p-3 mt-2" style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)' }}>
                  <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#dc2626' }}>
                    Aporte de Bolsillo Requerido
                  </p>
                  <p className="text-xl font-bold" style={{ color: '#dc2626' }}>{formatCLP(aporteBolsillo)}</p>
                </div>
              )}
            </div>
          )}

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--tinta-45)' }}>
              carrito real
            </p>
            {asigsBen.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--tinta-45)' }}>
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
                        <span className="font-medium truncate block" style={{ color: 'var(--tinta)' }}>
                          {a.catalogo_insumos?.nombre ?? 'Insumo'} × {a.cantidad}
                        </span>
                        {costo !== null && (
                          <span style={{ color: 'var(--verde-dark)' }}>{formatCLP(costo)}</span>
                        )}
                      </div>
                      <button
                        onClick={() => eliminar(a.id)}
                        className="shrink-0 p-1 rounded-[4px]"
                        style={{ color: '#dc2626', background: '#fee2e2' }}
                      >
                        <TrashIcon />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div className="space-y-2 pt-2" style={{ borderTop: '1px solid var(--linea)' }}>
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--tinta-45)' }}>
              agregar insumo
            </p>
            <select
              value={insumoForm}
              onChange={e => setInsumoForm(e.target.value)}
              className="w-full rounded-[4px] px-3 py-2 text-sm focus:outline-none"
              style={{ border: '1px solid var(--linea-fuerte)', background: 'var(--papel)' }}
            >
              <option value="">seleccionar...</option>
              {insumosCompatibles.map(i => (
                <option key={i.id} value={i.id}>{i.nombre} ({i.formato_venta})</option>
              ))}
            </select>
            {(() => {
              const sinPrecio = insumoForm && proveedorId
                ? (precioMap.get(`${proveedorId}_${insumoForm}`) ?? null) === null
                : false
              return (
                <>
                  {sinPrecio && (
                    <p className="text-xs font-medium" style={{ color: 'var(--cafe)' }}>
                      Insumo no disponible en este proveedor
                    </p>
                  )}
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min={1}
                      value={cantidadForm}
                      onChange={e => setCantidadForm(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-20 rounded-[4px] px-3 py-2 text-sm focus:outline-none"
                      style={{ border: '1px solid var(--linea-fuerte)', background: 'var(--papel)' }}
                    />
                    <button
                      onClick={agregar}
                      disabled={!insumoForm || sinPrecio || agregando}
                      className="flex-1 rounded-[4px] text-sm text-[var(--papel)] font-semibold py-2 disabled:opacity-40"
                      style={{ background: 'var(--verde)' }}
                    >
                      {agregando ? '...' : 'agregar'}
                    </button>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      ) : (
        <div className="rounded-[6px] p-6 glass text-center">
          <p className="text-sm" style={{ color: 'var(--tinta-45)' }}>
            Selecciona un beneficiario para ver su carrito.
          </p>
        </div>
      )}
    </>
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
