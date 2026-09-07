'use client'

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { formatCLP } from '@/lib/business-logic'

// Aislado en su propio archivo para poder cargarlo con next/dynamic: recharts
// pesa ~320KB sin comprimir y era parte del bundle inicial de la pantalla que
// el socio abre desde el celular, para un gráfico que además está bajo el
// pliegue. Ahora la página pinta primero y el gráfico llega después.
export type DatoSegmento = { segmento: string; valor: number }

export default function ComposicionChart({ data, colores }: {
  data: DatoSegmento[]
  colores: Record<string, string>
}) {
  return (
    <div style={{ width: '100%', height: 220 }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={data}
            dataKey="valor"
            nameKey="segmento"
            cx="50%"
            cy="50%"
            outerRadius={80}
            label={(props: { name?: string; percent?: number }) => `${props.name} ${((props.percent ?? 0) * 100).toFixed(0)}%`}
          >
            {data.map(d => <Cell key={d.segmento} fill={colores[d.segmento] ?? '#999'} />)}
          </Pie>
          <Tooltip formatter={(v) => formatCLP(Number(v))} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
