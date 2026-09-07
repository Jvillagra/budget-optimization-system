import type { Beneficiario, CatalogoInsumo, Asignacion, AyudaMemoria, ResultadoSimulacion, KPISimulacion, PrecioProveedor, Proveedor } from './types'

/** Presupuesto por defecto del programa. Es solo el DEFAULT de la columna
 *  beneficiarios.presupuesto_base: nunca debe usarse para mostrar ni calcular
 *  el presupuesto de un socio concreto -- para eso está su propia fila. */
export const PRESUPUESTO_BASE = 189000

/** Metros de polietileno que lleva todo invernadero antes de repartir el
 *  saldo en polines. Definido por la ficha técnica del proyecto PAT (rollo
 *  de 20 m por invernadero); si cambia el estándar, cambia acá y en
 *  __tests__/business-logic.test.ts, que fija el número a propósito. */
export const METROS_POLY_MIN = 20

/** Rollos de malla que lleva todo cierre perimetral (uno por socio, misma
 *  ficha técnica). */
export const ROLLOS_MALLA = 1

export function formatCLP(amount: number): string {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(amount)
}

/** Normaliza para comparar nombres de catálogo: sin acentos, sin dobles
 *  espacios, en minúsculas. El cálculo del programa dependía de comparar
 *  strings exactos ('Polines (3 a 4 cm)'), así que un espacio de más o una
 *  tilde corregida en el catálogo dejaba a los 29 socios en
 *  "Catálogo incompleto". */
export function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

// Familias de insumo. Sigue siendo acoplamiento por nombre -- la solución de
// fondo es una columna `categoria` en catalogo_insumos -- pero ahora vive en
// UN lugar, es tolerante a tildes/espacios y falla de forma explícita.
const PREFIJO_POLINES = 'polines'
const PREFIJO_POLIETILENO = 'polietileno'

export function esPolines(insumo: CatalogoInsumo): boolean {
  return normalizar(insumo.nombre).startsWith(PREFIJO_POLINES)
}
export function esPolietileno(insumo: CatalogoInsumo): boolean {
  return normalizar(insumo.nombre).startsWith(PREFIJO_POLIETILENO)
}

/** Elige de forma determinista entre varios candidatos (orden estable por
 *  nombre y luego id): el `find` anterior dependía del orden en que Postgres
 *  devolviera las filas, que no está garantizado sin ORDER BY. */
function primeroEstable(candidatos: CatalogoInsumo[]): CatalogoInsumo | null {
  if (candidatos.length === 0) return null
  return [...candidatos].sort((a, b) =>
    normalizar(a.nombre).localeCompare(normalizar(b.nombre)) || a.id.localeCompare(b.id)
  )[0]
}

export function buildPrecioMap(precios: PrecioProveedor[]): Map<string, number | null> {
  const map = new Map<string, number | null>()
  for (const p of precios) map.set(`${p.proveedor_id}_${p.insumo_id}`, p.precio_unitario)
  return map
}

/** null = no hay precio cotizado. 0 es un precio válido (insumo donado o
 *  incluido), no una falta de dato: el `if (!precio)` anterior los confundía
 *  y sacaba al socio de la simulación con "Sin precio". */
function getPrecio(map: Map<string, number | null>, provId: string, insumoId: string): number | null {
  const v = map.get(`${provId}_${insumoId}`)
  return v === undefined || v === null ? null : v
}

function errorResult(beneficiario: Beneficiario, msg: string): ResultadoSimulacion {
  return { beneficiario, error: msg, insumo_base_id: null, insumo_base_nombre: null, insumo_base_cantidad: 0, polines: 0, volumen_total: 0, gasto_total: 0, aporte_bolsillo: 0 }
}

/** Cuántos polines caben en el saldo. Con precio 0 el saldo nunca se agota:
 *  se devuelve 0 en vez de Infinity, que propagaba NaN a todos los KPI. */
function polinesQueCaben(saldo: number, precioPolin: number): number {
  if (saldo <= 0 || precioPolin <= 0) return 0
  return Math.floor(saldo / precioPolin)
}

