import type { Beneficiario, CatalogoInsumo, Asignacion, ResultadoSimulacion, KPISimulacion, PrecioProveedor, Proveedor } from './types'

export const PRESUPUESTO_BASE = 189000
export const METROS_POLY_MIN = 20

export function formatCLP(amount: number): string {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(amount)
}

// Construye un mapa flat: `${provId}_${insumoId}` → precio | null
export function buildPrecioMap(precios: PrecioProveedor[]): Map<string, number | null> {
  const map = new Map<string, number | null>()
  for (const p of precios) map.set(`${p.proveedor_id}_${p.insumo_id}`, p.precio_unitario)
  return map
}

function getPrecio(map: Map<string, number | null>, provId: string, insumoId: string): number | null {
  return map.has(`${provId}_${insumoId}`) ? map.get(`${provId}_${insumoId}`) ?? null : null
}

function errorResult(beneficiario: Beneficiario, msg: string): ResultadoSimulacion {
  return { beneficiario, error: msg, polines: 0, volumen_total: 0, gasto_total: 0, aporte_bolsillo: 0 }
}

export function simularBeneficiario(
  beneficiario: Beneficiario,
  proveedorId: string,
  precioMap: Map<string, number | null>,
  insumos: CatalogoInsumo[],
  // Base requirements for this beneficiary (es_requerimiento_base = true)
  asignacionesBase: Asignacion[]
): ResultadoSimulacion {
  const presupuesto = beneficiario.presupuesto_base
  const polin34 = insumos.find(i => i.nombre === 'Polines (3 a 4 cm)')
  if (!polin34) return errorResult(beneficiario, 'Catálogo incompleto')

  const precioPolin = getPrecio(precioMap, proveedorId, polin34.id)
  if (precioPolin === null) return errorResult(beneficiario, `Sin precio: ${polin34.nombre}`)

  if (beneficiario.segmento === 'Invernadero') {
    const poly = insumos.find(i => i.nombre.startsWith('Polietileno'))
    if (!poly) return errorResult(beneficiario, 'Catálogo incompleto')
    const precioPoly = getPrecio(precioMap, proveedorId, poly.id)
    if (precioPoly === null) return errorResult(beneficiario, `Sin precio: ${poly.nombre}`)

    const costoBase = METROS_POLY_MIN * precioPoly
    const saldo = presupuesto - costoBase
    const polines = saldo > 0 ? Math.floor(saldo / precioPolin) : 0
    const gastoTotal = costoBase + polines * precioPolin

    return {
      beneficiario, error: null,
      polines,
      volumen_total: METROS_POLY_MIN + polines,
      gasto_total: gastoTotal,
      aporte_bolsillo: Math.max(0, gastoTotal - presupuesto),
    }
  }

  // Cierre Perimetral: necesita malla base asignada
  const malaAsig = asignacionesBase.find(a => a.es_requerimiento_base)
  if (!malaAsig) return errorResult(beneficiario, 'Sin malla asignada')

  const malla = insumos.find(i => i.id === malaAsig.insumo_id)
  if (!malla) return errorResult(beneficiario, 'Malla no en catálogo')

  const precioMalla = getPrecio(precioMap, proveedorId, malla.id)
  if (precioMalla === null) return errorResult(beneficiario, `Sin precio: ${malla.nombre}`)

  const costoBase = malaAsig.cantidad * precioMalla
  const saldo = presupuesto - costoBase
  const polines = saldo > 0 ? Math.floor(saldo / precioPolin) : 0
  const gastoTotal = costoBase + polines * precioPolin

  return {
    beneficiario, error: null,
    polines,
    volumen_total: malaAsig.cantidad + polines,
    gasto_total: gastoTotal,
    aporte_bolsillo: Math.max(0, gastoTotal - presupuesto),
  }
}

export function calcularKPI(
  proveedor: Proveedor,
  beneficiarios: Beneficiario[],
  precioMap: Map<string, number | null>,
  insumos: CatalogoInsumo[],
  asignacionesPorBen: Record<string, Asignacion[]>
): KPISimulacion {
  const resultados = beneficiarios.map(ben =>
    simularBeneficiario(ben, proveedor.id, precioMap, insumos, asignacionesPorBen[ben.id] ?? [])
  )
  const exitosos = resultados.filter(r => r.error === null)
  return {
    proveedor,
    resultados,
    volumen_total_comunidad: exitosos.reduce((s, r) => s + r.volumen_total, 0),
    aporte_bolsillo_total: resultados.reduce((s, r) => s + r.aporte_bolsillo, 0),
    socios_con_error: resultados.filter(r => r.error !== null).length,
    es_ganador: false, // se calcula después comparando KPIs
  }
}

// Calcula costos de un carrito con los precios de un proveedor
export function calcularCostoCarrito(
  asignaciones: Asignacion[],
  proveedorId: string,
  precioMap: Map<string, number | null>
): { total: number; itemsConPrecio: number; itemsSinPrecio: number } {
  let total = 0
  let itemsConPrecio = 0
  let itemsSinPrecio = 0
  for (const a of asignaciones) {
    const precio = getPrecio(precioMap, proveedorId, a.insumo_id)
    if (precio !== null) { total += a.cantidad * precio; itemsConPrecio++ }
    else itemsSinPrecio++
  }
  return { total, itemsConPrecio, itemsSinPrecio }
}
