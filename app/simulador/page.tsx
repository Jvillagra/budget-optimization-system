'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Proveedor, Insumo, Beneficiario } from '@/lib/types'
import { simularEscenario, formatCLP } from '@/lib/business-logic'

interface ResultadoEscenario {
  proveedor: Proveedor
  insumos: Insumo[]
  volumenTotal: number
  aporteBolsilloTotal: number
  gastoComunidad: number
}

export default function SimuladorPage() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [insumosPorProveedor, setInsumosPorProveedor] = useState<Record<string, Insumo[]>>({})
  const [beneficiarios, setBeneficiarios] = useState<Beneficiario[]>([])
  const [resultados, setResultados] = useState<ResultadoEscenario[]>([])
  const [loading, setLoading] = useState(true)
  const [calculando, setCalculando] = useState(false)

  useEffect(() => {
    async function fetchData() {
      const [{ data: provs }, { data: ins }, { data: bens }] = await Promise.all([
        supabase.from('proveedores').select('*').order('nombre'),
        supabase.from('insumos').select('*').order('categoria'),
        supabase.from('beneficiarios').select('*').order('nombre'),
      ])

      if (provs) setProveedores(provs)
      if (ins && provs) {
        const map: Record<string, Insumo[]> = {}
        for (const p of provs) {
          map[p.id] = (ins as Insumo[]).filter((i) => i.proveedor_id === p.id)
        }
        setInsumosPorProveedor(map)
      }
      if (bens) setBeneficiarios(bens as Beneficiario[])
      setLoading(false)
    }
    fetchData()
  }, [])

  function calcular() {
    setCalculando(true)
    const res: ResultadoEscenario[] = proveedores.map((prov) => {
      const insumos = insumosPorProveedor[prov.id] ?? []
      const { volumenTotal, aporteBolsilloTotal, gastoComunidad } = simularEscenario(beneficiarios, insumos)
      return { proveedor: prov, insumos, volumenTotal, aporteBolsilloTotal, gastoComunidad }
    })
    // Ordena: mayor volumen + menor aporte de bolsillo
    res.sort((a, b) => b.volumenTotal - a.volumenTotal || a.aporteBolsilloTotal - b.aporteBolsilloTotal)
    setResultados(res)
    setCalculando(false)
  }

  const mejorEscenario = resultados[0]

  // Stats de la comunidad
  const invernadero = beneficiarios.filter((b) => b.proyecto === 'Invernadero')
  const cierrePerimetral = beneficiarios.filter((b) => b.proyecto === 'Cierre Perimetral')

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 bg-gray-100 rounded animate-pulse w-48" />
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold" style={{ color: 'var(--verde-dark)' }}>Simulador Comparativo</h1>
          <p className="text-sm mt-0.5" style={{ color: 'rgba(0,0,0,0.45)' }}>
            Compara proveedores y encuentra la mejor opción para la comunidad.
          </p>
        </div>
        <button
          onClick={calcular}
          disabled={calculando || proveedores.length === 0}
          className="rounded-xl px-4 py-2 text-sm text-white font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          style={{ background: 'var(--verde)' }}
        >
          {calculando ? 'Calculando...' : 'Simular'}
        </button>
      </div>

      {/* Stats de la comunidad */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total beneficiarios" value={beneficiarios.length.toString()} />
        <StatCard label="Presupuesto por socio" value={formatCLP(189000)} />
        <StatCard label="Invernadero" value={invernadero.length.toString()} accent="green" />
        <StatCard label="Cierre Perimetral" value={cierrePerimetral.length.toString()} accent="cafe" />
      </div>

      {/* Resultados de la simulación */}
      {resultados.length > 0 ? (
        <div>
          <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--cafe)' }}>Resultados por proveedor</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {resultados.map((res, idx) => {
              const esMejor = res.proveedor.id === mejorEscenario?.proveedor.id
              return (
                <div
                  key={res.proveedor.id}
                  className="rounded-2xl p-5 space-y-4 transition-all"
                  style={esMejor ? {
                    background: 'rgba(58,125,68,0.08)',
                    backdropFilter: 'blur(14px)',
                    WebkitBackdropFilter: 'blur(14px)',
                    border: '1.5px solid var(--verde)',
                    boxShadow: '0 4px 24px rgba(58,125,68,0.14)',
                  } : {
                    background: 'rgba(255,255,255,0.65)',
                    backdropFilter: 'blur(14px)',
                    WebkitBackdropFilter: 'blur(14px)',
                    border: '1px solid rgba(255,255,255,0.55)',
                    boxShadow: '0 2px 12px rgba(61,90,54,0.07)',
                  }}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold" style={{ color: '#1c1c1c' }}>{res.proveedor.nombre}</h3>
                    {esMejor && (
                      <span className="flex items-center gap-1 text-xs text-white px-2.5 py-0.5 rounded-full font-semibold" style={{ background: 'var(--verde)' }}>
                        Mejor opción
                      </span>
                    )}
                    {idx === resultados.length - 1 && !esMejor && (
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--cafe-muted)', color: 'var(--cafe)' }}>
                        #{idx + 1}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <MetricCard label="Volumen total" value={res.volumenTotal.toString()} sublabel="unidades comunidad" highlight={esMejor} />
                    <MetricCard label="Gasto comunidad" value={formatCLP(res.gastoComunidad)} sublabel="total 29 socios" />
                    <MetricCard label="Aporte de bolsillo" value={formatCLP(res.aporteBolsilloTotal)} sublabel="total comunidad" danger={res.aporteBolsilloTotal > 0} />
                    <MetricCard label="Insumos disponibles" value={res.insumos.length.toString()} sublabel="en catálogo" />
                  </div>

                  {res.insumos.length > 0 && (
                    <div>
                      <p className="text-xs uppercase tracking-wide mb-2" style={{ color: 'rgba(0,0,0,0.35)' }}>Catálogo</p>
                      <div className="space-y-1">
                        {res.insumos.map((i) => (
                          <div key={i.id} className="flex justify-between text-xs" style={{ color: 'rgba(0,0,0,0.6)' }}>
                            <span>{i.nombre}</span>
                            <span className="font-semibold">{formatCLP(i.precio_unitario)} / {i.formato_venta}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Resumen comparativo */}
          {resultados.length >= 2 && (
            <div className="mt-4 rounded-2xl p-5" style={{ background: 'var(--verde-dark)' }}>
              <h3 className="text-sm font-semibold mb-3" style={{ color: 'rgba(255,255,255,0.7)' }}>Análisis comparativo</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {(() => {
                  const mejor = resultados[0]
                  const peor = resultados[resultados.length - 1]
                  const difVolumen = mejor.volumenTotal - peor.volumenTotal
                  const difGasto = peor.gastoComunidad - mejor.gastoComunidad
                  return (
                    <>
                      <div>
                        <p className="text-xs text-gray-400">Diferencia de volumen</p>
                        <p className="text-xl font-bold text-emerald-400">+{difVolumen} unidades</p>
                        <p className="text-xs text-gray-400 mt-0.5">con {mejor.proveedor.nombre}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">Ahorro comunitario</p>
                        <p className="text-xl font-bold text-emerald-400">{formatCLP(difGasto > 0 ? difGasto : 0)}</p>
                        <p className="text-xs text-gray-400 mt-0.5">eligiendo {mejor.proveedor.nombre}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">Recomendación</p>
                        <p className="text-sm font-semibold text-white mt-1">
                          {mejor.proveedor.nombre} ofrece {difVolumen > 0 ? `${difVolumen} unidades más` : 'igual volumen'} a menor costo.
                        </p>
                      </div>
                    </>
                  )
                })()}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border-2 border-dashed p-12 text-center" style={{ borderColor: 'rgba(58,125,68,0.2)' }}>
          <p className="text-sm" style={{ color: 'rgba(0,0,0,0.4)' }}>Presiona &ldquo;Simular&rdquo; para comparar los proveedores.</p>
          <p className="text-xs mt-1" style={{ color: 'rgba(0,0,0,0.3)' }}>
            El sistema calculará automáticamente la asignación óptima para los {beneficiarios.length} beneficiarios.
          </p>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: 'green' | 'cafe' }) {
  return (
    <div className="rounded-2xl p-4 glass">
      <p className="text-xs" style={{ color: 'rgba(0,0,0,0.4)' }}>{label}</p>
      <p className="text-xl font-bold mt-0.5" style={{
        color: accent === 'green' ? 'var(--verde)' : accent === 'cafe' ? 'var(--cafe)' : '#1c1c1c'
      }}>{value}</p>
    </div>
  )
}

function MetricCard({ label, value, sublabel, highlight, danger }: {
  label: string; value: string; sublabel?: string; highlight?: boolean; danger?: boolean
}) {
  return (
    <div className="rounded-xl p-3" style={{
      background: highlight ? 'rgba(58,125,68,0.1)' : 'rgba(0,0,0,0.04)',
    }}>
      <p className="text-xs" style={{ color: 'rgba(0,0,0,0.45)' }}>{label}</p>
      <p className="text-base font-bold mt-0.5" style={{
        color: highlight ? 'var(--verde-dark)' : danger ? '#dc2626' : '#1c1c1c'
      }}>{value}</p>
      {sublabel && <p className="text-xs mt-0.5" style={{ color: 'rgba(0,0,0,0.35)' }}>{sublabel}</p>}
    </div>
  )
}
