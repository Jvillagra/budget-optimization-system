'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Beneficiario, CatalogoInsumo, AyudaMemoria, Proveedor, PrecioProveedor } from '@/lib/types'
import { buildPrecioMap, simularBeneficiario, formatCLP } from '@/lib/business-logic'
import { useProveedor } from '@/lib/proveedor-context'

interface FilaConsolidado {
  insumo_id: string
  nombre: string
  cantidad: number
  precioUnitario: number | null
  formato_venta: string
}

interface BaseData {
  beneficiarios: Beneficiario[]
  insumos: CatalogoInsumo[]
  proveedores: Proveedor[]
  ayudaMap: Record<string, AyudaMemoria[]>
  precios: PrecioProveedor[]
}

export default function VistaResumenPage() {
  const { proveedorId, isLoaded } = useProveedor()
  const [baseData, setBaseData] = useState<BaseData | null>(null)
  const [filas, setFilas] = useState<FilaConsolidado[]>([])
  const [errores, setErrores] = useState<{ nombre: string; motivo: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [copiado, setCopiado] = useState(false)

  // Fetch base data once
  useEffect(() => {
    async function load() {
      const [{ data: bens }, { data: ins }, { data: provs }, { data: ams }, { data: precs }] = await Promise.all([
        supabase.from('beneficiarios').select('*').eq('segmento', 'Cierre Perimetral').order('nombre'),
        supabase.from('catalogo_insumos').select('*'),
        supabase.from('proveedores').select('*').eq('es_activo', true).order('nombre'),
        supabase.from('ayuda_memoria').select('*, catalogo_insumos(*)'),
        supabase.from('precios_proveedor').select('*'),
      ])

      const ayudaMap: Record<string, AyudaMemoria[]> = {}
      for (const am of (ams as AyudaMemoria[]) ?? []) {
        if (!ayudaMap[am.beneficiario_id]) ayudaMap[am.beneficiario_id] = []
        ayudaMap[am.beneficiario_id].push(am)
      }

      setBaseData({
        beneficiarios: (bens as Beneficiario[]) ?? [],
        insumos: (ins as CatalogoInsumo[]) ?? [],
        proveedores: (provs as Proveedor[]) ?? [],
        ayudaMap,
        precios: (precs as PrecioProveedor[]) ?? [],
      })
    }
    load()
  }, [])

  // Recompute aggregation when proveedor or base data changes
  useEffect(() => {
    if (!baseData || !isLoaded) return
    setLoading(false)
    if (!proveedorId) return

    const { beneficiarios, insumos, ayudaMap, precios } = baseData
    const precioMap = buildPrecioMap(precios)
    const polinInsumo = insumos.find(i => i.nombre === 'Polines (3 a 4 cm)')

    const mallaMap = new Map<string, { nombre: string; cantidad: number; insumo_id: string }>()
    let totalPolines = 0
    const nuevosErrores: { nombre: string; motivo: string }[] = []

    for (const ben of beneficiarios) {
      const result = simularBeneficiario(ben, proveedorId, precioMap, insumos, ayudaMap[ben.id] ?? [])
      if (result.error) {
        nuevosErrores.push({ nombre: ben.nombre, motivo: result.error })
      } else {
        totalPolines += result.polines
        if (result.insumo_base_id) {
          const existing = mallaMap.get(result.insumo_base_id)
          mallaMap.set(result.insumo_base_id, {
            nombre: result.insumo_base_nombre!,
            cantidad: (existing?.cantidad ?? 0) + result.insumo_base_cantidad,
            insumo_id: result.insumo_base_id,
          })
        }
      }
    }

    const nuevasFilas: FilaConsolidado[] = []
    const mallasArr = Array.from(mallaMap.values()).sort((a, b) => a.nombre.localeCompare(b.nombre))
    for (const m of mallasArr) {
      const insumo = insumos.find(i => i.id === m.insumo_id)
      nuevasFilas.push({
        insumo_id: m.insumo_id,
        nombre: m.nombre,
        cantidad: m.cantidad,
        precioUnitario: precioMap.get(`${proveedorId}_${m.insumo_id}`) ?? null,
        formato_venta: insumo?.formato_venta ?? '—',
      })
    }
    if (totalPolines > 0 && polinInsumo) {
      nuevasFilas.push({
        insumo_id: polinInsumo.id,
        nombre: polinInsumo.nombre,
        cantidad: totalPolines,
        precioUnitario: precioMap.get(`${proveedorId}_${polinInsumo.id}`) ?? null,
        formato_venta: polinInsumo.formato_venta,
      })
    }

    setFilas(nuevasFilas)
    setErrores(nuevosErrores)
  }, [baseData, proveedorId, isLoaded])

  const proveedor = baseData?.proveedores.find(p => p.id === proveedorId)
  const totalRollosMalla = filas.filter(f => !f.nombre.startsWith('Polines')).reduce((s, f) => s + f.cantidad, 0)
  const totalPolines = filas.find(f => f.nombre.startsWith('Polines'))?.cantidad ?? 0
  const totalGasto = filas.reduce((s, f) => f.precioUnitario ? s + f.cantidad * f.precioUnitario : s, 0)
  const hayPrecios = filas.some(f => f.precioUnitario !== null)

  function copiar() {
    const lines = [
      'COTIZACIÓN CONSOLIDADA — COMUNIDAD PEDRO HUISCA',
      `Proveedor: ${proveedor?.nombre ?? '—'}`,
      `Fecha: ${new Date().toLocaleDateString('es-CL')}`,
      '',
      'INSUMO\t\tCANTIDAD\tUNIDAD\tPRECIO UNITARIO\tSUBTOTAL',
      ...filas.map(f => {
        const subtotal = f.precioUnitario ? f.cantidad * f.precioUnitario : null
        return `${f.nombre}\t${f.cantidad}\t${f.formato_venta}\t${f.precioUnitario ? formatCLP(f.precioUnitario) : '—'}\t${subtotal ? formatCLP(subtotal) : '—'}`
      }),
      '',
      `TOTAL COMUNIDAD: ${hayPrecios ? formatCLP(totalGasto) : '—'}`,
    ]
    navigator.clipboard.writeText(lines.join('\n'))
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-24 rounded-2xl animate-pulse" style={{ background: 'rgba(255,255,255,0.4)' }} />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold" style={{ color: 'var(--verde-dark)' }}>
            Vista Resumen
          </h1>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(0,0,0,0.4)' }}>
            Consolidado de compra — Cierre Perimetral (20 socios)
          </p>
        </div>
        {proveedor && (
          <span className="text-xs font-semibold px-3 py-1.5 rounded-full" style={{
            background: 'var(--verde-muted)',
            color: 'var(--verde-dark)',
            border: '1px solid rgba(58,125,68,0.2)',
          }}>
            {proveedor.nombre}
          </span>
        )}
      </div>

      {!proveedorId ? (
        <div className="rounded-2xl p-8 glass text-center">
          <p className="text-sm" style={{ color: 'rgba(0,0,0,0.45)' }}>
            Selecciona un proveedor en la página de beneficiarios para ver el consolidado.
          </p>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <KPICardMallas mallas={filas.filter(f => !f.nombre.startsWith('Polines'))} total={totalRollosMalla} />
            <KPICard label="Polines" value={totalPolines.toLocaleString('es-CL')} />
            <KPICard label="Gasto total estimado" value={hayPrecios ? formatCLP(totalGasto) : '—'} />
          </div>

          {/* Tabla consolidada */}
          {filas.length > 0 && (
            <div className="rounded-2xl glass overflow-hidden">
              <div
                className="px-5 py-4 flex items-center justify-between"
                style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}
              >
                <p className="text-sm font-bold" style={{ color: 'var(--verde-dark)' }}>
                  Consolidado de insumos
                </p>
                <button
                  onClick={copiar}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
                  style={copiado ? {
                    background: 'var(--verde)', color: '#fff',
                  } : {
                    background: 'rgba(58,125,68,0.1)',
                    color: 'var(--verde-dark)',
                    border: '1px solid rgba(58,125,68,0.2)',
                  }}
                >
                  {copiado ? '✓ Copiado' : 'Copiar al portapapeles'}
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.06)', background: 'rgba(0,0,0,0.02)' }}>
                      {(['Insumo Específico', 'Cantidad', 'Unidad', 'Precio unit.', 'Subtotal'] as const).map((h, i) => (
                        <th
                          key={h}
                          className={`px-5 py-3 text-xs font-semibold uppercase tracking-wide ${i === 0 ? 'text-left' : 'text-right'}`}
                          style={{ color: 'rgba(0,0,0,0.4)' }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((f, idx) => {
                      const subtotal = f.precioUnitario ? f.cantidad * f.precioUnitario : null
                      return (
                        <tr
                          key={f.insumo_id}
                          style={{ borderBottom: idx < filas.length - 1 ? '1px solid rgba(0,0,0,0.04)' : 'none' }}
                        >
                          <td className="px-5 py-3 font-medium" style={{ color: '#1c1c1c' }}>{f.nombre}</td>
                          <td className="px-5 py-3 text-right tabular-nums" style={{ color: 'rgba(0,0,0,0.7)' }}>
                            {f.cantidad}
                          </td>
                          <td className="px-5 py-3 text-right text-xs" style={{ color: 'rgba(0,0,0,0.45)' }}>
                            {f.formato_venta}
                          </td>
                          <td className="px-5 py-3 text-right tabular-nums" style={{ color: 'rgba(0,0,0,0.5)' }}>
                            {f.precioUnitario
                              ? formatCLP(f.precioUnitario)
                              : <span className="text-xs" style={{ color: 'var(--cafe)' }}>Sin precio</span>}
                          </td>
                          <td
                            className="px-5 py-3 text-right tabular-nums font-semibold"
                            style={{ color: subtotal ? 'var(--verde-dark)' : 'rgba(0,0,0,0.3)' }}
                          >
                            {subtotal ? formatCLP(subtotal) : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  {hayPrecios && (
                    <tfoot>
                      <tr style={{ background: 'rgba(58,125,68,0.06)', borderTop: '1px solid rgba(58,125,68,0.15)' }}>
                        <td
                          className="px-5 py-3 font-bold text-sm"
                          style={{ color: 'var(--verde-dark)' }}
                          colSpan={4}
                        >
                          Total comunidad
                        </td>
                        <td className="px-5 py-3 text-right font-bold text-sm" style={{ color: 'var(--verde-dark)' }}>
                          {formatCLP(totalGasto)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}

          {/* Socios con errores */}
          {errores.length > 0 && (
            <div
              className="rounded-2xl p-4"
              style={{ background: 'rgba(127,79,36,0.06)', border: '1px solid rgba(127,79,36,0.15)' }}
            >
              <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--cafe)' }}>
                {errores.length} socio{errores.length !== 1 ? 's' : ''} sin precio cotizado
              </p>
              <ul className="space-y-0.5">
                {errores.map(e => (
                  <li key={e.nombre} className="text-xs" style={{ color: 'rgba(0,0,0,0.55)' }}>
                    · {e.nombre} — {e.motivo}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function KPICard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl p-5 glass">
      <p className="text-xs font-medium uppercase tracking-wide mb-1" style={{ color: 'rgba(0,0,0,0.4)' }}>
        {label}
      </p>
      <p className="text-2xl font-bold" style={{ color: 'var(--verde-dark)' }}>{value}</p>
    </div>
  )
}

function KPICardMallas({ mallas, total }: { mallas: FilaConsolidado[]; total: number }) {
  return (
    <div className="rounded-2xl p-5 glass">
      <p className="text-xs font-medium uppercase tracking-wide mb-1" style={{ color: 'rgba(0,0,0,0.4)' }}>
        Total de Mallas Requeridas
      </p>
      <p className="text-2xl font-bold mb-3" style={{ color: 'var(--verde-dark)' }}>
        {total} rollos
      </p>
      <div className="flex flex-wrap gap-1.5">
        {mallas.map(m => (
          <span
            key={m.insumo_id}
            className="text-xs font-semibold px-2 py-1 rounded-full"
            style={{ background: 'rgba(58,125,68,0.1)', color: 'var(--verde-dark)' }}
          >
            {m.cantidad}× {m.nombre.replace('Malla ', '')}
          </span>
        ))}
      </div>
    </div>
  )
}
