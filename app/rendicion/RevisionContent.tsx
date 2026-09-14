'use client'

import { useMemo } from 'react'
import { AlertTriangle, Printer, CheckCircle2 } from 'lucide-react'
import { formatCLP, revisarCarritos, type CarritoRevisable } from '@/lib/business-logic'
import { Button, Badge, Card } from '@/components/design-system'

// Pestaña "Por revisar" de /rendicion. Dos cosas que antes había que sacar a
// mano recorriendo las 29 tarjetas: qué carritos no cuadran, y a quién hay
// que cobrarle cuánto.
//
// Se calcula en cada carga a partir de las mismas filas que alimentan la
// lista. Esto vivió un día como documento aparte y el problema fue obvio: un
// informe con fecha miente al día siguiente, cuando alguien cambia un carrito.

export type FilaRevision = CarritoRevisable & {
  aporteBolsillo: number | null
  items: { insumoNombre: string; cantidad: number }[]
}

/** Resumen del carrito en una línea: es lo que permite reconocer en terreno
 *  de qué compra se está hablando. Lo usan la lista de cobro de acá y la
 *  pestaña Reporte -- misma compra, misma frase en las dos. */
export function resumenCarrito(items: { insumoNombre: string; cantidad: number }[]): string {
  return items.map(i => `${i.cantidad} ${i.insumoNombre}`).join(' + ')
}

export function RevisionContent({ filas }: { filas: FilaRevision[] }) {
  const casos = useMemo(() => revisarCarritos(filas), [filas])

  const cobros = useMemo(
    () =>
      filas
        .filter(f => (f.aporteBolsillo ?? 0) > 0)
        .sort((a, b) => (b.aporteBolsillo ?? 0) - (a.aporteBolsillo ?? 0) || a.nombre.localeCompare(b.nombre)),
    [filas]
  )
  const totalCobro = cobros.reduce((s, f) => s + (f.aporteBolsillo ?? 0), 0)

  return (
    <div className="space-y-8 print-hoja">
      {/* La fecha importa en el papel: una hoja impresa sin fecha no se puede
          contrastar con el estado de hoy. En pantalla es el pie de página de
          una pantalla que ya se sabe viva. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="eyebrow">
          Al {new Date().toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
        <Button size="sm" variant="secondary" onClick={() => window.print()} className="no-print">
          <Printer size={14} /> Imprimir
        </Button>
      </div>

      {/* ---- Casos a revisar ---- */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <p className="eyebrow">Antes de comprar</p>
          <span className="text-sm tabular-nums" style={{ color: 'var(--text-muted)' }}>
            {casos.length} de {filas.length} socios
          </span>
        </div>

        {casos.length === 0 ? (
          <Card className="p-5 flex items-start gap-3">
            <CheckCircle2 size={18} style={{ color: 'var(--verde-dark)' }} className="shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--tinta)' }}>
                Ningún carrito necesita revisión
              </p>
              <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                Los {filas.length} están cotizados completos, usan su presupuesto y llevan las cantidades
                de malla normales de su proyecto.
              </p>
            </div>
          </Card>
        ) : (
          <ul className="space-y-3">
            {casos.map(caso => (
              <li
                key={caso.id}
                className="rounded-[6px] p-4 sm:p-5 space-y-3 print-bloque"
                style={{
                  background: 'var(--papel)',
                  border: '1px solid var(--linea)',
                  borderLeft: `3px solid ${caso.severidad === 'alta' ? 'var(--alerta)' : 'var(--linea-fuerte)'}`,
                }}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="font-bold" style={{ color: 'var(--tinta)' }}>{caso.nombre}</p>
                  <Badge tone={caso.segmento === 'Invernadero' ? 'verde' : 'terracota'} className="!text-xs">
                    {caso.segmento}
                  </Badge>
                </div>

                {caso.hallazgos.map(h => (
                  <div key={h.motivo} className="space-y-1.5">
                    <p className="text-sm font-semibold flex items-start gap-2"
                      style={{ color: h.severidad === 'alta' ? 'var(--alerta)' : 'var(--cafe-dark)' }}>
                      <AlertTriangle size={15} className="shrink-0 mt-0.5" aria-hidden />
                      {h.titulo}
                    </p>
                    <p className="text-sm tabular-nums" style={{ color: 'var(--text-muted)' }}>{h.detalle}</p>
                    <p className="text-sm rounded-[4px] p-3" style={{ background: 'var(--papel-hueco)', color: 'var(--tinta)' }}>
                      {h.pregunta}
                    </p>
                  </div>
                ))}
              </li>
            ))}
          </ul>
        )}

        <p className="text-xs" style={{ color: 'var(--tinta-45)' }}>
          Las cantidades de malla se comparan contra lo normal de cada proyecto. Los polines no se
          comparan a propósito: son el saldo — se compran con lo que sobra después de la malla — así
          que llevar 4 o 48 puede ser igual de correcto.
        </p>
      </section>

      {/* ---- A quién cobrar ---- */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <p className="eyebrow">Al momento de comprar</p>
          <span className="text-sm tabular-nums" style={{ color: 'var(--text-muted)' }}>
            {cobros.length} de {filas.length} socios
          </span>
        </div>

        {cobros.length === 0 ? (
          <Card className="p-5">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Ningún socio se pasó de su presupuesto: no hay nada que cobrar.
            </p>
          </Card>
        ) : (
          <div className="rounded-[6px] overflow-hidden" style={{ border: '1px solid var(--linea)' }}>
            <table className="w-full text-sm">
              <caption className="sr-only">Socios que deben poner plata de su bolsillo</caption>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--linea)' }}>
                  <th scope="col" className="text-left px-4 py-2.5 eyebrow">Socio</th>
                  <th scope="col" className="text-left px-4 py-2.5 eyebrow hidden sm:table-cell">Su carrito</th>
                  <th scope="col" className="text-right px-4 py-2.5 eyebrow">Debe poner</th>
                </tr>
              </thead>
              <tbody>
                {cobros.map(f => (
                  <tr key={f.id} style={{ borderBottom: '1px solid var(--linea)' }}>
                    <td className="px-4 py-2.5 font-medium" style={{ color: 'var(--tinta)' }}>
                      {f.nombre}
                      <span className="block sm:hidden text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {resumenCarrito(f.items)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 hidden sm:table-cell" style={{ color: 'var(--text-muted)' }}>
                      {resumenCarrito(f.items)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-bold tabular-nums whitespace-nowrap"
                      style={{ color: 'var(--cafe-dark)' }}>
                      {formatCLP(f.aporteBolsillo ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--papel-hueco)' }}>
                  <td className="px-4 py-3 font-bold" style={{ color: 'var(--tinta)' }} colSpan={2}>
                    {cobros.length} socios
                  </td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums" style={{ color: 'var(--cafe-dark)' }}>
                    {formatCLP(totalCobro)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <p className="text-xs" style={{ color: 'var(--tinta-45)' }}>
          Es la diferencia entre lo que cuesta su carrito y su presupuesto. Los {filas.length - cobros.length} socios
          que no aparecen no deben nada.
        </p>
      </section>
    </div>
  )
}
