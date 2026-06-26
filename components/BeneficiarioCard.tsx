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
  const esInvernadero = beneficiario.proyecto === 'Invernadero'

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-2xl p-4 transition-all duration-200"
      style={isSelected ? {
        background: 'rgba(58, 125, 68, 0.12)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        border: '1.5px solid var(--verde)',
        boxShadow: '0 4px 20px rgba(58,125,68,0.18)',
      } : {
        background: 'rgba(255,255,255,0.65)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        border: '1px solid rgba(255,255,255,0.55)',
        boxShadow: '0 2px 12px rgba(61,90,54,0.07)',
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold truncate text-sm" style={{ color: '#1c1c1c' }}>
            {beneficiario.nombre}
          </p>
          <span className="inline-block text-xs mt-0.5 px-2 py-0.5 rounded-full font-medium" style={esInvernadero ? {
            background: 'var(--verde-muted)',
            color: 'var(--verde-dark)',
          } : {
            background: 'var(--cafe-muted)',
            color: 'var(--cafe-dark)',
          }}>
            {beneficiario.proyecto}
          </span>
        </div>
        {tieneAporte && (
          <span className="shrink-0 text-xs px-1.5 py-0.5 rounded-full font-semibold" style={{
            background: '#fee2e2',
            color: '#dc2626',
          }}>
            +{formatCLP(aporteBolsillo)}
          </span>
        )}
      </div>

      <div className="mt-3">
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.06)' }}>
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${porcentaje}%`,
              background: tieneAporte ? '#dc2626' : 'var(--verde)',
            }}
          />
        </div>
        <p className="text-xs mt-1" style={{ color: 'rgba(0,0,0,0.4)' }}>
          {formatCLP(totalGastado)} de {formatCLP(beneficiario.presupuesto_base)}
        </p>
      </div>
    </button>
  )
}
