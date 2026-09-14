'use client'

import { useMemo } from 'react'
import { Printer, Download, FileDown } from 'lucide-react'
import { formatCLP } from '@/lib/business-logic'
import { Button, Badge } from '@/components/design-system'
import { resumenCarrito } from './RevisionContent'

// Pestaña "Reporte" de /rendicion: la rendición completa de los 29 socios en
// una hoja -- quién es, qué proyecto tiene, qué compró y cuánto puso de su
// bolsillo. Es lo que se entrega hacia arriba.
//
// Come de las MISMAS filas que la Lista y "Por revisar" (llegan resueltas del
// Server Component). No pide datos por su cuenta y no recalcula nada: el
// aporte ya viene de aporteDeBolsillo(). Un reporte que sacara sus propias
// cuentas podría decir una cifra distinta a la de la pantalla de al lado, que
// es exactamente el bug que originó este proyecto.

export type FilaReporte = {
  id: string
  nombre: string
  segmento: string
  aporteBolsillo: number | null
  items: { insumoNombre: string; cantidad: number }[]
}

/** CSV para Excel en Chile: separador `;` (con `,` Excel mete toda la fila en
 *  una celda, porque el decimal local es la coma) y BOM al principio para que
 *  no rompa los acentos.
 *
 *  El monto va como número pelado, no como "$1.450": formateado entra a Excel
 *  como texto y la columna deja de poder sumarse, que es justo para lo que se
 *  baja una planilla. Es el mismo valor que muestra la pantalla, escrito como
 *  lo entiende una celda. */
function construirCSV(filas: FilaReporte[]): string {
  const escapar = (v: string) => `"${v.replace(/"/g, '""')}"`
  const lineas = [
    ['Beneficiario', 'Proyecto', 'Qué compró', 'Puso de su bolsillo'].map(escapar).join(';'),
    ...filas.map(f =>
      [
        f.nombre,
        f.segmento,
        resumenCarrito(f.items) || 'Sin carrito',
        f.aporteBolsillo === null ? 'Sin cotizar completo' : String(f.aporteBolsillo),
      ]
        .map(escapar)
        .join(';')
    ),
  ]
  return '﻿' + lineas.join('\r\n')
}

function descargarCSV(filas: FilaReporte[]) {
  const url = URL.createObjectURL(new Blob([construirCSV(filas)], { type: 'text/csv;charset=utf-8;' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `rendicion-pat-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function ReporteContent({ filas }: { filas: FilaReporte[] }) {
  // Los aportes sin afirmar (total parcial) no entran en el total: sumarlos
  // como 0 daría un número que parece completo y no lo es.
  const { totalAporte, conAporte, sinCotizar } = useMemo(() => {
    let totalAporte = 0
    let conAporte = 0
    let sinCotizar = 0
    for (const f of filas) {
      if (f.aporteBolsillo === null) sinCotizar++
      else if (f.aporteBolsillo > 0) { totalAporte += f.aporteBolsillo; conAporte++ }
    }
    return { totalAporte, conAporte, sinCotizar }
  }, [filas])

  return (
    <div className="space-y-6 print-hoja">
      {/* La fecha importa en el papel: una hoja impresa sin fecha no se puede
          contrastar con el estado de hoy. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="eyebrow">
          Al {new Date().toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
        <div className="flex gap-2 no-print">
          <Button size="sm" variant="secondary" onClick={() => window.print()}>
            <Printer size={14} /> Imprimir
          </Button>
          <Button size="sm" variant="secondary" onClick={() => descargarCSV(filas)}>
            <Download size={14} /> Descargar CSV
          </Button>
          {/* El informe PDF para la consultora (proveedor de compra, total y
              fotos por socio) se genera en el servidor con la MISMA
              agregación que esta tabla. Antes vivía en /admin, lejos de la
              pestaña que es el mismo documento. */}
          <Button size="sm" variant="secondary" onClick={() => { window.location.href = '/api/admin/informe-consultora' }}>
            <FileDown size={14} /> PDF para la consultora
          </Button>
        </div>
      </div>

      <div className="rounded-[6px] overflow-hidden print-bloque" style={{ border: '1px solid var(--linea)' }}>
        <table className="w-full text-sm">
          <caption className="sr-only">Rendición de los {filas.length} socios del programa</caption>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--linea)' }}>
              <th scope="col" className="text-left px-4 py-2.5 eyebrow">Socio</th>
              <th scope="col" className="text-left px-4 py-2.5 eyebrow hidden sm:table-cell">Proyecto</th>
              <th scope="col" className="text-left px-4 py-2.5 eyebrow hidden sm:table-cell">Qué compró</th>
              <th scope="col" className="text-right px-4 py-2.5 eyebrow">De su bolsillo</th>
            </tr>
          </thead>
          <tbody>
            {filas.map(f => (
              <tr key={f.id} style={{ borderBottom: '1px solid var(--linea)' }}>
                {/* En el teléfono no caben cuatro columnas: proyecto y carrito
                    bajan debajo del nombre en vez de salirse de la pantalla. */}
                <td className="px-4 py-2.5 font-medium align-top" style={{ color: 'var(--tinta)' }}>
                  {f.nombre}
                  <span className="block sm:hidden text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                    {f.segmento} · {resumenCarrito(f.items) || 'Sin carrito'}
                  </span>
                </td>
                <td className="px-4 py-2.5 hidden sm:table-cell align-top">
                  <Badge tone={f.segmento === 'Invernadero' ? 'verde' : 'terracota'} className="!text-xs">
                    {f.segmento}
                  </Badge>
                </td>
                <td className="px-4 py-2.5 hidden sm:table-cell align-top" style={{ color: 'var(--text-muted)' }}>
                  {resumenCarrito(f.items) || 'Sin carrito'}
                </td>
                <td
                  className="px-4 py-2.5 text-right align-top tabular-nums whitespace-nowrap"
                  // La terracota y la negrita son para la plata que hay que
                  // ir a cobrar. Un $0 pintado igual que una deuda hace que
                  // una columna entera de ceros grite sin pedir nada.
                  style={{
                    color: f.aporteBolsillo ? 'var(--cafe-dark)' : 'var(--text-muted)',
                    fontWeight: f.aporteBolsillo ? 700 : 400,
                  }}
                >
                  {f.aporteBolsillo === null
                    ? <span className="text-xs">Sin cotizar completo</span>
                    : formatCLP(f.aporteBolsillo)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: 'var(--papel-hueco)' }}>
              <td className="px-4 py-3 font-bold" style={{ color: 'var(--tinta)' }} colSpan={3}>
                {filas.length} socios
              </td>
              <td className="px-4 py-3 text-right font-bold tabular-nums" style={{ color: 'var(--cafe-dark)' }}>
                {formatCLP(totalAporte)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-xs" style={{ color: 'var(--tinta-45)' }}>
        El aporte de bolsillo es la diferencia entre lo que costó el carrito y el presupuesto del socio.
        Suman {formatCLP(totalAporte)} entre {conAporte} socios; el resto no puso nada de su bolsillo.
        {sinCotizar > 0 && ` ${sinCotizar} ${sinCotizar === 1 ? 'socio queda' : 'socios quedan'} sin cifra porque su carrito todavía no está cotizado completo, y no entran en ese total.`}
      </p>
    </div>
  )
}