export function simularBeneficiario(
  beneficiario: Beneficiario,
  proveedorId: string,
  precioMap: Map<string, number | null>,
  insumos: CatalogoInsumo[],
  ayudaMemoria: AyudaMemoria[]
): ResultadoSimulacion {
  const presupuesto = beneficiario.presupuesto_base
  const polin34 = primeroEstable(insumos.filter(esPolines))
  if (!polin34) return errorResult(beneficiario, 'Catálogo incompleto: no hay polines')

  const precioPolin = getPrecio(precioMap, proveedorId, polin34.id)
  if (precioPolin === null) return errorResult(beneficiario, `Sin precio: ${polin34.nombre}`)

  if (beneficiario.segmento === 'Invernadero') {
    const poly = primeroEstable(insumos.filter(esPolietileno))
    if (!poly) return errorResult(beneficiario, 'Catálogo incompleto: no hay polietileno')
    const precioPoly = getPrecio(precioMap, proveedorId, poly.id)
    if (precioPoly === null) return errorResult(beneficiario, `Sin precio: ${poly.nombre}`)

    const costoBase = METROS_POLY_MIN * precioPoly
    const polines = polinesQueCaben(presupuesto - costoBase, precioPolin)
    const gastoTotal = costoBase + polines * precioPolin

    return {
      beneficiario, error: null,
      insumo_base_id: poly.id,
      insumo_base_nombre: poly.nombre,
      insumo_base_cantidad: METROS_POLY_MIN,
      polines,
      volumen_total: METROS_POLY_MIN + polines,
      gasto_total: gastoTotal,
      aporte_bolsillo: Math.max(0, gastoTotal - presupuesto),
    }
  }

  // Cierre Perimetral: la malla sale de la ayuda memoria del socio (1 rollo).
  // Antes se tomaba la primera entrada que no fuera polín ni polietileno,
  // en el orden arbitrario de Postgres: con dos mallas en ayuda memoria el
  // resultado podía cambiar entre cargas. Ahora la elección es estable.
  const mallasCandidatas = ayudaMemoria
    .map(am => insumos.find(i => i.id === am.insumo_id))
    .filter((i): i is CatalogoInsumo => Boolean(i) && !esPolines(i!) && !esPolietileno(i!))
  const malla = primeroEstable(mallasCandidatas)

  if (!malla) {
    // Socio sin malla en ayuda memoria: solo polines con presupuesto completo
    const polines = polinesQueCaben(presupuesto, precioPolin)
    const gastoTotal = polines * precioPolin
    return {
      beneficiario, error: null,
      insumo_base_id: null,
      insumo_base_nombre: null,
      insumo_base_cantidad: 0,
      polines,
      volumen_total: polines,
      gasto_total: gastoTotal,
      aporte_bolsillo: Math.max(0, gastoTotal - presupuesto),
    }
  }

  const precioMalla = getPrecio(precioMap, proveedorId, malla.id)
  if (precioMalla === null) return errorResult(beneficiario, `Sin precio: ${malla.nombre}`)

  const costoBase = ROLLOS_MALLA * precioMalla
  const polines = polinesQueCaben(presupuesto - costoBase, precioPolin)
  const gastoTotal = costoBase + polines * precioPolin

  return {
    beneficiario, error: null,
    insumo_base_id: malla.id,
    insumo_base_nombre: malla.nombre,
    insumo_base_cantidad: ROLLOS_MALLA,
    polines,
    volumen_total: ROLLOS_MALLA + polines,
    gasto_total: gastoTotal,
    aporte_bolsillo: Math.max(0, gastoTotal - presupuesto),
  }
}

export function calcularKPI(
  proveedor: Proveedor,
  beneficiarios: Beneficiario[],
  precioMap: Map<string, number | null>,
  insumos: CatalogoInsumo[],
  ayudaMemoriaPorBen: Record<string, AyudaMemoria[]>
): KPISimulacion {
  const resultados = beneficiarios.map(ben =>
    simularBeneficiario(ben, proveedor.id, precioMap, insumos, ayudaMemoriaPorBen[ben.id] ?? [])
  )
  const exitosos = resultados.filter(r => r.error === null)
  return {
    proveedor,
    resultados,
    volumen_total_comunidad: exitosos.reduce((s, r) => s + r.volumen_total, 0),
    aporte_bolsillo_total: resultados.reduce((s, r) => s + r.aporte_bolsillo, 0),
    socios_con_error: resultados.filter(r => r.error !== null).length,
    es_ganador: false,
  }
}

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

export interface MejorProveedor {
  proveedor: Proveedor | null
  total: number
  itemsSinPrecio: number
  /** true si el total es una cotización completa del carrito. false cuando
   *  faltan precios o cuando no hay carrito: en esos casos `total` NO es un
   *  total, es una suma parcial y quien lo muestre debe decirlo. */
  totalEsCompleto: boolean
}

/**
 * "Mejor proveedor calculado": el que cotiza el carrito completo al menor
 * total; si ninguno cotiza el 100%, el que cubre más ítems (y, en empate de
 * ambos, el de nombre alfabéticamente menor, para que sea determinista).
 *
 * Vivía duplicado literal en /api/rendicion y en /api/admin/informe-consultora:
 * arreglar el criterio en uno dejaba el PDF que va a la consultora auditora
 * con el criterio viejo. Es una estimación de reporte, NUNCA la fuente de
 * verdad transaccional -- para eso está beneficiarios.proveedor_compra_id.
 */
export function elegirMejorProveedor(
  asignaciones: Asignacion[],
  proveedores: Proveedor[],
  precioMap: Map<string, number | null>
): MejorProveedor {
  // Sin carrito no hay proveedor que elegir. Antes todos empataban en
  // total 0 / 0 ítems sin precio y "ganaba" el primero: se reportaba
  // "Proveedor X — $0" como si fuera un hecho, y el PDF sumaba ese cero al
  // total general sin que nadie notara que faltaba el carrito.
  if (asignaciones.length === 0 || proveedores.length === 0) {
    return { proveedor: null, total: 0, itemsSinPrecio: asignaciones.length, totalEsCompleto: false }
  }

  let mejor: MejorProveedor = { proveedor: null, total: 0, itemsSinPrecio: asignaciones.length, totalEsCompleto: false }

  for (const prov of proveedores) {
    const { total, itemsSinPrecio } = calcularCostoCarrito(asignaciones, prov.id, precioMap)
    const gana =
      !mejor.proveedor ||
      itemsSinPrecio < mejor.itemsSinPrecio ||
      (itemsSinPrecio === mejor.itemsSinPrecio && total < mejor.total) ||
      (itemsSinPrecio === mejor.itemsSinPrecio && total === mejor.total &&
        prov.nombre.localeCompare(mejor.proveedor.nombre) < 0)
    if (gana) mejor = { proveedor: prov, total, itemsSinPrecio, totalEsCompleto: itemsSinPrecio === 0 }
  }

  return mejor
}
