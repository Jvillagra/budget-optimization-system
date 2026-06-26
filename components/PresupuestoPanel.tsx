'use client'

import type { ResumenPresupuesto } from '@/lib/types'
import { formatCLP } from '@/lib/business-logic'

interface Props {
  resumen: ResumenPresupuesto | null
}

export default function PresupuestoPanel({ resumen }: Props) {
  if (!resumen) {
    return (
      <div className="rounded-2xl p-6 glass">
        <p className="text-sm" style={{ color: 'rgba(0,0,0,0.35)' }}>
          Selecciona un beneficiario para ver su resumen.
        </p>
      </div>
    )
  }

  const { beneficiario, total_gastado, saldo_disponible, aporte_bolsillo, tiene_aporte_bolsillo, asignaciones } = resumen
  const porcentaje = Math.min(100, (total_gastado / beneficiario.presupuesto_base) * 100)
  const esInvernadero = beneficiario.proyecto === 'Invernadero'

  return (
    <div className="rounded-2xl p-5 space-y-4 glass">
      <div>
        <h3 className="font-bold text-gray-900">{beneficiario.nombre}</h3>
        <span className="inline-block text-xs px-2 py-0.5 rounded-full mt-1 font-medium" style={esInvernadero ? {
          background: 'var(--verde-muted)',
          color: 'var(--verde-dark)',
        } : {
          background: 'var(--cafe-muted)',
          color: 'var(--cafe-dark)',
        }}>
          {beneficiario.proyecto}
        </span>
      </div>

      {/* Barra de progreso */}
      <div>
        <div className="flex justify-between text-xs mb-1" style={{ color: 'rgba(0,0,0,0.45)' }}>
          <span>Presupuesto usado</span>
          <span>{porcentaje.toFixed(1)}%</span>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.07)' }}>
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${porcentaje}%`,
              background: tiene_aporte_bolsillo ? '#dc2626' : 'var(--verde)',
            }}
          />
        </div>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span style={{ color: 'rgba(0,0,0,0.5)' }}>Presupuesto base</span>
          <span className="font-semibold">{formatCLP(beneficiario.presupuesto_base)}</span>
        </div>
        <div className="flex justify-between">
          <span style={{ color: 'rgba(0,0,0,0.5)' }}>Total gastado</span>
          <span className="font-semibold">{formatCLP(total_gastado)}</span>
        </div>
        <div className="flex justify-between">
          <span style={{ color: 'rgba(0,0,0,0.5)' }}>Saldo disponible</span>
          <span className="font-semibold" style={{ color: saldo_disponible === 0 ? 'rgba(0,0,0,0.3)' : 'var(--verde)' }}>
            {formatCLP(saldo_disponible)}
          </span>
        </div>
      </div>

      {tiene_aporte_bolsillo && (
        <div className="rounded-xl p-3" style={{
          background: 'rgba(220,38,38,0.07)',
          border: '1px solid rgba(220,38,38,0.2)',
        }}>
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#dc2626' }}>
            Aporte de Bolsillo
          </p>
          <p className="text-xl font-bold mt-0.5" style={{ color: '#dc2626' }}>
            {formatCLP(aporte_bolsillo)}
          </p>
          <p className="text-xs mt-1" style={{ color: 'rgba(220,38,38,0.6)' }}>
            El beneficiario debe cubrir esta diferencia.
          </p>
        </div>
      )}

      {asignaciones.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'rgba(0,0,0,0.35)' }}>
            Carrito
          </p>
          <ul className="space-y-1">
            {asignaciones.map((a) => (
              <li key={a.id} className="flex justify-between text-xs" style={{ color: 'rgba(0,0,0,0.6)' }}>
                <span>{a.insumos?.nombre ?? 'Insumo'} × {a.cantidad}</span>
                <span className="font-medium">{formatCLP(a.costo_total)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
