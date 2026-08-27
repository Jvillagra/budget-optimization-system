'use client'

import { useEffect, useState } from 'react'
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

/** Consolidado de compra (ex /vista-resumen), embebido ahora como sub-tab de
 * /rendicion -- ver app/rendicion/page.tsx. Se mantiene como componente
 * propio (no inline) porque también lo usa app/vista-resumen/page.tsx, que
 * queda como redirect para no romper enlaces guardados. */
export function VistaResumenContent() {
  const { proveedorId, isLoaded } = useProveedor()
  const [baseData, setBaseData] = useState<BaseData | null>(null)
  const [filas, setFilas] = useState<FilaConsolidado[]>([])
  const [sinCarrito, setSinCarrito] = useState<string[]>([])
  const [combinarPolines, setCombinarPolines] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/data')
        if (!res.ok) throw new Error('load failed')
        const { beneficiarios: bens, proveedores: provs, asignaciones: asigs, preciosProveedor: precs } = await res.json()
        setBaseData({
          beneficiarios: (bens as Beneficiario[]) ?? [],
          proveedores: (provs as Proveedor[]) ?? [],
          asignaciones: (asigs as Asignacion[]) ?? [],
          precios: (precs as PrecioProveedor[]) ?? [],
        })
      } catch {
        setLoadError(true)
        setLoading(false)
      }
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
  const poliFilas = filas.filter(f => f.nombre.startsWith('Polietileno'))
  const totalPolietileno = poliFilas.reduce((s, f) => s + f.cantidad, 0)
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

  if (loadError) {
    return (
      <div className="rounded-2xl p-8 glass text-center space-y-3">
        <p className="text-sm font-semibold" style={{ color: 'var(--cafe-dark)' }}>Error al cargar los datos</p>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Revisa tu conexión e intenta nuevamente.</p>
        <button
          onClick={() => window.location.reload()}
          className="text-sm font-semibold px-4 py-2 rounded-lg"
          style={{ background: 'var(--verde)', color: '#fff' }}
        >
          Reintentar
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>
            Consolidado de compra — ambos segmentos ({totalSocios} socios)
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Toggle polines */}
          <button
            onClick={() => setCombinarPolines(v => !v)}
            className="flex items-center gap-2 text-xs font-semibold"
            style={{ color: 'var(--verde-dark)' }}
          >
            <span>Combinar polines</span>
            <span
              className="relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-200"
              style={{ background: combinarPolines ? 'var(--verde)' : 'rgba(0,0,0,0.18)' }}
            >
              <span
                className="inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200"
                style={{
                  margin: '2px',
                  transform: combinarPolines ? 'translateX(16px)' : 'translateX(0)',
                }}
              />
            </span>
          </button>
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
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Selecciona un proveedor en la página de beneficiarios para ver el consolidado.
          </p>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICardMallas mallas={mallasFilas} total={totalRollosMalla} />
            <KPICardPolines filas={polinFilas} total={totalPolines} combinar={combinarPolines} />
            <KPICard label="Polietileno" value={totalPolietileno > 0 ? `${totalPolietileno} m` : '—'} />
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
              {/* Tarjetas -- mobile: la tabla de 5 columnas obligaba a texto
                  minúsculo o scroll horizontal. Cantidad/subtotal (lo que
                  importa para comprar) quedan grandes, precio unitario chico. */}
              <div className="sm:hidden divide-y" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
                {filas.map(f => {
                  const subtotal = f.precioUnitario ? f.cantidad * f.precioUnitario : null
                  return (
                    <div key={f.key} className="px-5 py-4">
                      <p className="text-base font-semibold flex items-center flex-wrap gap-1.5" style={{ color: '#1c1c1c' }}>
                        {f.nombre}
                        {f.tag && (
                          <span
                            className="text-xs font-semibold px-1.5 py-0.5 rounded"
                            style={f.tag === 'CP'
                              ? { background: 'var(--cafe-muted)', color: 'var(--cafe-dark)' }
                              : { background: 'var(--verde-muted)', color: 'var(--verde-dark)' }}
                          >
                            {f.tag}
                          </span>
                        )}
                      </p>
                      <div className="mt-1.5 flex items-baseline justify-between">
                        <span className="text-base" style={{ color: 'var(--text-muted)' }}>
                          {f.cantidad} {f.formato_venta}
                        </span>
                        <span className="text-base font-bold tabular-nums" style={{ color: subtotal ? 'var(--verde-dark)' : 'var(--text-muted)' }}>
                          {subtotal ? formatCLP(subtotal) : '—'}
                        </span>
                      </div>
                      <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {f.precioUnitario ? `${formatCLP(f.precioUnitario)} c/u` : <span style={{ color: 'var(--cafe)' }}>Sin precio</span>}
                      </p>
                    </div>
                  )
                })}
                {hayPrecios && (
                  <div className="px-5 py-4 flex items-center justify-between" style={{ background: 'rgba(58,125,68,0.06)' }}>
                    <p className="text-base font-bold" style={{ color: 'var(--verde-dark)' }}>Total comunidad</p>
                    <p className="text-base font-bold tabular-nums" style={{ color: 'var(--verde-dark)' }}>{formatCLP(totalGasto)}</p>
                  </div>
                )}
              </div>

              {/* Tabla -- desktop / tablet */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.06)', background: 'rgba(0,0,0,0.02)' }}>
                      {(['Insumo Específico', 'Cantidad', 'Unidad', 'Precio unit.', 'Subtotal'] as const).map((h, i) => (
                        <th
                          key={h}
                          className={`px-5 py-3 text-xs font-semibold uppercase tracking-wide ${i === 0 ? 'text-left' : 'text-right'}`}
                          style={{ color: 'var(--text-muted)' }}
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
                          <td className="px-5 py-3 text-right tabular-nums" style={{ color: 'var(--text-muted)' }}>
                            {f.cantidad}
                          </td>
                          <td className="px-5 py-3 text-right text-xs" style={{ color: 'var(--text-muted)' }}>
                            {f.formato_venta}
                          </td>
                          <td className="px-5 py-3 text-right tabular-nums" style={{ color: 'var(--text-muted)' }}>
                            {f.precioUnitario
                              ? formatCLP(f.precioUnitario)
                              : <span className="text-xs" style={{ color: 'var(--cafe)' }}>Sin precio</span>}
                          </td>
                          <td
                            className="px-5 py-3 text-right tabular-nums font-semibold"
                            style={{ color: subtotal ? 'var(--verde-dark)' : 'var(--text-muted)' }}
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
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
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
                  <li key={nombre} className="text-sm" style={{ color: 'var(--text-muted)' }}>
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
      <p className="text-sm font-medium uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>
        {label}
      </p>
      <p className="text-2xl font-bold" style={{ color: 'var(--verde-dark)' }}>{value}</p>
    </div>
  )
}

function KPICardMallas({ mallas, total }: { mallas: FilaConsolidado[]; total: number }) {
  return (
    <div className="rounded-2xl p-5 glass">
      <p className="text-sm font-medium uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>
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
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Sin datos</span>
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
      <p className="text-sm font-medium uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>
        Polines
      </p>
      {combinar ? (
        <p className="text-2xl font-bold" style={{ color: 'var(--verde-dark)' }}>{total}</p>
      ) : (
        <div className="space-y-1">
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-bold" style={{ color: 'var(--verde-dark)' }}>{cpTotal}</p>
            <span className="text-xs font-semibold px-1.5 py-0.5 rounded" style={{ background: 'var(--cafe-muted)', color: 'var(--cafe-dark)' }}>CP</span>
          </div>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-bold" style={{ color: 'var(--verde-dark)' }}>{invTotal || '—'}</p>
            <span className="text-xs font-semibold px-1.5 py-0.5 rounded" style={{ background: 'var(--verde-muted)', color: 'var(--verde-dark)' }}>INV</span>
          </div>
        </div>
      )}
    </div>
  )
}
