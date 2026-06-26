'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { TrendingUp, Wallet, Package, Users } from 'lucide-react'
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { supabase } from '@/lib/supabase'
import type { Proveedor, Beneficiario, CatalogoInsumo, AyudaMemoria, KPISimulacion, ResultadoSimulacion } from '@/lib/types'
import { buildPrecioMap, calcularKPI, formatCLP, METROS_POLY_MIN } from '@/lib/business-logic'

const VERDE = '#3a7d44'
const CAFE = '#7f4f24'
const PIE_COLORS = [VERDE, '#e5e7eb', '#dc2626']

export default function SimuladorPage() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [beneficiarios, setBeneficiarios] = useState<Beneficiario[]>([])
  const [insumos, setInsumos] = useState<CatalogoInsumo[]>([])
  const [ayudaMemoriaPorBen, setAyudaMemoriaPorBen] = useState<Record<string, AyudaMemoria[]>>({})
  const [precioMaps, setPrecioMaps] = useState<Record<string, Map<string, number | null>>>({})
  const [provA, setProvA] = useState('')
  const [provB, setProvB] = useState('')
  const [kpis, setKpis] = useState<KPISimulacion[]>([])
  const [loading, setLoading] = useState(true)
  const [simulado, setSimulado] = useState(false)

  useEffect(() => {
    async function load() {
      const [{ data: provs }, { data: bens }, { data: ins }, { data: ams }, { data: precs }] = await Promise.all([
        supabase.from('proveedores').select('*').eq('es_activo', true).order('nombre'),
        supabase.from('beneficiarios').select('*').order('segmento').order('nombre'),
        supabase.from('catalogo_insumos').select('*'),
        supabase.from('ayuda_memoria').select('*'),
        supabase.from('precios_proveedor').select('*'),
      ])
      if (provs) {
        setProveedores(provs as Proveedor[])
        if (provs.length >= 1) setProvA(provs[0].id)
        if (provs.length >= 2) setProvB(provs[1].id)
      }
      if (bens) setBeneficiarios(bens as Beneficiario[])
      if (ins) setInsumos(ins as CatalogoInsumo[])
      if (ams) {
        const map: Record<string, AyudaMemoria[]> = {}
        for (const am of ams as AyudaMemoria[]) {
          if (!map[am.beneficiario_id]) map[am.beneficiario_id] = []
          map[am.beneficiario_id].push(am)
        }
        setAyudaMemoriaPorBen(map)
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

    const kpiA = calcularKPI(provAObj, beneficiarios, precioMaps[provA] ?? new Map(), insumos, ayudaMemoriaPorBen)
    const kpiB = calcularKPI(provBObj, beneficiarios, precioMaps[provB] ?? new Map(), insumos, ayudaMemoriaPorBen)

    kpiA.es_ganador = kpiA.volumen_total_comunidad >= kpiB.volumen_total_comunidad
    kpiB.es_ganador = kpiB.volumen_total_comunidad > kpiA.volumen_total_comunidad
    setKpis([kpiA, kpiB])
    setSimulado(true)
  }

  // Desglose por insumo para barras comparativas
  const maxPerInsumo: Record<string, number> = {}
  if (simulado && kpis.length === 2) {
    for (const kpi of kpis) {
      for (const item of getDesglose(kpi.resultados)) {
        maxPerInsumo[item.nombre] = Math.max(maxPerInsumo[item.nombre] ?? 0, item.total)
      }
    }
  }

  // Datos para gráficos (calculados desde resultados)
  const barData = simulado && kpis.length === 2 ? [
    {
      categoria: 'Polines',
      [kpis[0].proveedor.nombre]: kpis[0].resultados.filter(r => !r.error).reduce((s, r) => s + r.polines, 0),
      [kpis[1].proveedor.nombre]: kpis[1].resultados.filter(r => !r.error).reduce((s, r) => s + r.polines, 0),
    },
    {
      categoria: 'Polietileno (m)',
      [kpis[0].proveedor.nombre]: kpis[0].resultados.filter(r => !r.error && r.beneficiario.segmento === 'Invernadero').length * METROS_POLY_MIN,
      [kpis[1].proveedor.nombre]: kpis[1].resultados.filter(r => !r.error && r.beneficiario.segmento === 'Invernadero').length * METROS_POLY_MIN,
    },
    {
      categoria: 'Mallas',
      [kpis[0].proveedor.nombre]: kpis[0].resultados.filter(r => !r.error && r.beneficiario.segmento === 'Cierre Perimetral').length,
      [kpis[1].proveedor.nombre]: kpis[1].resultados.filter(r => !r.error && r.beneficiario.segmento === 'Cierre Perimetral').length,
    },
  ] : []

  const invernadero = beneficiarios.filter(b => b.segmento === 'Invernadero')
  const cierre = beneficiarios.filter(b => b.segmento === 'Cierre Perimetral')

  if (loading) return (
    <div className="space-y-4">
      <div className="h-8 rounded animate-pulse w-48" style={{ background: 'rgba(255,255,255,0.4)' }} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[0, 1].map(i => <div key={i} className="h-64 rounded-2xl animate-pulse" style={{ background: 'rgba(255,255,255,0.4)' }} />)}
      </div>
    </div>
  )

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold" style={{ color: 'var(--verde-dark)' }}>simulador comparativo</h1>
        <p className="text-xs mt-0.5" style={{ color: 'rgba(0,0,0,0.4)' }}>
          Simulación en memoria basada en la ayuda memoria de cada socio. No altera el carrito real.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="total socios" value={String(beneficiarios.length)} />
        <StatCard label="Invernadero" value={String(invernadero.length)} color="verde" />
        <StatCard label="Cierre Perimetral" value={String(cierre.length)} color="cafe" />
        <StatCard label="con ayuda memoria" value={String(Object.keys(ayudaMemoriaPorBen).length)} color="verde" />
      </div>

      {/* Selector */}
      <div className="rounded-2xl p-4 glass-strong flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-[160px]">
          <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--cafe)' }}>Proveedor A</label>
          <select value={provA} onChange={e => setProvA(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
            style={{ border: '1px solid rgba(58,125,68,0.3)', background: 'rgba(255,255,255,0.8)' }}
          >
            {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--cafe)' }}>Proveedor B</label>
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
          Simular
        </button>
      </div>

      {/* Resultados */}
      {simulado && kpis.length === 2 && (
        <>
          {/* KPI cards side-by-side */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {kpis.map(kpi => <KPICard key={kpi.proveedor.id} kpi={kpi} maxPerInsumo={maxPerInsumo} />)}
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {/* Bar chart (3/5) */}
            <div className="lg:col-span-3 rounded-2xl p-5 glass">
              <p className="text-sm font-semibold mb-4" style={{ color: 'var(--verde-dark)' }}>
                Volumen de Materiales
              </p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={barData} margin={{ top: 0, right: 10, left: -10, bottom: 0 }}>
                  <XAxis dataKey="categoria" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey={kpis[0].proveedor.nombre} fill={VERDE} radius={[4, 4, 0, 0]} />
                  <Bar dataKey={kpis[1].proveedor.nombre} fill={CAFE} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Donut charts (2/5) */}
            <div className="lg:col-span-2 grid grid-cols-2 lg:grid-cols-1 gap-3">
              {kpis.map(kpi => {
                const exitosos = kpi.resultados.filter(r => !r.error)
                const gastado = exitosos.reduce((s, r) => s + Math.min(r.gasto_total, 189000), 0)
                const saldo = exitosos.reduce((s, r) => s + Math.max(0, 189000 - r.gasto_total), 0)
                const aporte = kpi.aporte_bolsillo_total
                const pieData = [
                  { name: 'Gastado', value: gastado },
                  { name: 'Saldo', value: saldo },
                  ...(aporte > 0 ? [{ name: 'Aporte bolsillo', value: aporte }] : []),
                ]
                return (
                  <div key={kpi.proveedor.id} className="rounded-2xl p-3 glass text-center">
                    <p className="text-xs font-semibold truncate mb-1" style={{ color: kpi.es_ganador ? 'var(--verde-dark)' : 'var(--cafe)' }}>
                      {kpi.proveedor.nombre}
                    </p>
                    <ResponsiveContainer width="100%" height={130}>
                      <PieChart>
                        <Pie data={pieData} cx="50%" cy="50%" innerRadius={38} outerRadius={55} dataKey="value" strokeWidth={0}>
                          {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                        </Pie>
                        <Tooltip formatter={(v) => formatCLP(v as number)} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )
              })}
            </div>
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
            Selecciona dos proveedores y presiona <strong>Simular</strong>.
          </p>
          <p className="text-xs mt-1" style={{ color: 'rgba(0,0,0,0.3)' }}>
            La simulación usa la ayuda memoria de cada socio. No modifica el carrito real.
          </p>
        </div>
      )}
    </div>
  )
}

type DesgloseItem = { nombre: string; total: number; unidad: string }

function getDesglose(resultados: ResultadoSimulacion[]): DesgloseItem[] {
  const exitosos = resultados.filter(r => r.error === null)
  const map = new Map<string, DesgloseItem>()
  for (const r of exitosos) {
    if (r.insumo_base_id && r.insumo_base_nombre) {
      const existing = map.get(r.insumo_base_id)
      if (existing) existing.total += r.insumo_base_cantidad
      else map.set(r.insumo_base_id, { nombre: r.insumo_base_nombre, total: r.insumo_base_cantidad, unidad: r.insumo_base_nombre.startsWith('Polietileno') ? 'm' : 'rollo(s)' })
    }
  }
  const totalPolines = exitosos.reduce((s, r) => s + r.polines, 0)
  if (totalPolines > 0) map.set('__polines', { nombre: 'Polines (3 a 4 cm)', total: totalPolines, unidad: 'un.' })
  return Array.from(map.values())
}

function KPICard({ kpi, maxPerInsumo }: { kpi: KPISimulacion; maxPerInsumo: Record<string, number> }) {
  const { proveedor, resultados, volumen_total_comunidad, aporte_bolsillo_total, socios_con_error, es_ganador } = kpi
  const exitosos = resultados.filter(r => r.error === null)
  const desglose = getDesglose(resultados)
  const accentColor = es_ganador ? VERDE : CAFE

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
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-bold" style={{ color: '#1c1c1c' }}>{proveedor.nombre}</h3>
        {es_ganador && (
          <span className="flex items-center gap-1 text-xs font-bold text-white px-2.5 py-1 rounded-full" style={{ background: 'var(--verde)' }}>
            🏆 mejor opción
          </span>
        )}
      </div>

      {/* Alerta amarilla: precios faltantes */}
      {socios_con_error > 0 && (
        <div className="rounded-xl p-3 text-xs" style={{ background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.3)', color: '#92400e' }}>
          <p className="font-semibold">Atención: Faltan precios para {socios_con_error} socio(s)</p>
          <p className="mt-0.5" style={{ color: 'rgba(146,64,14,0.75)' }}>
            Se calcularon los {exitosos.length} socios con datos completos. Los demás fueron omitidos.
          </p>
        </div>
      )}

      {/* Métricas resumen */}
      <div className="grid grid-cols-2 gap-3">
        <Metric label="Volumen total" value={String(volumen_total_comunidad)} sub="unidades comunidad" highlight={es_ganador} icon={TrendingUp} />
        <Metric label="Aporte de bolsillo" value={formatCLP(aporte_bolsillo_total)} sub="total comunidad" danger={aporte_bolsillo_total > 0} icon={Wallet} />
        <Metric label="Socios calculados" value={String(exitosos.length)} sub={`de ${resultados.length}`} icon={Users} />
        <Metric label="Insumos distintos" value={String(desglose.length)} sub="tipos en desglose" icon={Package} />
      </div>

      {/* Desglose por insumo con barras */}
      {desglose.length > 0 && (
        <div className="rounded-xl p-3 space-y-3" style={{ background: 'rgba(0,0,0,0.04)' }}>
          <p className="text-xs font-semibold" style={{ color: 'rgba(0,0,0,0.45)' }}>desglose comunidad completa</p>
          {desglose.map(item => {
            const max = maxPerInsumo[item.nombre] ?? item.total
            const pct = max > 0 ? Math.round((item.total / max) * 100) : 100
            return (
              <div key={item.nombre}>
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-xs truncate max-w-[70%]" style={{ color: 'rgba(0,0,0,0.6)' }}>{item.nombre}</span>
                  <span className="text-xs font-bold shrink-0 ml-2" style={{ color: accentColor }}>
                    {item.total} {item.unidad}
                  </span>
                </div>
                <div className="w-full rounded-full overflow-hidden" style={{ height: 5, background: 'rgba(0,0,0,0.08)' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: accentColor, borderRadius: 9999, transition: 'width 0.4s ease' }} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Detalle por socio */}
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

function Metric({ label, value, sub, highlight, danger, icon: Icon }: {
  label: string; value: string; sub?: string; highlight?: boolean; danger?: boolean
  icon?: React.ElementType
}) {
  return (
    <div className="rounded-xl p-3" style={{ background: highlight ? 'rgba(58,125,68,0.1)' : 'rgba(0,0,0,0.04)' }}>
      <div className="flex items-center gap-1.5 mb-1">
        {Icon && <Icon size={13} style={{ color: highlight ? VERDE : danger ? '#dc2626' : 'rgba(0,0,0,0.35)' }} />}
        <p className="text-xs" style={{ color: 'rgba(0,0,0,0.45)' }}>{label}</p>
      </div>
      <p className="text-base font-bold" style={{ color: highlight ? 'var(--verde-dark)' : danger ? '#dc2626' : '#1c1c1c' }}>
        {value}
      </p>
      {sub && <p className="text-xs mt-0.5" style={{ color: 'rgba(0,0,0,0.35)' }}>{sub}</p>}
    </div>
  )
}
