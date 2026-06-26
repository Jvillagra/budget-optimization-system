'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { TrendingUp, Wallet, Package, Users, Layers } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell,
  PieChart, Pie, ResponsiveContainer, LabelList,
} from 'recharts'
import { supabase } from '@/lib/supabase'
import type { Proveedor, Beneficiario, CatalogoInsumo, AyudaMemoria, KPISimulacion, ResultadoSimulacion } from '@/lib/types'
import { buildPrecioMap, calcularKPI, formatCLP } from '@/lib/business-logic'

const VERDE = '#3a7d44'
const CAFE = '#7f4f24'
const PIE_COLORS = [VERDE, '#e5e7eb', '#dc2626']

type DesgloseItem = { nombre: string; corto: string; total: number; unidad: string }

function shortName(nombre: string): string {
  return nombre
    .replace('Polietileno (Largo 4m, Ancho 8m)', 'Polietileno')
    .replace('Polines (3 a 4 cm)', 'Polines')
    .replace('Malla Galvanizada 5014', 'Galv.')
    .replace('Malla Inchalam Ecosol', 'Ecosol')
    .replace('Malla Inchalam', 'Inchalam')
    .replace('Malla Ursus', 'Ursus')
}

function getDesglose(resultados: ResultadoSimulacion[]): DesgloseItem[] {
  const exitosos = resultados.filter(r => r.error === null)
  const map = new Map<string, DesgloseItem>()
  for (const r of exitosos) {
    if (r.insumo_base_id && r.insumo_base_nombre) {
      const existing = map.get(r.insumo_base_id)
      if (existing) existing.total += r.insumo_base_cantidad
      else map.set(r.insumo_base_id, {
        nombre: r.insumo_base_nombre,
        corto: shortName(r.insumo_base_nombre),
        total: r.insumo_base_cantidad,
        unidad: r.insumo_base_nombre.startsWith('Polietileno') ? 'm' : 'rollos',
      })
    }
  }
  const totalPolines = exitosos.reduce((s, r) => s + r.polines, 0)
  if (totalPolines > 0) map.set('__polines', { nombre: 'Polines (3 a 4 cm)', corto: 'Polines', total: totalPolines, unidad: 'un.' })
  return Array.from(map.values())
}

