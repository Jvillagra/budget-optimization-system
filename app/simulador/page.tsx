'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Proveedor, Beneficiario, CatalogoInsumo, Asignacion, KPISimulacion } from '@/lib/types'
import { buildPrecioMap, calcularKPI, formatCLP } from '@/lib/business-logic'

export default function SimuladorPage() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [beneficiarios, setBeneficiarios] = useState<Beneficiario[]>([])
  const [insumos, setInsumos] = useState<CatalogoInsumo[]>([])
  const [asignacionesPorBen, setAsignacionesPorBen] = useState<Record<string, Asignacion[]>>({})
  const [precioMaps, setPrecioMaps] = useState<Record<string, Map<string, number | null>>>({})
  const [provA, setProvA] = useState('')
  const [provB, setProvB] = useState('')
  const [kpis, setKpis] = useState<KPISimulacion[]>([])
  const [loading, setLoading] = useState(true)
  const [simulado, setSimulado] = useState(false)

  useEffect(() => {
    async function load() {
      const [{ data: provs }, { data: bens }, { data: ins }, { data: asigs }, { data: precs }] = await Promise.all([
        supabase.from('proveedores').select('*').eq('es_activo', true).order('nombre'),
        supabase.from('beneficiarios').select('*').order('segmento').order('nombre'),
        supabase.from('catalogo_insumos').select('*'),
        supabase.from('asignaciones').select('*').eq('es_requerimiento_base', true),
        supabase.from('precios_proveedor').select('*'),
      ])

      if (provs) {
        setProveedores(provs as Proveedor[])
        if (provs.length >= 1) setProvA(provs[0].id)
        if (provs.length >= 2) setProvB(provs[1].id)
      }
      if (bens) setBeneficiarios(bens as Beneficiario[])
      if (ins) setInsumos(ins as CatalogoInsumo[])
      if (asigs) {
        const map: Record<string, Asignacion[]> = {}
        for (const a of asigs as Asignacion[]) {
          if (!map[a.beneficiario_id]) map[a.beneficiario_id] = []
          map[a.beneficiario_id].push(a)
        }
        setAsignacionesPorBen(map)
      }
      if (precs && provs) {
        const maps: Record<string, Map<string, number | null>> = {}
        for (const p of provs as Proveedor[]) {
          maps[p.id] = buildPrecioMap((precs).filter((r: { proveedor_id: string }) => r.proveedor_id === p.id))
        }
        setPrecioMaps(maps)
      }
      setLoading(false)
    }
    load()
  }, [])

  function simular() {
    if (!provA || !provB) return
    const provAObj = proveedores.find(p => p.id === provA)
    const provBObj = proveedores.find(p => p.id === provB)
    if (!provAObj || !provBObj) return

    const kpiA = calcularKPI(provAObj, beneficiarios, precioMaps[provA] ?? new Map(), insumos, asignacionesPorBen)
    const kpiB = calcularKPI(provBObj, beneficiarios, precioMaps[provB] ?? new Map(), insumos, asignacionesPorBen)

    // Ganador: mayor volumen total
    kpiA.es_ganador = kpiA.volumen_total_comunidad >= kpiB.volumen_total_comunidad
    kpiB.es_ganador = kpiB.volumen_total_comunidad > kpiA.volumen_total_comunidad
    setKpis([kpiA, kpiB])
    setSimulado(true)
  }

  const invernadero = beneficiarios.filter(b => b.segmento === 'Invernadero')
  const cierre = beneficiarios.filter(b => b.segmento === 'Cierre Perimetral')
  const conMalla = cierre.filter(b => asignacionesPorBen[b.id]?.some(a => a.es_requerimiento_base))

  if (loading) return (
    <div className="space-y-4">
      <div className="h-8 rounded animate-pulse w-48" style={{ background: 'rgba(255,255,255,0.4)' }} />
      <div className="grid grid-cols-2 gap-4">
        {[0, 1].map(i => <div key={i} className="h-64 rounded-2xl animate-pulse" style={{ background: 'rgba(255,255,255,0.4)' }} />)}
      </div>
    </div>
  )

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold" style={{ color: 'var(--verde-dark)' }}>simulador comparativo</h1>
        <p className="text-xs mt-0.5" style={{ color: 'rgba(0,0,0,0.4)' }}>
          Compara dos proveedores y encuentra cuál maximiza el volumen de materiales.
        </p>
      </div>

      {/* Stats de la comunidad */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="total socios" value={String(beneficiarios.length)} />
        <StatCard label="invernadero" value={String(invernadero.length)} color="verde" />
        <StatCard label="cierre perimetral" value={String(cierre.length)} color="cafe" />
        <StatCard label="con malla asignada" value={`${conMalla.length}/${cierre.length}`} color={conMalla.length < cierre.length ? 'rojo' : 'verde'} />
      </div>

      {/* Selector de proveedores */}
      <div className="rounded-2xl p-4 glass-strong flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-[160px]">
          <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--cafe)' }}>proveedor A</label>
          <select value={provA} onChange={e => setProvA(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
            style={{ border: '1px solid rgba(58,125,68,0.3)', background: 'rgba(255,255,255,0.8)' }}
          >
            {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--cafe)' }}>proveedor B</label>
          <select value={provB} onChange={e => setProvB(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
            style={{ border: '1px solid rgba(127,79,36,0.3)', background: 'rgba(255,255,255,0.8)' }}
          >
            {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>
        <button
          onClick={simular}
          disabled={!provA || !provB}
          className="rounded-xl px-6 py-2 text-sm text-white font-bold disabled:opacity-40"
          style={{ background: 'var(--verde)' }}
        >
          simular
        </button>
      </div>

      {/* Resultados side-by-side */}
      {simulado && kpis.length === 2 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {kpis.map(kpi => <KPICard key={kpi.proveedor.id} kpi={kpi} />)}
          </div>

          {/* Análisis comparativo */}
          <div className="rounded-2xl p-5" style={{ background: 'var(--verde-dark)' }}>
            <p className="text-xs font-semibold mb-3" style={{ color: 'rgba(255,255,255,0.65)' }}>análisis comparativo</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {(() => {
                const [a, b] = kpis
                const ganador = a.es_ganador ? a : b
                const perdedor = a.es_ganador ? b : a
                const difVol = Math.abs(a.volumen_total_comunidad - b.volumen_total_comunidad)
                const difAporte = Math.abs(a.aporte_bolsillo_total - b.aporte_bolsillo_total)
                return (
                  <>
                    <div>
                      <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>diferencia de volumen</p>
                      <p className="text-2xl font-bold text-white">+{difVol} uds.</p>
                      <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>con {ganador.proveedor.nombre}</p>
                    </div>
                    <div>
                      <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>ahorro en aportes</p>
                      <p className="text-2xl font-bold text-white">{formatCLP(difAporte)}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>menos bolsillo con {ganador.proveedor.nombre}</p>
                    </div>
                    <div>
                      <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>recomendación</p>
                      <p className="text-sm font-bold text-white mt-1">
                        {difVol > 0
                          ? `${ganador.proveedor.nombre} logra ${difVol} unidades más para la comunidad.`
                          : 'Ambos proveedores entregan el mismo volumen.'}
                      </p>
                      {perdedor.socios_con_error > 0 && (
                        <p className="text-xs mt-1" style={{ color: '#fca5a5' }}>
                          {perdedor.proveedor.nombre}: {perdedor.socios_con_error} socios sin datos completos.
                        </p>
                      )}
                    </div>
                  </>
                )
              })()}
            </div>
          </div>
        </>
      )}

      {!simulado && (
        <div className="rounded-2xl border-2 border-dashed p-12 text-center" style={{ borderColor: 'rgba(58,125,68,0.2)' }}>
          <p className="text-sm" style={{ color: 'rgba(0,0,0,0.4)' }}>
            Selecciona dos proveedores y presiona <strong>simular</strong>.
          </p>
          <p className="text-xs mt-1" style={{ color: 'rgba(0,0,0,0.3)' }}>
            Los socios de Cierre Perimetral deben tener una malla marcada como requerimiento base.
          </p>
        </div>
      )}
    </div>
  )
}

function KPICard({ kpi }: { kpi: KPISimulacion }) {
  const { proveedor, resultados, volumen_total_comunidad, aporte_bolsillo_total, socios_con_error, es_ganador } = kpi
  const exitosos = resultados.filter(r => r.error === null)
  const totalPolines = exitosos.reduce((s, r) => s + r.polines, 0)
  const benInv = exitosos.filter(r => r.beneficiario.segmento === 'Invernadero')
  const totalMetros = benInv.reduce((s, r) => s + 20, 0)

  return (
    <div className="rounded-2xl p-5 space-y-4 transition-all" style={es_ganador ? {
      background: 'rgba(58,125,68,0.1)',
      border: '2px solid var(--verde)',
      boxShadow: '0 0 0 4px rgba(58,125,68,0.08), 0 8px 32px rgba(58,125,68,0.15)',
      backdropFilter: 'blur(14px)',
    } : {
      background: 'rgba(255,255,255,0.65)',
      border: '1px solid rgba(255,255,255,0.55)',
      backdropFilter: 'blur(14px)',
    }}>
      <div className="flex items-center justify-between">
        <h3 className="font-bold" style={{ color: '#1c1c1c' }}>{proveedor.nombre}</h3>
        {es_ganador && (
          <span className="flex items-center gap-1 text-xs font-bold text-white px-2.5 py-1 rounded-full" style={{ background: 'var(--verde)' }}>
            🏆 mejor opción
          </span>
        )}
      </div>

      {/* KPIs principales */}
      <div className="grid grid-cols-2 gap-3">
        <Metric label="volumen total" value={String(volumen_total_comunidad)} sub="unidades comunidad" highlight={es_ganador} />
        <Metric label="aporte de bolsillo" value={formatCLP(aporte_bolsillo_total)} sub="total comunidad" danger={aporte_bolsillo_total > 0} />
        <Metric label="metros polietileno" value={`${totalMetros}m`} sub={`${benInv.length} socios inv.`} />
        <Metric label="polines totales" value={String(totalPolines)} sub="ambos segmentos" highlight={es_ganador} />
      </div>

      {socios_con_error > 0 && (
        <div className="rounded-xl p-3 text-xs" style={{ background: 'rgba(220,38,38,0.07)', border: '1px solid rgba(220,38,38,0.2)', color: '#dc2626' }}>
          <p className="font-semibold">⚠ {socios_con_error} socio{socios_con_error > 1 ? 's' : ''} con datos incompletos</p>
          <ul className="mt-1 space-y-0.5" style={{ color: 'rgba(220,38,38,0.8)' }}>
            {resultados.filter(r => r.error).slice(0, 4).map(r => (
              <li key={r.beneficiario.id}>· {r.beneficiario.nombre}: {r.error}</li>
            ))}
            {socios_con_error > 4 && <li>· y {socios_con_error - 4} más...</li>}
          </ul>
        </div>
      )}

      {/* Detalle por socio (colapsado) */}
      <details className="text-xs">
        <summary className="cursor-pointer font-semibold" style={{ color: 'var(--cafe)' }}>
          ver detalle por socio ({exitosos.length} calculados)
        </summary>
        <div className="mt-2 max-h-48 overflow-y-auto space-y-1">
          {exitosos.map(r => (
            <div key={r.beneficiario.id} className="flex justify-between py-0.5" style={{ borderBottom: '1px solid rgba(0,0,0,0.05)', color: 'rgba(0,0,0,0.65)' }}>
              <span className="truncate max-w-[140px]">{r.beneficiario.nombre}</span>
              <span className="font-semibold shrink-0 ml-2">{r.volumen_total} uds.</span>
            </div>
          ))}
        </div>
      </details>
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: string; color?: 'verde' | 'cafe' | 'rojo' }) {
  const colorMap = { verde: 'var(--verde)', cafe: 'var(--cafe)', rojo: '#dc2626' }
  return (
    <div className="rounded-2xl p-4 glass">
      <p className="text-xs" style={{ color: 'rgba(0,0,0,0.4)' }}>{label}</p>
      <p className="text-xl font-bold mt-0.5" style={{ color: color ? colorMap[color] : '#1c1c1c' }}>{value}</p>
    </div>
  )
}

function Metric({ label, value, sub, highlight, danger }: {
  label: string; value: string; sub?: string; highlight?: boolean; danger?: boolean
}) {
  return (
    <div className="rounded-xl p-3" style={{ background: highlight ? 'rgba(58,125,68,0.1)' : 'rgba(0,0,0,0.04)' }}>
      <p className="text-xs" style={{ color: 'rgba(0,0,0,0.45)' }}>{label}</p>
      <p className="text-base font-bold mt-0.5" style={{ color: highlight ? 'var(--verde-dark)' : danger ? '#dc2626' : '#1c1c1c' }}>
        {value}
      </p>
      {sub && <p className="text-xs mt-0.5" style={{ color: 'rgba(0,0,0,0.35)' }}>{sub}</p>}
    </div>
  )
}
