'use client'

import type { Beneficiario } from '@/lib/types'
import { formatCLP } from '@/lib/business-logic'

interface Props {
  beneficiario: Beneficiario
  totalGastado: number
  aporteBolsillo: number
  isSelected: boolean
  onClick: () => void
}

export default function BeneficiarioCard({ beneficiario, totalGastado, aporteBolsillo, isSelected, onClick }: Props) {
  const tieneAporte = aporteBolsillo > 0
  const porcentaje = Math.min(100, (totalGastado / beneficiario.presupuesto_base) * 100)

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl border p-4 transition-all ${
        isSelected
          ? 'border-indigo-500 bg-indigo-50 shadow-sm'
          : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-gray-900 truncate text-sm">{beneficiario.nombre}</p>
          <p className={`text-xs mt-0.5 ${
            beneficiario.proyecto === 'Invernadero' ? 'text-green-600' : 'text-blue-600'
          }`}>
            {beneficiario.proyecto}
          </p>
        </div>
        {tieneAporte && (
          <span className="shrink-0 text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-medium">
            +{formatCLP(aporteBolsillo)}
          </span>
        )}
      </div>

      <div className="mt-3">
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${tieneAporte ? 'bg-red-400' : 'bg-emerald-400'}`}
            style={{ width: `${porcentaje}%` }}
          />
        </div>
        <p className="text-xs text-gray-400 mt-1">{formatCLP(totalGastado)} de {formatCLP(beneficiario.presupuesto_base)}</p>
      </div>
    </button>
  )
}
