import { NextResponse } from 'next/server'
import { getViewerContext, isStaff } from '@/lib/roles'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { urlFirmadaLectura } from '@/lib/r2'
import { calcularCostoCarrito, formatCLP } from '@/lib/business-logic'
import { renderInformeHTML, type InformeBeneficiario } from './template'
import { getBrowser } from './browser'
import { EMAIL_QA_SOCIO } from '@/lib/constants'
import type { Asignacion, Proveedor, PrecioProveedor, FotoCompra } from '@/lib/types'

export const maxDuration = 60

// Informe PDF self-service para la empresa consultora que audita el
// proyecto (staff-only). Reutiliza exactamente la misma agregación por
// beneficiario que /api/rendicion (ver ese archivo para el detalle del
// cálculo de "mejor proveedor"/total cotizado) -- este endpoint solo
// cambia el formato de salida (PDF en vez de JSON) y excluye al
// beneficiario de pruebas de QA (ver EMAIL_QA_SOCIO en lib/constants.ts).

export async function GET() {
  const ctx = await getViewerContext()
  if (!isStaff(ctx)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = getSupabaseAdmin()

  const [
    { data: beneficiarios, error: e1 },
    { data: asignaciones, error: e2 },
    { data: proveedores, error: e3 },
    { data: preciosProveedor, error: e4 },
    { data: fotos, error: e5 },
  ] = await Promise.all([
    admin.from('beneficiarios').select('*').order('segmento').order('nombre'),
    admin.from('asignaciones').select('*, catalogo_insumos(*)'),
    admin.from('proveedores').select('*').eq('es_activo', true).order('nombre'),
    admin.from('precios_proveedor').select('*'),
    admin.from('fotos_compra').select('*').order('uploaded_at', { ascending: true }),
  ])

  const error = e1 || e2 || e3 || e4 || e5
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const precioMap = new Map<string, number | null>()
  for (const p of (preciosProveedor ?? []) as PrecioProveedor[]) {
    precioMap.set(`${p.proveedor_id}_${p.insumo_id}`, p.precio_unitario)
  }

  const asignacionesPorBen = new Map<string, Asignacion[]>()
  for (const a of (asignaciones ?? []) as Asignacion[]) {
    const arr = asignacionesPorBen.get(a.beneficiario_id) ?? []
    arr.push(a)
    asignacionesPorBen.set(a.beneficiario_id, arr)
  }

  const fotosPorBen = new Map<string, FotoCompra[]>()
  for (const f of (fotos ?? []) as FotoCompra[]) {
    const arr = fotosPorBen.get(f.beneficiario_id) ?? []
    arr.push(f)
    fotosPorBen.set(f.beneficiario_id, arr)
  }

  const provs = (proveedores ?? []) as Proveedor[]
  const provPorId = new Map(provs.map(p => [p.id, p]))

  const beneficiariosReales = (beneficiarios ?? []).filter(ben => ben.email !== EMAIL_QA_SOCIO)

  const data: InformeBeneficiario[] = await Promise.all(
    beneficiariosReales.map(async ben => {
      const asigs = asignacionesPorBen.get(ben.id) ?? []

      let mejor: { proveedor: Proveedor | null; total: number; itemsSinPrecio: number } = {
        proveedor: null, total: 0, itemsSinPrecio: asigs.length,
      }
      for (const prov of provs) {
        const { total, itemsSinPrecio } = calcularCostoCarrito(asigs, prov.id, precioMap)
        const mejorCandidato =
          !mejor.proveedor ||
          itemsSinPrecio < mejor.itemsSinPrecio ||
          (itemsSinPrecio === mejor.itemsSinPrecio && total < mejor.total)
        if (mejorCandidato) mejor = { proveedor: prov, total, itemsSinPrecio }
      }

      const fotosBen = fotosPorBen.get(ben.id) ?? []
      const fotosUrls = await Promise.all(
        fotosBen.map(f => urlFirmadaLectura(f.r2_key, 300))
      )

      return {
        nombre: ben.nombre,
        segmento: ben.segmento,
        proveedorCompraNombre: ben.proveedor_compra_id
          ? (provPorId.get(ben.proveedor_compra_id)?.nombre ?? 'sin confirmar')
          : 'sin confirmar',
        total: mejor.total,
        fotos: fotosUrls,
      }
    })
  )

  const totalGeneral = data.reduce((sum, b) => sum + b.total, 0)
  const fecha = new Date()
  const html = renderInformeHTML({
    beneficiarios: data,
    totalGeneral,
    totalGeneralFormateado: formatCLP(totalGeneral),
    fechaGeneracion: fecha.toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric' }),
  })

  const browser = await getBrowser()
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'load' })
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
  } finally {
    await browser.close()
  }
}
