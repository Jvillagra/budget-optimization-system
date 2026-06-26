'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Beneficiario, Asignacion, Proveedor, PrecioProveedor } from '@/lib/types'
import { buildPrecioMap, formatCLP } from '@/lib/business-logic'
import { useProveedor } from '@/lib/proveedor-context'

interface FilaConsolidado {
  key: string
  insumo_id: string
  nombre: string
  cantidad: number
  precioUnitario: number | null
  formato_venta: string
  tag?: 'CP' | 'INV'  // solo presente en filas de polines cuando están separadas
}

interface BaseData {
  beneficiarios: Beneficiario[]
  proveedores: Proveedor[]
  asignaciones: Asignacion[]
  precios: PrecioProveedor[]
}

export default function VistaResumenPage() {
  const { proveedorId, isLoaded } = useProveedor()
  const [baseData, setBaseData] = useState<BaseData | null>(null)
  const [filas, setFilas] = useState<FilaConsolidado[]>([])
  const [sinCarrito, setSinCarrito] = useState<string[]>([])
  const [combinarPolines, setCombinarPolines] = useState(false)
  const [loading, setLoading] = useState(true)
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    async function load() {
      const [{ data: bens }, { data: provs }, { data: asigs }, { data: precs }] = await Promise.all([
        supabase.from('beneficiarios').select('*').order('segmento').order('nombre'),
        supabase.from('proveedores').select('*').eq('es_activo', true).order('nombre'),
        supabase.from('asignaciones').select('*, catalogo_insumos(*)'),
        supabase.from('precios_proveedor').select('*'),
      ])
      setBaseData({
        beneficiarios: (bens as Beneficiario[]) ?? [],
        proveedores: (provs as Proveedor[]) ?? [],
        asignaciones: (asigs as Asignacion[]) ?? [],
        precios: (precs as PrecioProveedor[]) ?? [],
      })
    }
    load()
  }, [])

  useEffect(() => {
    if (!baseData || !isLoaded) return
    setLoading(false)
    if (!proveedorId) return

    const { beneficiarios, asignaciones, precios } = baseData
    const precioMap = buildPrecioMap(precios)

    const cpIds = new Set(beneficiarios.filter(b => b.segmento === 'Cierre Perimetral').map(b => b.id))
    const invIds = new Set(beneficiarios.filter(b => b.segmento === 'Invernadero').map(b => b.id))

    const itemMap = new Map<string, FilaConsolidado>()

    for (const a of asignaciones) {
      const insumo = a.catalogo_insumos
      if (!insumo) continue

      const isCp = cpIds.has(a.beneficiario_id)
      const isInv = invIds.has(a.beneficiario_id)
      if (!isCp && !isInv) continue

      // CP: mallas (Cierre Perimetral/Ambos) + polines (Ambos). Excluir Invernadero.
      if (isCp && insumo.segmento === 'Invernadero') continue
      // INV: polietileno (Invernadero) + polines (Ambos). Excluir Cierre Perimetral.
      if (isInv && insumo.segmento === 'Cierre Perimetral') continue

      const isPolin = insumo.nombre.startsWith('Polines')
      const tag: 'CP' | 'INV' | undefined = isPolin && !combinarPolines
        ? (isCp ? 'CP' : 'INV')
        : undefined
      const key = isPolin && !combinarPolines
        ? `${a.insumo_id}_${isCp ? 'CP' : 'INV'}`
        : a.insumo_id

      const existing = itemMap.get(key)
      itemMap.set(key, {
        key,
        insumo_id: a.insumo_id,
        nombre: insumo.nombre,
        cantidad: (existing?.cantidad ?? 0) + a.cantidad,
        precioUnitario: precioMap.get(`${proveedorId}_${a.insumo_id}`) ?? null,
        formato_venta: insumo.formato_venta,
        tag,
      })
    }

    // Sort: mallas + polietileno primero (alfabético), polines al final (CP antes INV)
    const nuevasFilas = Array.from(itemMap.values()).sort((a, b) => {
      const aIsPolin = a.nombre.startsWith('Polines')
      const bIsPolin = b.nombre.startsWith('Polines')
      if (aIsPolin !== bIsPolin) return aIsPolin ? 1 : -1
      if (aIsPolin && bIsPolin && a.tag !== b.tag) {
        return a.tag === 'CP' ? -1 : 1
      }
      return a.nombre.localeCompare(b.nombre)
    })

    const allIds = new Set([...cpIds, ...invIds])
    const conItems = new Set(asignaciones.filter(a => allIds.has(a.beneficiario_id)).map(a => a.beneficiario_id))
    const sinItems = beneficiarios.filter(b => allIds.has(b.id) && !conItems.has(b.id)).map(b => b.nombre)

    setFilas(nuevasFilas)
    setSinCarrito(sinItems)
  }, [baseData, proveedorId, isLoaded, combinarPolines])

  const proveedor = baseData?.proveedores.find(p => p.id === proveedorId)
  const totalSocios = baseData?.beneficiarios.length ?? 0
  const mallasFilas = filas.filter(f => f.nombre.startsWith('Malla'))
  const totalRollosMalla = mallasFilas.reduce((s, f) => s + f.cantidad, 0)
  const polinFilas = filas.filter(f => f.nombre.startsWith('Polines'))
  const totalPolines = polinFilas.reduce((s, f) => s + f.cantidad, 0)
  const totalGasto = filas.reduce((s, f) => f.precioUnitario ? s + f.cantidad * f.precioUnitario : s, 0)
  const hayPrecios = filas.some(f => f.precioUnitario !== null)

  function copiar() {
    const lines = [
      'COTIZACIÓN CONSOLIDADA — COMUNIDAD PEDRO HUISCA',
      `Proveedor: ${proveedor?.nombre ?? '—'}`,
      `Fecha: ${new Date().toLocaleDateString('es-CL')}`,
      '',
      'INSUMO\t\tSEGMENTO\tCANTIDAD\tUNIDAD\tPRECIO UNITARIO\tSUBTOTAL',
      ...filas.map(f => {
        const subtotal = f.precioUnitario ? f.cantidad * f.precioUnitario : null
        const seg = f.tag ?? ''
        return `${f.nombre}\t${seg}\t${f.cantidad}\t${f.formato_venta}\t${f.precioUnitario ? formatCLP(f.precioUnitario) : '—'}\t${subtotal ? formatCLP(subtotal) : '—'}`
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
            Consolidado de compra — ambos segmentos ({totalSocios} socios)
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Toggle polines */}
          <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid rgba(58,125,68,0.25)' }}>
            <button
              onClick={() => setCombinarPolines(false)}
              className="px-3 py-1.5 text-xs font-semibold transition-all"
              style={!combinarPolines
                ? { background: 'var(--verde)', color: '#fff' }
                : { background: 'transparent', color: 'var(--verde-dark)' }}
            >
              Polines separados
            </button>
            <button
              onClick={() => setCombinarPolines(true)}
              className="px-3 py-1.5 text-xs font-semibold transition-all"
              style={combinarPolines
                ? { background: 'var(--verde)', color: '#fff' }
                : { background: 'transparent', color: 'var(--verde-dark)' }}
            >
              Combinar polines
            </button>
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
            <KPICardPolines filas={polinFilas} total={totalPolines} combinar={combinarPolines} />
            <KPICard label="Gasto total estimado" value={hayPrecios ? formatCLP(totalGasto) : '—'} />
          </div>

          {/* Tabla consolidada */}
          {filas.length > 0 ? (
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
                  {copiado ? '✓ Copiado' : 'Copiar cotización'}
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
                          key={f.key}
                          style={{ borderBottom: idx < filas.length - 1 ? '1px solid rgba(0,0,0,0.04)' : 'none' }}
                        >
                          <td className="px-5 py-3 font-medium" style={{ color: '#1c1c1c' }}>
                            {f.nombre}
                            {f.tag && (
                              <span
                                className="ml-2 text-xs font-semibold px-1.5 py-0.5 rounded"
                                style={f.tag === 'CP'
                                  ? { background: 'var(--cafe-muted)', color: 'var(--cafe-dark)' }
                                  : { background: 'var(--verde-muted)', color: 'var(--verde-dark)' }}
                              >
                                {f.tag}
                              </span>
                            )}
                          </td>
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
                        <td className="px-5 py-3 font-bold text-sm" style={{ color: 'var(--verde-dark)' }} colSpan={4}>
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
          ) : (
            <div className="rounded-2xl p-8 glass text-center">
              <p className="text-sm" style={{ color: 'rgba(0,0,0,0.45)' }}>
                Ningún beneficiario tiene ítems en carrito aún.
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
        Total de mallas requeridas
      </p>
      <p className="text-2xl font-bold mb-3" style={{ color: 'var(--verde-dark)' }}>
        {total} rollos
      </p>
      <div className="flex flex-wrap gap-1.5">
        {mallas.map(m => (
          <span
            key={m.key}
            className="text-xs font-semibold px-2 py-1 rounded-full"
            style={{ background: 'rgba(58,125,68,0.1)', color: 'var(--verde-dark)' }}
          >
            {m.cantidad}× {m.nombre.replace('Malla ', '')}
          </span>
        ))}
        {mallas.length === 0 && (
          <span className="text-xs" style={{ color: 'rgba(0,0,0,0.35)' }}>Sin datos</span>
        )}
      </div>
    </div>
  )
}

function KPICardPolines({ filas, total, combinar }: { filas: FilaConsolidado[]; total: number; combinar: boolean }) {
  const cpTotal = filas.filter(f => f.tag === 'CP').reduce((s, f) => s + f.cantidad, 0)
  const invTotal = filas.filter(f => f.tag === 'INV').reduce((s, f) => s + f.cantidad, 0)

  return (
    <div className="rounded-2xl p-5 glass">
      <p className="text-xs font-medium uppercase tracking-wide mb-1" style={{ color: 'rgba(0,0,0,0.4)' }}>
        Polines
      </p>
      <p className="text-2xl font-bold" style={{ color: 'var(--verde-dark)' }}>{total}</p>
      {!combinar && total > 0 && (
        <div className="mt-2 space-y-0.5">
          {cpTotal > 0 && (
            <p className="text-xs" style={{ color: 'rgba(0,0,0,0.45)' }}>
              Cierre Perimetral: {cpTotal}
            </p>
          )}
          {invTotal > 0 && (
            <p className="text-xs" style={{ color: 'rgba(0,0,0,0.45)' }}>
              Invernadero: {invTotal}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
