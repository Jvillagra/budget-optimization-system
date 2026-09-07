import { NextResponse } from 'next/server'
import { getViewerContext, isStaff } from '@/lib/roles'
import { urlFirmadaLectura } from '@/lib/r2'
import { formatCLP } from '@/lib/business-logic'
import { cargarRendicion } from '@/lib/rendicion-data'
import { renderInformeHTML, type InformeBeneficiario } from './template'
import { getBrowser } from './browser'

export const maxDuration = 60

// Informe PDF self-service para la empresa consultora que audita el
// proyecto (staff-only). Usa exactamente la misma agregación que
// /api/rendicion (lib/rendicion-data.ts): antes estaba duplicada y podía
// divergir justo en el documento que va al auditor.

// Las URLs firmadas tienen que sobrevivir al render completo del PDF: con
// 300s y ~145 imágenes bajando dentro del Lambda, las últimas expiraban a
// mitad de render y el PDF salía con huecos, status 200 y sin ningún aviso.
const TTL_FIRMA_PDF = 900

export async function GET() {
  const ctx = await getViewerContext()
  if (!isStaff(ctx)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const res = await cargarRendicion()
  if (!res.ok) {
    console.error('informe-consultora', res.error)
    return NextResponse.json({ error: 'Error al generar el informe' }, { status: 500 })
  }

  const data: InformeBeneficiario[] = await Promise.all(
    res.filas.map(async fila => ({
      nombre: fila.nombre,
      segmento: fila.segmento,
      proveedorCompraNombre: fila.proveedorCompraNombre ?? 'sin confirmar',
      total: fila.total,
      // El informe declara explícitamente cuándo el total NO es un total:
      // antes se imprimía la suma parcial etiquetada "Total cotizado" y el
      // auditor no tenía forma de saber que faltaban precios o el carrito.
      totalEsCompleto: fila.totalEsCompleto,
      itemsSinPrecio: fila.itemsSinPrecio,
      sinCarrito: fila.items.length === 0,
      fotos: await Promise.all(fila.fotos.map(f => urlFirmadaLectura(f.r2_key, TTL_FIRMA_PDF))),
    }))
  )

  const completos = data.filter(b => b.totalEsCompleto)
  const totalGeneral = completos.reduce((sum, b) => sum + b.total, 0)
  const fecha = new Date()
  const html = renderInformeHTML({
    beneficiarios: data,
    totalGeneral,
    totalGeneralFormateado: formatCLP(totalGeneral),
    beneficiariosIncompletos: data.length - completos.length,
    fechaGeneracion: fecha.toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric' }),
  })

  const browser = await getBrowser()
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'load' })
    // `load` no garantiza que las <img> remotas terminaran de decodificar.
    // Sin esta espera el PDF podía salir con recuadros vacíos en silencio.
    await page.evaluate(async () => {
      await Promise.all(
        Array.from(document.images)
          .filter(img => !img.complete)
          .map(img => new Promise(resolve => { img.onload = img.onerror = resolve }))
      )
    })
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '18mm', bottom: '18mm', left: '14mm', right: '14mm' },
    })

    const filename = `informe-consultora-${fecha.toISOString().slice(0, 10)}.pdf`
    return new NextResponse(Buffer.from(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    console.error('informe-consultora render', err)
    return NextResponse.json({ error: 'No se pudo generar el PDF' }, { status: 500 })
  } finally {
    await browser.close().catch(() => {})
  }
}
