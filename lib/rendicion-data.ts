import 'server-only'
import { getSupabaseAdmin } from './supabase-admin'
import { urlsFirmadasFoto } from './r2'
import { cotizarCarrito, proveedorPorDefecto, aporteDeBolsillo, esDePrueba, precioPolinDeReferencia } from './business-logic'
import type { Asignacion, Proveedor, PrecioProveedor, FotoCompra, Beneficiario, CatalogoInsumo } from './types'

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
  /** Lo que el socio tiene que poner de su bolsillo: `total` menos su
   *  presupuesto, nunca negativo. null cuando el total es parcial y el
   *  aporte no se puede afirmar. Es la cifra que se le cobra. */
  aporteBolsillo: number | null
  /** Precio de un polín con el proveedor que cotiza este carrito: la unidad
   *  más chica con la que el socio puede seguir gastando su saldo. Lo usa la
   *  revisión de carritos para distinguir un carrito a medio cargar del
   *  vuelto que deja el ajuste automático. null = no hay con qué medir. */
  precioPolin: number | null
  items: ItemCotizado[]
  fotos: { id: string; r2_key: string; uploaded_at: string }[]
  fotosCount: number
  compraCompleta: boolean
  compraCompletaAt: string | null
}

type BeneficiarioRow = Beneficiario & { es_prueba?: boolean }

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
    { data: catalogo, error: e6 },
  ] = await Promise.all([
    admin.from('beneficiarios').select('*').order('segmento').order('nombre'),
    admin.from('asignaciones').select('*, catalogo_insumos(*)'),
    admin.from('proveedores').select('*').order('nombre'),
    admin.from('precios_proveedor').select('*'),
    admin.from('fotos_compra').select('*').order('uploaded_at', { ascending: true }),
    // El catálogo completo, no solo los insumos que están en algún carrito:
    // la vara del saldo gastable es el polín, y un socio a medio cargar
    // puede no tener ninguno.
    admin.from('catalogo_insumos').select('*'),
  ])

  const error = e1 || e2 || e3 || e4 || e5 || e6
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

  const insumosCatalogo = (catalogo ?? []) as CatalogoInsumo[]

  const visibles = ((beneficiarios ?? []) as BeneficiarioRow[]).filter(ben => !esDePrueba(ben))

  // Proveedor de referencia del programa: Sodimac (ver proveedorPorDefecto).
  // Es el mismo que muestra el selector de /beneficiarios, para que las dos
  // pantallas no puedan discrepar sobre el mismo socio. Solo se consideran
  // los activos: un proveedor dado de baja no puede ser la referencia.
  const referencia = proveedorPorDefecto(provs.filter(p => p.es_activo)) ?? null

  const filas: FilaRendicion[] = visibles.map(ben => {
    const asigs = asignacionesPorBen.get(ben.id) ?? []

    // Quién valoriza el carrito: el proveedor de compra confirmado si ya se
    // eligió, y si no el de referencia. Nunca un "más barato" calculado.
    const proveedorCotizador = ben.proveedor_compra_id
      ? (provPorId.get(ben.proveedor_compra_id) ?? null)
      : referencia
    // Un solo total por socio: el carrito entero contra su presupuesto. Todo
    // lo que pasa de ahí es aporte propio (regla del 2026-09-14, que
    // reemplazó a la marca `es_extra`). /beneficiarios calcula lo mismo.
    const cot = cotizarCarrito(asigs, proveedorCotizador, precioMap)

    // Cotización línea a línea del carrito real, con el mismo proveedor que
    // da el total: si difirieran, la suma del detalle no cuadraría con él.
    const proveedorParaItems = proveedorCotizador?.id ?? null
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
      proveedorNombre: referencia?.nombre ?? null,
      proveedorCompraId: ben.proveedor_compra_id,
      proveedorCompraNombre: ben.proveedor_compra_id
        ? (provPorId.get(ben.proveedor_compra_id)?.nombre ?? null)
        : null,
      total: cot.total,
      itemsSinPrecio: cot.itemsSinPrecio,
      totalEsCompleto: cot.totalEsCompleto,
      aporteBolsillo: aporteDeBolsillo(cot, ben.presupuesto_base),
      // Con el MISMO proveedor que dio el total: medir el saldo con el precio
      // de otro diría "le alcanza para 2 polines más" sobre una compra que
      // nadie va a hacer a ese precio.
      precioPolin: precioPolinDeReferencia(proveedorCotizador?.id ?? null, insumosCatalogo, precioMap),
      items,
      fotos: fotosBen.map(f => ({ id: f.id, r2_key: f.r2_key, uploaded_at: f.uploaded_at })),
      fotosCount: fotosBen.length,
      compraCompleta: ben.compra_completa,
      compraCompletaAt: ben.compra_completa_at,
    }
  })

  // El mapa de nombres (provPorId) se arma con todos, para que un proveedor
  // desactivado despues de una compra siga teniendo nombre; el selector solo
  // ofrece los activos.
  return { ok: true, filas, proveedores: provs.filter(p => p.es_activo) }
}


/** Foto ya lista para el navegador: la key de R2 reemplazada por URLs
 *  firmadas de lectura. `thumbUrl` es la version de 800px que va en la
 *  grilla; `url`, la de 2400px del lightbox (ver lib/imagen.ts). En una foto
 *  vieja, sin miniatura, las dos son la misma. */
export type FotoFirmada = { id: string; uploaded_at: string; url: string; thumbUrl: string }
export type FilaRendicionUI = Omit<FilaRendicion, 'fotos'> & { fotos: FotoFirmada[] }

// Una hora, no cinco minutos: staff deja la pantalla de rendición abierta
// mientras recorre socios en terreno, y con TTL de 300s las miniaturas ya
// cargadas se caían al abrir el lightbox un rato después.
const TTL_LECTURA_SEGUNDOS = 3600

/** Misma agregación que cargarRendicion(), con las fotos ya firmadas. La
 *  consumen la página server-side app/rendicion/page.tsx y /api/rendicion
 *  (que sigue existiendo para el reintento desde el cliente). */
export async function cargarRendicionUI(): Promise<
  | { ok: true; filas: FilaRendicionUI[]; proveedores: Proveedor[] }
  | { ok: false; error: unknown }
> {
  const res = await cargarRendicion()
  if (!res.ok) return res

  const filas = await Promise.all(
    res.filas.map(async ({ fotos, ...resto }) => ({
      ...resto,
      fotos: await Promise.all(
        fotos.map(async f => ({
          id: f.id,
          uploaded_at: f.uploaded_at,
          ...(await urlsFirmadasFoto(f.r2_key, TTL_LECTURA_SEGUNDOS)),
        }))
      ),
    }))
  )

  return { ok: true, filas, proveedores: res.proveedores }
}
