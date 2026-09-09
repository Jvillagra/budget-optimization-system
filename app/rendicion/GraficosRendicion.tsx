'use client'

import { useMemo } from 'react'
import { formatCLP } from '@/lib/business-logic'
import { FOTOS_REQUERIDAS } from '@/lib/constants'

// Panel de control de /rendicion. Todo es SVG/CSS puro a propósito: esta es
// la ruta que el staff abre en celulares de terreno y recharts costaba
// ~100KB de JS (ver el comentario de ProgresoDonut). Los datos ya vienen
// resueltos en las filas; acá solo se agregan y se dibujan.

export type FilaGrafico = {
  id: string
  segmento: string
  presupuestoBase: number
  proveedorCompraId: string | null
  proveedorCompraNombre: string | null
  total: number
  totalEsCompleto: boolean
  fotosCount: number
  compraCompleta: boolean
}

/** Etapa del socio en el flujo de rendición. Es lo que el staff necesita
 *  para decidir a quién llamar hoy: sin fotos = hay que ir a terreno;
 *  faltan = pedir las que faltan; listo = solo falta marcar. */
export type EstadoSocio = 'completo' | 'listo' | 'faltan' | 'sin_fotos'

export function estadoDe(f: { compraCompleta: boolean; fotosCount: number }): EstadoSocio {
  if (f.compraCompleta) return 'completo'
  if (f.fotosCount >= FOTOS_REQUERIDAS) return 'listo'
  if (f.fotosCount > 0) return 'faltan'
  return 'sin_fotos'
}

// Orden fijo: de más avanzado a menos. El color sigue al estado, nunca a la
// posición, así el filtro no repinta nada.
export const ESTADOS: { id: EstadoSocio; label: string; color: string; ink: string }[] = [
  { id: 'completo', label: 'Completos', color: 'var(--verde-dark)', ink: 'var(--verde-dark)' },
  { id: 'listo', label: 'Listos para marcar', color: 'var(--verde-light)', ink: 'var(--verde-dark)' },
  { id: 'faltan', label: 'Faltan fotos', color: 'var(--marca-calida)', ink: 'var(--cafe-dark)' },
  { id: 'sin_fotos', label: 'Sin fotos', color: 'var(--linea-fuerte)', ink: 'var(--text-muted)' },
]

const SEG_COLOR: Record<string, string> = {
  'Invernadero': 'var(--verde-dark)',
  'Cierre Perimetral': 'var(--cafe-dark)',
}

/** Donut de avance. Antes esto eran recharts (PieChart + ResponsiveContainer)
 *  para dibujar dos segmentos de 72px: ~100KB de JS en la ruta más usada del
 *  staff, en celulares de terreno. Un <circle> con strokeDasharray hace lo
 *  mismo sin dependencia. recharts sigue en /simulador y /mi-dashboard, que
 *  sí dibujan gráficos de verdad. */
