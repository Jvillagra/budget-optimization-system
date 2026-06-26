'use client'

import type { ResumenPresupuesto } from '@/lib/types'
import { formatCLP } from '@/lib/business-logic'

interface Props {
  resumen: ResumenPresupuesto | null
}

export default function PresupuestoPanel({ resumen }: Props) {
  if (!resumen) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <p className="text-sm text-gray-400">Selecciona un beneficiario para ver su resumen.</p>
      </div>
    )
  }

  const { beneficiario, total_gastado, saldo_disponible, aporte_bolsillo, tiene_aporte_bolsillo, asignaciones } = resumen
  const porcentaje = Math.min(100, (total_gastado / beneficiario.presupuesto_base) * 100)

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
      <div>
        <h3 className="font-semibold text-gray-900">{beneficiario.nombre}</h3>
        <span className={`inline-block text-xs px-2 py-0.5 rounded-full mt-1 ${
          beneficiario.proyecto === 'Invernadero'
            ? 'bg-green-100 text-green-700'
            : 'bg-blue-100 text-blue-700'
        }`}>
          {beneficiario.proyecto}
        </span>
      </div>

      {/* Barra de progreso */}
      <div>
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>Presupuesto usado</span>
          <span>{porcentaje.toFixed(1)}%</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${tiene_aporte_bolsillo ? 'bg-red-500' : 'bg-emerald-500'}`}
            style={{ width: `${porcentaje}%` }}
          />
        </div>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">Presupuesto base</span>
          <span className="font-medium">{formatCLP(beneficiario.presupuesto_base)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Total gastado</span>
          <span className="font-medium">{formatCLP(total_gastado)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Saldo disponible</span>
          <span className={`font-medium ${saldo_disponible === 0 ? 'text-gray-400' : 'text-emerald-600'}`}>
            {formatCLP(saldo_disponible)}
          </span>
        </div>
      </div>

      {tiene_aporte_bolsillo && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3">
          <p className="text-xs text-red-600 font-medium uppercase tracking-wide">Aporte de Bolsillo</p>
          <p className="text-xl font-bold text-red-600 mt-0.5">{formatCLP(aporte_bolsillo)}</p>
          <p className="text-xs text-red-400 mt-1">El beneficiario debe cubrir esta diferencia.</p>
        </div>
      )}

      {asignaciones.length > 0 && (
        <div>
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-2">Carrito</p>
          <ul className="space-y-1">
            {asignaciones.map((a) => (
              <li key={a.id} className="flex justify-between text-xs text-gray-600">
                <span>{a.insumos?.nombre ?? 'Insumo'} × {a.cantidad}</span>
                <span>{formatCLP(a.costo_total)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
