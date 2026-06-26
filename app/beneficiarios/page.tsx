'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Beneficiario, Asignacion, Insumo, ResumenPresupuesto } from '@/lib/types'
import { calcularResumenPresupuesto, calcularMaxPolines, formatCLP, METROS_POLIETILENO_MINIMO } from '@/lib/business-logic'
import BeneficiarioCard from '@/components/BeneficiarioCard'
import PresupuestoPanel from '@/components/PresupuestoPanel'

export default function BeneficiariosPage() {
  const [beneficiarios, setBeneficiarios] = useState<Beneficiario[]>([])
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [asignacionesPorBeneficiario, setAsignacionesPorBeneficiario] = useState<Record<string, Asignacion[]>>({})
  const [seleccionado, setSeleccionado] = useState<string | null>(null)
  const [resumen, setResumen] = useState<ResumenPresupuesto | null>(null)
  const [cantidad, setCantidad] = useState<number>(1)
  const [insumoSeleccionado, setInsumoSeleccionado] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [filtroProyecto, setFiltroProyecto] = useState<'Todos' | 'Invernadero' | 'Cierre Perimetral'>('Todos')

  useEffect(() => {
    async function fetchData() {
      const [{ data: bens }, { data: ins }, { data: asigs }] = await Promise.all([
        supabase.from('beneficiarios').select('*').order('nombre'),
        supabase.from('insumos').select('*, proveedores(nombre)').order('categoria'),
        supabase.from('asignaciones').select('*, insumos(*, proveedores(nombre))'),
      ])

      if (bens) setBeneficiarios(bens as Beneficiario[])
      if (ins) setInsumos(ins as Insumo[])
      if (asigs) {
        const map: Record<string, Asignacion[]> = {}
        for (const a of asigs as Asignacion[]) {
          if (!map[a.beneficiario_id]) map[a.beneficiario_id] = []
          map[a.beneficiario_id].push(a)
        }
        setAsignacionesPorBeneficiario(map)
      }
      setLoading(false)
    }
    fetchData()
  }, [])

  const seleccionarBeneficiario = useCallback((ben: Beneficiario) => {
    setSeleccionado(ben.id)
    const asigs = asignacionesPorBeneficiario[ben.id] ?? []
    setResumen(calcularResumenPresupuesto(ben, asigs))
    setInsumoSeleccionado('')
    setCantidad(1)
  }, [asignacionesPorBeneficiario])

  async function agregarAsignacion() {
    if (!seleccionado || !insumoSeleccionado) return
    const insumo = insumos.find((i) => i.id === insumoSeleccionado)
    if (!insumo) return

    const { data } = await supabase
      .from('asignaciones')
      .insert({
        beneficiario_id: seleccionado,
        insumo_id: insumoSeleccionado,
        cantidad,
        precio_unitario_snapshot: insumo.precio_unitario,
      })
      .select('*, insumos(*, proveedores(nombre))')
      .single()

    if (data) {
      const nuevas = [...(asignacionesPorBeneficiario[seleccionado] ?? []), data as Asignacion]
      setAsignacionesPorBeneficiario((prev) => ({ ...prev, [seleccionado]: nuevas }))
      const ben = beneficiarios.find((b) => b.id === seleccionado)!
      setResumen(calcularResumenPresupuesto(ben, nuevas))
      setInsumoSeleccionado('')
      setCantidad(1)
    }
  }

  async function eliminarAsignacion(asignacionId: string) {
    await supabase.from('asignaciones').delete().eq('id', asignacionId)
    const nuevas = (asignacionesPorBeneficiario[seleccionado!] ?? []).filter((a) => a.id !== asignacionId)
    setAsignacionesPorBeneficiario((prev) => ({ ...prev, [seleccionado!]: nuevas }))
    const ben = beneficiarios.find((b) => b.id === seleccionado)!
    setResumen(calcularResumenPresupuesto(ben, nuevas))
  }

  const beneficiariosFiltrados = filtroProyecto === 'Todos'
    ? beneficiarios
    : beneficiarios.filter((b) => b.proyecto === filtroProyecto)

  const benSeleccionado = beneficiarios.find((b) => b.id === seleccionado)
  const insumosFiltrados = benSeleccionado
    ? insumos.filter((i) =>
        benSeleccionado.proyecto === 'Invernadero'
          ? i.categoria !== 'Malla'
          : true
      )
    : insumos

  // Sugerencia automática para Invernadero
  let sugerencia: string | null = null
  if (benSeleccionado?.proyecto === 'Invernadero' && resumen) {
    const poly = insumos.find((i) => i.categoria === 'Polietileno')
    const polin = insumos.find((i) => i.categoria === 'Polines')
    if (poly && polin) {
      const { cantidadMaxPolines } = calcularMaxPolines(
        resumen.saldo_disponible + resumen.total_gastado,
        poly.precio_unitario,
        polin.precio_unitario
      )
      sugerencia = `Mínimo: ${METROS_POLIETILENO_MINIMO}m de polietileno. Con el saldo restante puedes comprar hasta ${cantidadMaxPolines} polines.`
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Lista de beneficiarios */}
      <div className="lg:col-span-2 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold" style={{ color: 'var(--verde-dark)' }}>
            Beneficiarios <span className="font-normal text-sm" style={{ color: 'rgba(0,0,0,0.35)' }}>({beneficiarios.length})</span>
          </h1>
          <div className="flex gap-1">
            {(['Todos', 'Invernadero', 'Cierre Perimetral'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFiltroProyecto(f)}
                className="text-xs px-3 py-1 rounded-full border transition-all"
                style={filtroProyecto === f ? {
                  background: 'var(--verde)',
                  color: '#fff',
                  borderColor: 'var(--verde)',
                } : {
                  color: 'var(--cafe)',
                  borderColor: 'rgba(127,79,36,0.3)',
                }}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-24 rounded-xl bg-gray-100 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {beneficiariosFiltrados.map((ben) => {
              const asigs = asignacionesPorBeneficiario[ben.id] ?? []
              const total = asigs.reduce((s, a) => s + a.costo_total, 0)
              const aporte = Math.max(0, total - ben.presupuesto_base)
              return (
                <BeneficiarioCard
                  key={ben.id}
                  beneficiario={ben}
                  totalGastado={total}
                  aporteBolsillo={aporte}
                  isSelected={seleccionado === ben.id}
                  onClick={() => seleccionarBeneficiario(ben)}
                />
              )
            })}
          </div>
        )}
      </div>

      {/* Panel lateral */}
      <div className="space-y-4">
        <PresupuestoPanel resumen={resumen} />

        {seleccionado && (
          <div className="rounded-2xl p-4 space-y-3 glass">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--cafe-dark)' } as React.CSSProperties}>Agregar insumo</h3>

            {sugerencia && (
              <p className="text-xs rounded-lg p-2" style={{ background: 'var(--cafe-muted)', color: 'var(--cafe-dark)', border: '1px solid rgba(127,79,36,0.2)' }}>
                {sugerencia}
              </p>
            )}

            <select
              value={insumoSeleccionado}
              onChange={(e) => setInsumoSeleccionado(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2" style={{ border: '1px solid rgba(58,125,68,0.25)', background: 'rgba(255,255,255,0.7)', focusRingColor: 'var(--verde)' } as React.CSSProperties}
            >
              <option value="">Seleccionar insumo...</option>
              {insumosFiltrados.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.nombre} — {formatCLP(i.precio_unitario)} / {i.formato_venta}
                </option>
              ))}
            </select>

            <div className="flex gap-2">
              <input
                type="number"
                min={1}
                value={cantidad}
                onChange={(e) => setCantidad(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-24 rounded-lg px-3 py-2 text-sm focus:outline-none" style={{ border: '1px solid rgba(58,125,68,0.25)', background: 'rgba(255,255,255,0.7)' }}
              />
              <button
                onClick={agregarAsignacion}
                disabled={!insumoSeleccionado}
                className="flex-1 rounded-lg px-3 py-2 text-sm text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-all" style={{ background: 'var(--verde)' }}
              >
                Agregar
              </button>
            </div>

            {/* Lista de asignaciones con opción de eliminar */}
            {(asignacionesPorBeneficiario[seleccionado] ?? []).length > 0 && (
              <div>
                <p className="text-xs uppercase tracking-wide mb-2" style={{ color: 'rgba(0,0,0,0.35)' }}>Eliminar del carrito</p>
                <ul className="space-y-1">
                  {(asignacionesPorBeneficiario[seleccionado] ?? []).map((a) => (
                    <li key={a.id} className="flex items-center justify-between text-xs text-gray-600 group">
                      <span>{a.insumos?.nombre} × {a.cantidad}</span>
                      <button
                        onClick={() => eliminarAsignacion(a.id)}
                        className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity ml-2"
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