function ProgresoDonut({ pct }: { pct: number }) {
  const r = 28
  const circunferencia = 2 * Math.PI * r
  const avance = (Math.max(0, Math.min(100, pct)) / 100) * circunferencia
  return (
    <svg width={72} height={72} viewBox="0 0 72 72" className="shrink-0" role="img" aria-label={`${Math.round(pct)}% completo`}>
      <circle cx="36" cy="36" r={r} fill="none" stroke="var(--linea)" strokeWidth="10" />
      {avance > 0 && (
        <circle
          cx="36" cy="36" r={r} fill="none"
          stroke="var(--verde)" strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${avance} ${circunferencia}`}
          transform="rotate(-90 36 36)"
          className="motion-safe:transition-[stroke-dasharray] motion-safe:duration-500 motion-safe:ease-out"
        />
      )}
    </svg>
  )
}

/** Barra apilada horizontal. Cada segmento lleva 2px de aire para que se
 *  lean como partes distintas aunque dos tonos queden pegados. */
function BarraApilada({ partes, alto = 14, label }: {
  partes: { valor: number; color: string; nombre: string; onClick?: () => void; activo?: boolean }[]
  alto?: number
  label: string
}) {
  const total = partes.reduce((s, p) => s + p.valor, 0)
  const visibles = partes.filter(p => p.valor > 0)
  return (
    <div
      role="img"
      aria-label={label}
      className="flex w-full overflow-hidden rounded-full"
      style={{ height: alto, background: total === 0 ? 'var(--linea)' : 'transparent', gap: 2 }}
    >
      {visibles.map(p => {
        const Tag = p.onClick ? 'button' : 'div'
        return (
          <Tag
            key={p.nombre}
            type={p.onClick ? 'button' : undefined}
            onClick={p.onClick}
            aria-label={p.onClick ? `${p.nombre}: ${p.valor}` : undefined}
            title={`${p.nombre}: ${p.valor}`}
            className="h-full motion-safe:transition-[flex-basis,opacity] motion-safe:duration-300 motion-safe:ease-out"
            style={{
              flex: `${p.valor} 1 0%`,
              background: p.color,
              opacity: p.activo === false ? 0.35 : 1,
              minWidth: 6,
              borderRadius: 999,
            }}
          />
        )
      })}
    </div>
  )
}

/** Una cifra de los totales. `destacado` la usa el total cotizado, que es la
 *  referencia contra la que se leen las otras dos. */
function TotalCelda({ etiqueta, monto, detalle, color, destacado = false }: {
  etiqueta: string
  monto: number
  detalle: string
  color: string
  destacado?: boolean
}) {
  return (
    <div className="p-3.5" style={{ background: destacado ? 'var(--papel-hueco)' : 'var(--papel)' }}>
      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{etiqueta}</p>
      <p className="text-xl sm:text-2xl font-bold leading-tight tabular-nums mt-0.5" style={{ color }}>
        {formatCLP(monto)}
      </p>
      <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{detalle}</p>
    </div>
  )
}

function Tarjeta({ titulo, children, className = '' }: { titulo: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-[6px] p-3.5 space-y-2.5 ${className}`} style={{ background: 'var(--papel)' }}>
      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{titulo}</p>
      {children}
    </div>
  )
}

function BarraFila({ nombre, valor, max, color, detalle }: { nombre: string; valor: number; max: number; color: string; detalle: string }) {
  const pct = max > 0 ? (valor / max) * 100 : 0
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold truncate" style={{ color: 'var(--tinta)' }}>{nombre}</p>
        <p className="text-sm shrink-0 tabular-nums" style={{ color: 'var(--text-muted)' }}>{detalle}</p>
      </div>
      <div className="h-2 mt-1 rounded-full overflow-hidden" style={{ background: 'var(--linea)' }}>
        <div className="h-full rounded-full motion-safe:transition-[width] motion-safe:duration-300 motion-safe:ease-out" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

/** Panel de control completo. `filtro` / `onFiltro` conectan el gráfico de
 *  estados con la lista: tocar un segmento o un chip filtra los socios de
 *  abajo, que es la forma de pasar de "ver" a "actuar" sin scrollear. */
export function PanelControl({ filas, filtro, onFiltro }: {
  filas: FilaGrafico[]
  filtro: EstadoSocio | null
  onFiltro: (e: EstadoSocio | null) => void
}) {
  const d = useMemo(() => {
    const porEstado: Record<EstadoSocio, number> = { completo: 0, listo: 0, faltan: 0, sin_fotos: 0 }
    const porSegmento: Record<string, { total: number; completos: number; monto: number; montoRendido: number }> = {}
    let cotizado = 0, rendido = 0, parciales = 0

    for (const f of filas) {
      porEstado[estadoDe(f)]++
      cotizado += f.total
      if (!f.totalEsCompleto) parciales++
      if (f.compraCompleta) rendido += f.total
      const seg = porSegmento[f.segmento] ?? (porSegmento[f.segmento] = { total: 0, completos: 0, monto: 0, montoRendido: 0 })
      seg.total++
      seg.monto += f.total
      if (f.compraCompleta) { seg.completos++; seg.montoRendido += f.total }
    }

    return {
      porEstado, porSegmento, parciales,
      cotizado, rendido, porRendir: cotizado - rendido,
      total: filas.length, completos: porEstado.completo,
    }
  }, [filas])

  const pct = d.total > 0 ? (d.completos / d.total) * 100 : 0
  const pctRendido = d.cotizado > 0 ? (d.rendido / d.cotizado) * 100 : 0

  function toggle(e: EstadoSocio) { onFiltro(filtro === e ? null : e) }

  return (
    <div className="space-y-3">
      {/* 1. Avance + estado por etapa. La barra apilada y los chips son el
          mismo dato: los chips le ponen número y nombre a cada color (nunca
          color solo) y sirven de filtro. */}
      <div className="rounded-[6px] p-3.5 space-y-3" style={{ background: 'var(--papel)' }}>
        <div className="flex items-center gap-4">
          <ProgresoDonut pct={pct} />
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
              Avance de rendición
            </p>
            <p className="text-2xl font-bold leading-tight tabular-nums" style={{ color: 'var(--tinta)' }}>
              {d.completos} <span className="text-base font-semibold" style={{ color: 'var(--text-muted)' }}>de {d.total} socios</span>
            </p>
            <p className="text-sm font-semibold" style={{ color: 'var(--verde-dark)' }}>{pct.toFixed(0)}% completo</p>
          </div>
        </div>

        <BarraApilada
          label={`Socios por etapa: ${ESTADOS.map(e => `${e.label} ${d.porEstado[e.id]}`).join(', ')}`}
          partes={ESTADOS.map(e => ({
            nombre: e.label,
            valor: d.porEstado[e.id],
            color: e.color,
            onClick: () => toggle(e.id),
            activo: filtro === null || filtro === e.id,
          }))}
        />

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          {ESTADOS.map(e => {
            const activo = filtro === e.id
            const apagado = filtro !== null && !activo
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => toggle(e.id)}
                aria-pressed={activo}
                className="flex items-center gap-2 rounded-[4px] px-2.5 py-2 text-left transition-all active:scale-[0.98]"
                style={{
                  background: activo ? 'var(--papel-hueco)' : 'var(--papel-hueco)',
                  boxShadow: activo ? 'inset 0 0 0 1.5px var(--verde)' : 'none',
                  opacity: apagado ? 0.55 : 1,
                }}
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: e.color }} aria-hidden />
                <span className="text-lg font-bold tabular-nums leading-none" style={{ color: e.ink }}>{d.porEstado[e.id]}</span>
                <span className="text-xs font-medium leading-tight" style={{ color: 'var(--text-muted)' }}>{e.label}</span>
              </button>
            )
          })}
        </div>
        {filtro !== null && (
          <button
            type="button"
            onClick={() => onFiltro(null)}
            className="text-xs font-semibold underline underline-offset-2"
            style={{ color: 'var(--verde-dark)' }}
          >
            Ver todos los socios
          </button>
        )}
      </div>

      {/* 2. Plata: barra rendido/por rendir sobre el total cotizado, y las
          tres cifras que se reportan hacia afuera. */}
      <div className="rounded-[6px] overflow-hidden" style={{ background: 'var(--linea)' }}>
        <div className="p-3.5 pb-3 space-y-1.5" style={{ background: 'var(--papel)' }}>
          <div className="flex items-baseline justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Plata rendida</p>
            <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--verde-dark)' }}>{pctRendido.toFixed(0)}%</p>
          </div>
          <BarraApilada
            alto={10}
            label={`Rendido ${formatCLP(d.rendido)} de ${formatCLP(d.cotizado)} cotizados`}
            partes={[
              { nombre: 'Rendido', valor: d.rendido, color: 'var(--verde-dark)' },
              { nombre: 'Por rendir', valor: Math.max(0, d.porRendir), color: 'rgba(92,53,25,0.35)' },
            ]}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-px" style={{ borderTop: '1px solid var(--linea)' }}>
          <TotalCelda etiqueta="Total cotizado" monto={d.cotizado} detalle={`${d.total} socios`} color="var(--tinta)" destacado />
          <TotalCelda etiqueta="Rendido" monto={d.rendido} detalle={`${d.completos} socio${d.completos === 1 ? '' : 's'} con compra completa`} color="var(--verde-dark)" />
          <TotalCelda etiqueta="Por rendir" monto={d.porRendir} detalle={`${d.total - d.completos} socio${d.total - d.completos === 1 ? '' : 's'} pendiente${d.total - d.completos === 1 ? '' : 's'}`} color="var(--cafe-dark)" />
        </div>
      </div>

      {d.parciales > 0 && (
        <p className="text-xs px-1" style={{ color: 'var(--cafe-dark)' }}>
          * {d.parciales} socio{d.parciales === 1 ? '' : 's'} con total parcial
          (ítems sin precio o sin carrito): no están sumados completos acá.
        </p>
      )}

      {/* 3. Avance por proyecto. Antes acá había un carrusel de tres tarjetas:
          "Presupuesto" y "Proveedor de compra" se sacaron (2026-09-09) porque
          duplicaban lo que ya dicen /precios y el detalle de cada socio, y
          competían con el dato que sí se mira desde acá. */}
      <Tarjeta titulo="Por segmento">
        {Object.entries(d.porSegmento).map(([seg, s]) => (
          <BarraFila
            key={seg}
            nombre={seg}
            valor={s.completos}
            max={s.total}
            color={SEG_COLOR[seg] ?? 'var(--marca-calida)'}
            detalle={`${s.completos}/${s.total}`}
          />
        ))}
        {Object.entries(d.porSegmento).map(([seg, s]) => (
          <p key={`${seg}-plata`} className="text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
            <span className="font-semibold" style={{ color: SEG_COLOR[seg] ?? 'var(--marca-calida)' }}>{seg}</span>
            {' '}{formatCLP(s.montoRendido)} / {formatCLP(s.monto)}
          </p>
        ))}
    </Tarjeta>
    </div>
  )
}