export default function SimuladorPage() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [beneficiarios, setBeneficiarios] = useState<Beneficiario[]>([])
  const [insumos, setInsumos] = useState<CatalogoInsumo[]>([])
  const [ayudaMemoriaPorBen, setAyudaMemoriaPorBen] = useState<Record<string, AyudaMemoria[]>>({})
  const [precioMaps, setPrecioMaps] = useState<Record<string, Map<string, number | null>>>({})
  const [provA, setProvA] = useState('')
  const [provB, setProvB] = useState('')
  const [provC, setProvC] = useState('')
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
        if (provs.length >= 3) setProvC(provs[2].id)
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
    const ids = [provA, provB, ...(provC ? [provC] : [])]
    const objs = ids.map(id => proveedores.find(p => p.id === id)).filter(Boolean) as typeof proveedores
    const kpisCalc = objs.map(prov =>
      calcularKPI(prov, beneficiarios, precioMaps[prov.id] ?? new Map(), insumos, ayudaMemoriaPorBen)
    )
    const maxVol = Math.max(...kpisCalc.map(k => k.volumen_total_comunidad))
    kpisCalc.forEach(k => { k.es_ganador = k.volumen_total_comunidad === maxVol })
    setKpis(kpisCalc)
    setSimulado(true)
  }

  // Datos para gráfico de Polines (varía por precio de cada proveedor)
  const polinesData = simulado && kpis.length > 0 ? kpis.map(kpi => ({
    proveedor: kpi.proveedor.nombre.split(' ').slice(-1)[0], // ciudad: "Pucón", "Villarrica"
    nombreCompleto: kpi.proveedor.nombre,
    polines: kpi.resultados.filter(r => !r.error).reduce((s, r) => s + r.polines, 0),
    es_ganador: kpi.es_ganador,
  })) : []

  // Scorecard: todos los insumos con N proveedores
  const scorecardData = (() => {
    if (!simulado || kpis.length === 0) return []
    const desgloses = kpis.map(k => getDesglose(k.resultados))
    const nombresSet = new Set(desgloses.flatMap(d => d.map(i => i.nombre)))
    return Array.from(nombresSet).map(nombre => {
      const items = desgloses.map(d => d.find(i => i.nombre === nombre))
      const totales = items.map(i => i?.total ?? 0)
      const maxTotal = Math.max(...totales)
      return {
        nombre,
        corto: items.find(Boolean)?.corto ?? nombre,
        unidad: items.find(Boolean)?.unidad ?? '',
        totales,
        esGanador: totales.map(v => v === maxTotal && totales.some(x => x !== maxTotal)),
        igual: totales.every(v => v === totales[0]),
      }
    })
  })()

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
        <h1 className="text-lg font-bold" style={{ color: 'var(--verde-dark)' }}>Simulador comparativo</h1>
        <p className="text-xs mt-0.5" style={{ color: 'rgba(0,0,0,0.4)' }}>
          Simulación en memoria basada en la ayuda memoria de cada socio. No altera el carrito real.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total socios" value={String(beneficiarios.length)} />
        <StatCard label="Invernadero" value={String(invernadero.length)} color="verde" />
        <StatCard label="Cierre Perimetral" value={String(cierre.length)} color="cafe" />
        <StatCard label="Con ayuda memoria" value={String(Object.keys(ayudaMemoriaPorBen).length)} color="verde" />
      </div>

      {/* Selector */}
      <div className="rounded-2xl p-4 glass-strong space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label: 'Proveedor A', val: provA, set: setProvA },
            { label: 'Proveedor B', val: provB, set: setProvB },
            { label: 'Proveedor C', val: provC, set: setProvC },
          ].map(({ label, val, set }) => (
            <div key={label}>
              <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--cafe)' }}>{label}</label>
              <select value={val} onChange={e => set(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                style={{ border: '1px solid rgba(58,125,68,0.3)', background: 'rgba(255,255,255,0.8)' }}
              >
                {label === 'Proveedor C' && <option value="">— opcional —</option>}
                {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
          ))}
        </div>
        <button
          onClick={simular}
          disabled={!provA || !provB}
          className="w-full rounded-xl px-6 py-2.5 text-sm text-white font-bold disabled:opacity-40"
          style={{ background: 'var(--verde)' }}
        >
          Simular
        </button>
      </div>

      {/* Resultados */}
      {simulado && kpis.length > 0 && (
        <>
          {/* KPI cards */}
          <div className={`grid grid-cols-1 gap-4 ${kpis.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
            {kpis.map(kpi => <KPICard key={kpi.proveedor.id} kpi={kpi} />)}
          </div>

          {/* Scorecard + Polines chart */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {/* Scorecard */}
            <div className="lg:col-span-3 rounded-2xl p-5 glass">
              <p className="text-sm font-semibold mb-0.5" style={{ color: 'var(--verde-dark)' }}>
                Materiales que puede adquirir la comunidad
              </p>
              <p className="text-xs mb-4" style={{ color: 'rgba(0,0,0,0.4)' }}>
                Total de unidades por insumo, dado los precios de cada proveedor
              </p>

              {/* Header — N columnas dinámicas */}
              <div
                className="text-xs font-semibold mb-2 px-1 gap-x-2"
                style={{ display: 'grid', gridTemplateColumns: `1fr ${kpis.map(() => '64px').join(' ')}`, color: 'rgba(0,0,0,0.4)' }}
              >
                <span>Insumo</span>
                {kpis.map(k => (
                  <span key={k.proveedor.id} className="text-center">{k.proveedor.nombre.split(' ').slice(-1)[0]}</span>
                ))}
              </div>

              <div className="space-y-1">
                {scorecardData.map(row => (
                  <div
                    key={row.nombre}
                    className="items-center px-3 py-2 rounded-xl gap-x-2"
                    style={{ display: 'grid', gridTemplateColumns: `1fr ${kpis.map(() => '64px').join(' ')}`, background: 'rgba(0,0,0,0.03)' }}
                  >
                    <span className="text-xs font-medium" style={{ color: 'rgba(0,0,0,0.65)' }}>{row.corto}</span>
                    {row.totales.map((val, i) => (
                      <div key={i} className="text-center">
                        <span className="text-sm font-bold" style={{
                          color: row.igual ? 'rgba(0,0,0,0.5)' : row.esGanador[i] ? VERDE : 'rgba(0,0,0,0.3)'
                        }}>
                          {val.toLocaleString('es-CL')}
                        </span>
                        <span className="text-xs" style={{ color: 'rgba(0,0,0,0.4)' }}> {row.unidad}</span>
                        {row.esGanador[i] && <div className="text-xs" style={{ color: VERDE }}>✓</div>}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            {/* Polines chart */}
            <div className="lg:col-span-2 rounded-2xl p-5 glass flex flex-col">
              <p className="text-sm font-semibold mb-0.5" style={{ color: 'var(--verde-dark)' }}>Polines totales</p>
              <p className="text-xs mb-4" style={{ color: 'rgba(0,0,0,0.4)' }}>
                El precio del polin define cuántos puede comprar cada socio con su saldo
              </p>
              <div className="flex-1 flex items-end">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={polinesData} margin={{ top: 20, right: 20, left: 0, bottom: 0 }}>
                    <XAxis dataKey="proveedor" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      formatter={(v, _name, props) => [`${(v as number).toLocaleString('es-CL')} un.`, props.payload?.nombreCompleto ?? '']}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid rgba(0,0,0,0.08)' }}
                    />
                    <Bar dataKey="polines" radius={[6, 6, 0, 0]} maxBarSize={80}>
                      <LabelList dataKey="polines" position="top" style={{ fontSize: 13, fontWeight: 700 }} formatter={(v: unknown) => typeof v === 'number' ? v.toLocaleString('es-CL') : String(v)} />
                      {polinesData.map((entry, i) => (
                        <Cell key={i} fill={entry.es_ganador ? VERDE : CAFE} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Donut charts */}
          <div className={`grid grid-cols-1 gap-4 ${kpis.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
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
                <div key={kpi.proveedor.id} className="rounded-2xl p-4 glass flex items-center gap-4">
                  <div className="shrink-0">
                    <ResponsiveContainer width={100} height={100}>
                      <PieChart>
                        <Pie data={pieData} cx="50%" cy="50%" innerRadius={28} outerRadius={44} dataKey="value" strokeWidth={0}>
                          {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                        </Pie>
                        <Tooltip formatter={(v) => formatCLP(v as number)} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-1 min-w-0">
                    <p className="text-xs font-bold truncate" style={{ color: kpi.es_ganador ? 'var(--verde-dark)' : 'var(--cafe)' }}>
                      {kpi.proveedor.nombre}
                    </p>
                    {pieData.map((d, i) => (
                      <div key={d.name} className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: PIE_COLORS[i] }} />
                        <span className="text-xs truncate" style={{ color: 'rgba(0,0,0,0.55)' }}>{d.name}: <strong style={{ color: '#1c1c1c' }}>{formatCLP(d.value)}</strong></span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Análisis comparativo */}
          <div className="rounded-2xl p-5" style={{ background: 'var(--verde-dark)' }}>
            <p className="text-xs font-semibold mb-3" style={{ color: 'rgba(255,255,255,0.65)' }}>Análisis comparativo</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {(() => {
                const ganador = kpis.reduce((best, k) => k.volumen_total_comunidad > best.volumen_total_comunidad ? k : best)
                const resto = kpis.filter(k => k !== ganador)
                const difVol = ganador.volumen_total_comunidad - Math.max(...resto.map(k => k.volumen_total_comunidad))
                const minAporte = Math.min(...kpis.map(k => k.aporte_bolsillo_total))
                const maxAporte = Math.max(...kpis.map(k => k.aporte_bolsillo_total))
                return (
                  <>
                    <div>
                      <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>Mayor volumen</p>
                      <p className="text-2xl font-bold text-white">{ganador.volumen_total_comunidad.toLocaleString('es-CL')} uds.</p>
                      <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>{ganador.proveedor.nombre} (+{difVol.toLocaleString('es-CL')} sobre el resto)</p>
                    </div>
                    <div>
                      <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>Ahorro en aportes</p>
                      <p className="text-2xl font-bold text-white">{formatCLP(maxAporte - minAporte)}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>diferencia entre mejor y peor opción</p>
                    </div>
                    <div>
                      <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>Recomendación</p>
                      <p className="text-sm font-bold text-white mt-1">
                        {difVol > 0
                          ? `${ganador.proveedor.nombre} logra ${difVol.toLocaleString('es-CL')} unidades más que el segundo mejor.`
                          : 'Todos los proveedores entregan el mismo volumen.'}
                      </p>
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
            Selecciona dos o tres proveedores y presiona <strong>Simular</strong>.
          </p>
          <p className="text-xs mt-1" style={{ color: 'rgba(0,0,0,0.3)' }}>
            La simulación usa la ayuda memoria de cada socio. No modifica el carrito real.
          </p>
        </div>
      )}
    </div>
  )
}

function KPICard({ kpi }: { kpi: KPISimulacion }) {
  const { proveedor, resultados, volumen_total_comunidad, aporte_bolsillo_total, es_ganador } = kpi
  const exitosos = resultados.filter(r => r.error === null)
  const totalPolines = exitosos.reduce((s, r) => s + r.polines, 0)
  const totalMallas = exitosos.filter(r => r.insumo_base_id !== null && !r.insumo_base_nombre?.startsWith('Polietileno')).length
  const totalPoly = exitosos.filter(r => r.insumo_base_nombre?.startsWith('Polietileno')).reduce((s, r) => s + r.insumo_base_cantidad, 0)

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
            🏆 Mejor opción
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Metric label="Volumen total" value={volumen_total_comunidad.toLocaleString('es-CL')} sub="unidades comunidad" highlight={es_ganador} icon={TrendingUp} />
        <Metric label="Aporte de bolsillo" value={formatCLP(aporte_bolsillo_total)} sub="total comunidad" danger={aporte_bolsillo_total > 0} icon={Wallet} />
        <Metric label="Polines totales" value={totalPolines.toLocaleString('es-CL')} sub="unidades" highlight={es_ganador} icon={Package} />
        <Metric label="Socios calculados" value={String(exitosos.length)} sub={`de ${resultados.length}`} icon={Users} />
        <Metric label="Mallas" value={String(totalMallas)} sub="rollos" icon={Layers} />
        <Metric label="Polietileno" value={`${totalPoly} m`} sub={`${exitosos.filter(r => r.insumo_base_nombre?.startsWith('Polietileno')).length} socios`} icon={Package} />
      </div>

      <details className="text-xs">
        <summary className="cursor-pointer font-semibold" style={{ color: 'var(--cafe)' }}>
          Ver detalle por socio ({exitosos.length} calculados)
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
