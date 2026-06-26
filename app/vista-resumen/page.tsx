'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Beneficiario, CatalogoInsumo, Asignacion, Proveedor, PrecioProveedor } from '@/lib/types'
import { buildPrecioMap, formatCLP } from '@/lib/business-logic'
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
  asignaciones: Asignacion[]
  precios: PrecioProveedor[]
}

export default function VistaResumenPage() {
  const { proveedorId, isLoaded } = useProveedor()
  const [baseData, setBaseData] = useState<BaseData | null>(null)
  const [filas, setFilas] = useState<FilaConsolidado[]>([])
  const [sinCarrito, setSinCarrito] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [copiado, setCopiado] = useState(false)

  // Fetch base data once
  useEffect(() => {
    async function load() {
      const [{ data: bens }, { data: ins }, { data: provs }, { data: asigs }, { data: precs }] = await Promise.all([
        supabase.from('beneficiarios').select('*').eq('segmento', 'Cierre Perimetral').order('nombre'),
        supabase.from('catalogo_insumos').select('*'),
        supabase.from('proveedores').select('*').eq('es_activo', true).order('nombre'),
        supabase.from('asignaciones').select('*, catalogo_insumos(*)'),
        supabase.from('precios_proveedor').select('*'),
      ])

      setBaseData({
        beneficiarios: (bens as Beneficiario[]) ?? [],
        insumos: (ins as CatalogoInsumo[]) ?? [],
        proveedores: (provs as Proveedor[]) ?? [],
        asignaciones: (asigs as Asignacion[]) ?? [],
        precios: (precs as PrecioProveedor[]) ?? [],
      })
    }
    load()
  }, [])

  // Recompute when proveedor or base data changes
  useEffect(() => {
    if (!baseData || !isLoaded) return
    setLoading(false)
    if (!proveedorId) return

    const { beneficiarios, asignaciones, precios } = baseData
    const precioMap = buildPrecioMap(precios)

    // Filter asignaciones to CP socios only
    const cpIds = new Set(beneficiarios.map(b => b.id))
    const cpAsigs = asignaciones.filter(a => cpIds.has(a.beneficiario_id))

    // Aggregate by insumo — exclude Invernadero-only items (polietileno)
    const itemMap = new Map<string, FilaConsolidado>()
    for (const a of cpAsigs) {
      const insumo = a.catalogo_insumos
      if (!insumo || insumo.segmento === 'Invernadero') continue
      const existing = itemMap.get(a.insumo_id)
      itemMap.set(a.insumo_id, {
        insumo_id: a.insumo_id,
        nombre: insumo.nombre,
        cantidad: (existing?.cantidad ?? 0) + a.cantidad,
        precioUnitario: precioMap.get(`${proveedorId}_${a.insumo_id}`) ?? null,
        formato_venta: insumo.formato_venta,
      })
    }

    // Sort: mallas first (alphabetical), polines last
    const nuevasFilas = Array.from(itemMap.values()).sort((a, b) => {
      const aIsPolin = a.nombre.startsWith('Polines')
      const bIsPolin = b.nombre.startsWith('Polines')
      if (aIsPolin !== bIsPolin) return aIsPolin ? 1 : -1
      return a.nombre.localeCompare(b.nombre)
    })

    // Socios without any cart items
    const cpConItems = new Set(cpAsigs.map(a => a.beneficiario_id))
    const sinItems = beneficiarios.filter(b => !cpConItems.has(b.id)).map(b => b.nombre)

    setFilas(nuevasFilas)
    setSinCarrito(sinItems)
  }, [baseData, proveedorId, isLoaded])

  const proveedor = baseData?.proveedores.find(p => p.id === proveedorId)
  const mallasFilas = filas.filter(f => !f.nombre.startsWith('Polines'))
  const totalRollosMalla = mallasFilas.reduce((s, f) => s + f.cantidad, 0)
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
            <KPICardMallas mallas={mallasFilas} total={totalRollosMalla} />
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

          {filas.length === 0 && (
            <div className="rounded-2xl p-8 glass text-center">
              <p className="text-sm" style={{ color: 'rgba(0,0,0,0.45)' }}>
                Ningún socio de Cierre Perimetral tiene ítems en carrito aún.
              </p>
            </div>
          )}

          {/* Socios sin ítems en carrito */}
          {sinCarrito.length > 0 && (
            <div
              className="rounded-2xl p-4"
              style={{ background: 'rgba(127,79,36,0.06)', border: '1px solid rgba(127,79,36,0.15)' }}
            >
              <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--cafe)' }}>
                {sinCarrito.length} socio{sinCarrito.length !== 1 ? 's' : ''} sin ítems en carrito
              </p>
              <ul className="space-y-0.5">
                {sinCarrito.map(nombre => (
                  <li key={nombre} className="text-xs" style={{ color: 'rgba(0,0,0,0.55)' }}>
                    · {nombre}
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
