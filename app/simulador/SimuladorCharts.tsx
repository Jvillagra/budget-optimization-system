'use client'

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell,
  PieChart, Pie, ResponsiveContainer, LabelList,
} from 'recharts'
import { formatCLP } from '@/lib/business-logic'

// Los dos gráficos de /simulador viven acá, fuera del bundle inicial de la
// pantalla: recharts pesaba 99KB gz (de 144KB gz de toda la página) y se
// descargaba SIEMPRE, aunque los gráficos solo existen después de apretar
// "Simular". Mismo criterio que app/mi-dashboard/ComposicionChart.tsx.
//
// Colores en literal porque recharts recibe strings y el SVG no resuelve
// custom properties de CSS. Deben seguir a globals.css: --marca /
// --marca-calida / --alerta.
const VERDE = '#3f5c1c'
const CAFE = '#8b5a2b'
export const PIE_COLORS = [VERDE, '#d8d2c4', '#a33124']

export type PolinesDatum = {
  proveedor: string
  nombreCompleto: string
  polines: number
  es_ganador: boolean
}

export function PolinesChart({ data }: { data: PolinesDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 20, right: 20, left: 0, bottom: 0 }}>
        <XAxis dataKey="proveedor" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
        <Tooltip
          formatter={(v, _name, props) => [`${(v as number).toLocaleString('es-CL')} un.`, props.payload?.nombreCompleto ?? '']}
          contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--linea)' }}
        />
        <Bar dataKey="polines" radius={[6, 6, 0, 0]} maxBarSize={80}>
          <LabelList dataKey="polines" position="top" style={{ fontSize: 13, fontWeight: 700 }} formatter={(v: unknown) => typeof v === 'number' ? v.toLocaleString('es-CL') : String(v)} />
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.es_ganador ? VERDE : CAFE} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export type PieDatum = { name: string; value: number }

export function ComposicionDonut({ data }: { data: PieDatum[] }) {
  return (
    <ResponsiveContainer width={100} height={100}>
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" innerRadius={28} outerRadius={44} dataKey="value" strokeWidth={0}>
          {data.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
        </Pie>
        <Tooltip formatter={(v) => formatCLP(v as number)} />
      </PieChart>
    </ResponsiveContainer>
  )
}
