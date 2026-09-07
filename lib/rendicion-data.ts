import 'server-only'
import { getSupabaseAdmin } from './supabase-admin'
import { elegirMejorProveedor } from './business-logic'
import { EMAIL_QA_SOCIO } from './constants'
import type { Asignacion, Proveedor, PrecioProveedor, FotoCompra, Beneficiario } from './types'

// Agregación por beneficiario para la rendición. La consumen /api/rendicion
// (JSON para la UI de staff) y /api/admin/informe-consultora (PDF para la
// consultora que audita). Antes estaba copiada literal en los dos archivos,
// incluido el bucle de "mejor proveedor": arreglar el criterio en uno dejaba
// el informe del auditor con el criterio viejo.

export interface ItemCotizado {
  id: string
  insumoNombre: string
  formatoVenta: string | null
  cantidad: number
  precioUnitario: number | null
  subtotal: number | null
}

export interface FilaRendicion {
  id: string
  nombre: string
  segmento: string
  presupuestoBase: number
  proveedorNombre: string | null
  proveedorCompraId: string | null
  proveedorCompraNombre: string | null
  total: number
  itemsSinPrecio: number
  /** false = `total` es una suma parcial (faltan precios o no hay carrito),
   *  no un total cotizado. Quien lo muestre tiene que decirlo. */
  totalEsCompleto: boolean
  items: ItemCotizado[]
  fotos: { id: string; r2_key: string; uploaded_at: string }[]
  fotosCount: number
  compraCompleta: boolean
  compraCompletaAt: string | null
}

type BeneficiarioRow = Beneficiario & { es_prueba?: boolean }

/** Fila de QA que vive en la tabla real. Desde 009 se marca con la columna
 *  `es_prueba`; el filtro por email queda como respaldo por si la migración
 *  todavía no se aplicó en algún entorno. */
function esDePrueba(ben: BeneficiarioRow): boolean {
  return ben.es_prueba === true || (ben.email?.toLowerCase() ?? null) === EMAIL_QA_SOCIO
}

export async function cargarRendicion(): Promise<
  | { ok: true; filas: FilaRendicion[]; proveedores: Proveedor[] }
  | { ok: false; error: unknown }
> {
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
  if (error) return { ok: false, error }

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

  const visibles = ((beneficiarios ?? []) as BeneficiarioRow[]).filter(ben => !esDePrueba(ben))

  const filas: FilaRendicion[] = visibles.map(ben => {
    const asigs = asignacionesPorBen.get(ben.id) ?? []
    const mejor = elegirMejorProveedor(asigs, provs, precioMap)

    // Cotización línea a línea del carrito real, valorizada con el proveedor
    // de compra confirmado si existe; si no, con el "mejor" calculado.
    const proveedorParaItems = ben.proveedor_compra_id ?? mejor.proveedor?.id ?? null
    const items: ItemCotizado[] = asigs.map(a => {
      const precioUnitario = proveedorParaItems
        ? (precioMap.get(`${proveedorParaItems}_${a.insumo_id}`) ?? null)
        : null
      return {
        id: a.id,
        insumoNombre: a.catalogo_insumos?.nombre ?? 'Insumo',
        formatoVenta: a.catalogo_insumos?.formato_venta ?? null,
        cantidad: a.cantidad,
        precioUnitario,
        subtotal: precioUnitario !== null ? precioUnitario * a.cantidad : null,
      }
    })

    const fotosBen = fotosPorBen.get(ben.id) ?? []

    return {
      id: ben.id,
      nombre: ben.nombre,
      segmento: ben.segmento,
      presupuestoBase: ben.presupuesto_base,
      proveedorNombre: mejor.proveedor?.nombre ?? null,
      proveedorCompraId: ben.proveedor_compra_id,
      proveedorCompraNombre: ben.proveedor_compra_id
        ? (provPorId.get(ben.proveedor_compra_id)?.nombre ?? null)
        : null,
      total: mejor.total,
      itemsSinPrecio: mejor.itemsSinPrecio,
      totalEsCompleto: mejor.totalEsCompleto,
      items,
      fotos: fotosBen.map(f => ({ id: f.id, r2_key: f.r2_key, uploaded_at: f.uploaded_at })),
      fotosCount: fotosBen.length,
      compraCompleta: ben.compra_completa,
      compraCompletaAt: ben.compra_completa_at,
    }
  })

  return { ok: true, filas, proveedores: provs }
}
