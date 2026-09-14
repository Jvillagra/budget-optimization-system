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
const PREFIJO_MALLA = 'malla'

export type FamiliaInsumo = 'polines' | 'polietileno' | 'malla' | 'otro'

/** A qué familia pertenece un insumo, deducido de cómo empieza su nombre.
 *  ES LA ÚNICA definición: las tres funciones de abajo la consultan, y
 *  /api/catalogo-insumos la usa para no dejar que un renombre cambie la
 *  familia sin querer -- de eso dependen la simulación entera, el ajuste al
 *  presupuesto y la revisión de carritos. */
export function familiaDeNombre(nombre: string): FamiliaInsumo {
  const n = normalizar(nombre)
  if (n.startsWith(PREFIJO_POLINES)) return 'polines'
  if (n.startsWith(PREFIJO_POLIETILENO)) return 'polietileno'
  if (n.startsWith(PREFIJO_MALLA)) return 'malla'
  return 'otro'
}

export function esPolines(insumo: CatalogoInsumo): boolean {
  return familiaDeNombre(insumo.nombre) === 'polines'
}
export function esPolietileno(insumo: CatalogoInsumo): boolean {
  return familiaDeNombre(insumo.nombre) === 'polietileno'
}

/** Familia "malla" por nombre, igual que las otras dos. La usa la revisión
 *  de carritos, que compara rollos de malla entre socios. Acepta el nombre
 *  suelto y no un CatalogoInsumo porque ahí lo único que llega es el nombre
 *  del ítem cotizado. */
export function esNombreDeMalla(nombre: string): boolean {
  return familiaDeNombre(nombre) === 'malla'
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

/** Proveedor con el que se valoriza el programa cuando nadie eligió uno a
 *  mano: Sodimac, por decisión del proyecto PAT (es quien cotiza los polines,
 *  el insumo que define la simulación y que todos los socios llevan). Si no
 *  existiera, el primero de la lista.
 *
 *  Vive acá, y no en lib/proveedor-context.tsx, porque lo necesitan tanto el
 *  cliente (el selector "ver precios de" en /beneficiarios y /mi-dashboard)
 *  como el servidor (la rendición). Con la definición duplicada, /rendición y
 *  /beneficiarios podían mostrar proveedores distintos para el mismo socio --
 *  que es exactamente lo que pasaba con Marcia Catrilef. */
export function proveedorPorDefecto<T extends { id: string; nombre: string }>(proveedores: T[]): T | undefined {
  return proveedores.find(p => p.nombre.trim().toLowerCase().includes('sodimac')) ?? proveedores[0]
}

export interface CotizacionCarrito {
  proveedor: Proveedor | null
  total: number
  itemsSinPrecio: number
  /** true si el total es una cotización completa del carrito. false cuando
   *  faltan precios o cuando no hay carrito: en esos casos `total` NO es un
   *  total, es una suma parcial y quien lo muestre debe decirlo. */
  totalEsCompleto: boolean
}

/**
 * Valoriza el carrito de un socio con UN proveedor dado.
 *
 * Reemplaza a `elegirMejorProveedor()` (borrada el 2026-09-13), que elegía
 * sola al proveedor más barato que cotizara el carrito completo. Ese criterio
 * automático era el origen de la incongruencia entre pantallas: Agrícola
 * Pucón tenía los polines en $0 (dato malo, corregido en la migración 011) y
 * ganaba siempre, así que /rendición reportaba un proveedor distinto del que
 * el staff estaba mirando en /beneficiarios, para el mismo socio y el mismo
 * carrito. Quién es el proveedor ahora es una DECISIÓN (compra confirmada, o
 * el de referencia), no un resultado de cálculo.
 */
export function cotizarCarrito(
  asignaciones: Asignacion[],
  proveedor: Proveedor | null,
  precioMap: Map<string, number | null>
): CotizacionCarrito {
  // Sin carrito no hay nada que cotizar: `total` 0 con `totalEsCompleto`
  // false, para que nadie reporte "$0" como si fuera un hecho ni lo sume al
  // total general del informe.
  if (!proveedor || asignaciones.length === 0) {
    return { proveedor, total: 0, itemsSinPrecio: asignaciones.length, totalEsCompleto: false }
  }

  const { total, itemsSinPrecio } = calcularCostoCarrito(asignaciones, proveedor.id, precioMap)
  return { proveedor, total, itemsSinPrecio, totalEsCompleto: itemsSinPrecio === 0 }
}

/** Lo que el socio tiene que poner de su bolsillo: todo lo que su compra pasa
 *  del presupuesto del programa. Es la cifra que María Inés le cobra.
 *
 *  Devuelve null cuando el total es parcial (faltan precios o no hay carrito):
 *  un aporte calculado sobre una suma incompleta es más bajo que el real, y
 *  cobrarlo dejaría el déficit escondido. */
export function aporteDeBolsillo(cot: { total: number; totalEsCompleto: boolean }, presupuestoBase: number): number | null {
  if (!cot.totalEsCompleto) return null
  return Math.max(0, cot.total - presupuestoBase)
}

/** Correo del socio de QA. OBSOLETO como fuente de verdad: desde la
 *  migración 009 la marca es la columna `beneficiarios.es_prueba`, para que
 *  una query directa a la tabla vea lo mismo que la app y los conteos
 *  cuadren. Queda solo como respaldo del filtro de abajo; una vez aplicada
 *  009 en todos los entornos se puede borrar junto con su `||`. */
export const EMAIL_QA_SOCIO = 'neurobotinnovations@gmail.com'

/** Fila de QA que vive a propósito en la tabla real de beneficiarios
 *  (`__TEST_QA_SOCIO__`), para poder probar login y subida de fotos sin
 *  inventar un socio falso. Desde la migración 009 la marca es la columna
 *  `es_prueba`; el filtro por email queda de respaldo por si 009 no se
 *  aplicó todavía en algún entorno.
 *
 *  Vive acá, y no en cada consulta, porque la condición estaba escrita tres
 *  veces sin compartir código (rendicion-data, staff-data, ajuste-carritos).
 *  Mientras coincidan no se nota; en cuanto una cambie, una pantalla dice 29
 *  socios y otra 30 -- el mismo bug que originó este proyecto. */
export function esDePrueba(ben: { es_prueba?: boolean; email?: string | null }): boolean {
  return ben.es_prueba === true || (ben.email?.toLowerCase() ?? null) === EMAIL_QA_SOCIO
}

// ---------------------------------------------------------------------------
// Ajuste del carrito al presupuesto.
//
// El presupuesto de cada socio es FIJO ($189.000). Lo que varía son las
// cantidades: si sube el precio de un material, el socio compra menos. Hasta
// la migración 014 esto era cierto solo en /simulador, sobre datos
// hipotéticos; los carritos reales se editaban a mano y quedaban sobre
// presupuesto en silencio cuando cambiaba un precio (13 de 29 socios el
// 2026-09-14, el mayor en $190.450).
//
// El orden en que ceden las cosas NO es arbitrario, y es el único punto de
// este archivo donde conviene detenerse:
//
//   1. Las líneas `es_extra` no se tocan NUNCA. Son lo que el socio decidió
//      pagar de su bolsillo; bajárselas automáticamente sería decidir por él.
//   2. Los materiales base (malla, polietileno) bajan proporcionalmente, y
//      truncados a unidades enteras: media malla no se puede comprar.
//   3. Los polines absorben el resto. Son el saldo del programa -- la regla
//      de siempre (ver polinesQueCaben y la nota de revisarCarritos): lo que
//      queda después del material base se gasta en polines.
//
// Es simétrico a propósito: si un precio BAJA, los polines SUBEN hasta gastar
// el presupuesto. El presupuesto es lo que hay para gastar, no un techo que
// convenga dejar sin usar.

/** Una línea de carrito lista para ajustar. Se separa de `Asignacion` porque
 *  el ajuste necesita saber si la línea es polín, y eso vive en el catálogo. */
export interface LineaAjustable {
  insumo_id: string
  cantidad: number
  es_extra: boolean
  insumo: CatalogoInsumo
}

export interface CambioDeLinea {
  insumo_id: string
  nombre: string
  cantidad_antes: number
  cantidad_despues: number
}

export interface AjusteCarrito {
  /** Solo las líneas cuya cantidad cambia. Vacío = no hay nada que hacer. */
  cambios: CambioDeLinea[]
  /** Costo de las líneas financiadas por el programa, antes y después. */
  totalAntes: number
  totalDespues: number
  /** Saldo del presupuesto que queda sin gastar (no hay polines donde
   *  ponerlo, o lo que queda no alcanza para uno). */
  saldoSinUsar: number
  /** Por qué no se pudo ajustar. Si viene, `cambios` está vacío y NADIE debe
   *  escribir nada: ajustar sobre un carrito que no se puede cotizar entero
   *  daría cantidades calculadas sobre un total falso. */
  error: string | null
}

/** Cuántas unidades de un material caben en un saldo. Con precio 0 devuelve 0:
 *  un insumo donado es gratis de verdad, pero el saldo no se agota nunca y
 *  "caben infinitas" no es una respuesta que se pueda comprar. */
function unidadesQueCaben(saldo: number, precioUnitario: number): number {
  if (saldo <= 0 || precioUnitario <= 0) return 0
  return Math.floor(saldo / precioUnitario)
}

/**
 * Calcula las cantidades que dejan el carrito dentro del presupuesto.
 *
 * NO escribe nada: devuelve lo que habría que cambiar. Quien llame decide si
 * lo aplica, lo propone o solo lo informa.
 */
export function ajustarCarritoAPresupuesto(
  lineas: LineaAjustable[],
  proveedorId: string,
  precioMap: Map<string, number | null>,
  presupuesto: number
): AjusteCarrito {
  const vacio = (error: string | null, totalAntes = 0): AjusteCarrito =>
    ({ cambios: [], totalAntes, totalDespues: totalAntes, saldoSinUsar: 0, error })

  const financiadas = lineas.filter(l => !l.es_extra)
  if (financiadas.length === 0) return vacio(null)

  // Un solo precio faltante invalida el ajuste entero: el total sería parcial
  // y las cantidades saldrían calculadas contra un presupuesto que en realidad
  // ya está comprometido. Mismo criterio que aporteDeBolsillo.
  const sinPrecio = financiadas.filter(l => getPrecio(precioMap, proveedorId, l.insumo_id) === null)
  if (sinPrecio.length > 0) {
    return vacio(`Sin precio: ${sinPrecio.map(l => l.insumo.nombre).join(', ')}`)
  }

  const precioDe = (l: LineaAjustable) => getPrecio(precioMap, proveedorId, l.insumo_id) as number
  const costoDe = (ls: LineaAjustable[]) => ls.reduce((t, l) => t + l.cantidad * precioDe(l), 0)

  const polines = financiadas.filter(l => esPolines(l.insumo))
  const base = financiadas.filter(l => !esPolines(l.insumo))
  const totalAntes = costoDe(financiadas)

  // 2. El material base cede solo si por sí solo ya no cabe.
  const nuevaCantidadBase = new Map<string, number>()
  let costoBase = costoDe(base)
  if (costoBase > presupuesto) {
    const factor = presupuesto / costoBase
    for (const l of base) nuevaCantidadBase.set(l.insumo_id, Math.floor(l.cantidad * factor))
    costoBase = base.reduce((t, l) => t + (nuevaCantidadBase.get(l.insumo_id) as number) * precioDe(l), 0)
  } else {
    for (const l of base) nuevaCantidadBase.set(l.insumo_id, l.cantidad)
  }

  // 3. Los polines se llevan el saldo. Si hay más de una línea de polines
  // (catálogo con duplicados), la primera estable se lleva el saldo y las
  // demás quedan en cero: repartir entre líneas indistinguibles sería
  // inventar un criterio que el programa no tiene.
  const saldo = presupuesto - costoBase
  const nuevaCantidadPolin = new Map<string, number>()
  const polinPrincipal = primeroEstable(polines.map(l => l.insumo))
  for (const l of polines) nuevaCantidadPolin.set(l.insumo_id, 0)
  let saldoSinUsar = saldo
  if (polinPrincipal) {
    const linea = polines.find(l => l.insumo_id === polinPrincipal.id) as LineaAjustable
    const cabe = unidadesQueCaben(saldo, precioDe(linea))
    nuevaCantidadPolin.set(linea.insumo_id, cabe)
    saldoSinUsar = saldo - cabe * precioDe(linea)
  }

  const cambios: CambioDeLinea[] = []
  for (const l of financiadas) {
    const despues = (esPolines(l.insumo) ? nuevaCantidadPolin : nuevaCantidadBase).get(l.insumo_id) ?? l.cantidad
    if (despues !== l.cantidad) {
      cambios.push({ insumo_id: l.insumo_id, nombre: l.insumo.nombre, cantidad_antes: l.cantidad, cantidad_despues: despues })
    }
  }

  const totalDespues = financiadas.reduce((t, l) => {
    const c = (esPolines(l.insumo) ? nuevaCantidadPolin : nuevaCantidadBase).get(l.insumo_id) ?? l.cantidad
    return t + c * precioDe(l)
  }, 0)

  return { cambios, totalAntes, totalDespues, saldoSinUsar: Math.max(0, saldoSinUsar), error: null }
}

/** Un cambio de precio de esta magnitud no se aplica solo. Un cero de más al
 *  teclear reescribiría los 29 carritos de una vez, y en este proyecto ya
 *  pasó que un dato malo (el 0 de Agrícola Pucón) rompiera el cálculo sin que
 *  nadie lo notara por días.
 *
 *  50% y no 25%: el 2026-09-14 subieron de verdad la Malla Ursus 80 de 67.475
 *  a 85.419 (+26%) y la Ursus 100 un 27%. Con un umbral de 25% esas subidas
 *  reales habrían pedido confirmación, que es justo la fricción que hace que
 *  la gente apruebe sin mirar. Lo que hay que frenar es el error de tipeo, y
 *  ese no se equivoca por un cuarto: se equivoca por un cero. */
export const UMBRAL_CAMBIO_PRECIO = 0.5

/** true si pasar de `antes` a `despues` es demasiado grande como para
 *  reajustar carritos sin que una persona lo confirme. Estrenar un precio
 *  (null -> algo) o borrarlo nunca es "sospechoso": no hay con qué comparar. */
export function cambioDePrecioEsGrande(antes: number | null, despues: number | null): boolean {
  if (antes === null || despues === null) return false
  if (antes === 0) return despues !== 0
  return Math.abs(despues - antes) / antes > UMBRAL_CAMBIO_PRECIO
}

// ---------------------------------------------------------------------------
// Revisión automática de carritos: las reglas que marcan un carrito como
// "raro" para que alguien lo confirme con el socio ANTES de comprar.
//
// Nació de una revisión a mano de los 29 socios (2026-09-13) que encontró
// carritos a medio cargar y cantidades fuera de lo común. Hacerla a mano no
// escala ni se repite: acá las reglas corren solas cada vez que se abre la
// pestaña, sobre los datos del momento.
//
// Ninguna regla corrige nada. Marcan y explican: la respuesta la tiene el
// socio, no el sistema.

/**
 * Precio del polín con el que se mide si a un socio le sobra presupuesto
 * GASTABLE. El polín es la vara correcta porque es donde va el saldo por
 * diseño del programa: la simulación compra primero la malla (o el
 * polietileno) y mete en polines todo lo que sobra -- ver polinesQueCaben.
 *
 * Reemplaza al umbral fijo de "menos del 80% del presupuesto" (borrado el
 * 2026-09-14). Ese porcentaje dejó de medir lo que decía cuando el ajuste
 * automático (migración 014) llevó a los 29 socios a usar entre el 98% y el
 * 99,7%: lo que les sobra son $571 a $3.350, menos que un polín, así que no
 * es descuido sino vuelto. Un umbral en pesos derivado del catálogo no hay
 * que volver a moverlo cuando cambien los precios o el presupuesto.
 *
 * Solo insumos activos: un polín dado de baja (migración 013) no se puede
 * comprar, y el del catálogo que quedó inactivo no tiene precio, con lo que
 * la regla no se dispararía nunca.
 *
 * Devuelve null si no hay con qué medir -- sin proveedor, sin polín activo o
 * sin precio cotizado -- y entonces no se afirma nada. Un polín en 0 (donado)
 * también da null: con precio 0 siempre "alcanza para otro más" y la regla
 * marcaría a los 29 socios en cada carga.
 */
export function precioPolinDeReferencia(
  proveedorId: string | null,
  insumos: CatalogoInsumo[],
  precioMap: Map<string, number | null>
): number | null {
  if (!proveedorId) return null
  const polin = primeroEstable(insumos.filter(i => i.es_activo !== false && esPolines(i)))
  if (!polin) return null
  const precio = getPrecio(precioMap, proveedorId, polin.id)
  return precio !== null && precio > 0 ? precio : null
}

/** Desvío contra la mediana de su segmento a partir del cual los rollos de
 *  malla se consideran fuera de lo normal. */
export const DESVIO_MALLA = 0.5

/** Mínimo de socios con malla en el segmento para que exista una "cantidad
 *  normal" contra la cual comparar. Con dos carritos no hay normalidad. */
const MINIMO_PARA_COMPARAR = 3

export interface CarritoRevisable {
  id: string
  nombre: string
  segmento: string
  presupuestoBase: number
  total: number
  totalEsCompleto: boolean
  itemsSinPrecio: number
  /** Precio de un polín con el proveedor que cotiza ESTE carrito, que es la
   *  unidad mínima con la que se puede seguir gastando el saldo. null cuando
   *  no se puede saber: ver precioPolinDeReferencia. */
  precioPolin: number | null
  items: { insumoNombre: string; cantidad: number }[]
}

export type MotivoCaso = 'sin_carrito' | 'sin_precio' | 'presupuesto_sin_usar' | 'mallas_fuera_de_rango'

export interface Hallazgo {
  motivo: MotivoCaso
  severidad: 'alta' | 'media'
  /** Qué pasa, en una línea. */
  titulo: string
  /** La cifra que lo respalda. Nunca un juicio: el número y nada más. */
  detalle: string
  /** Qué hay que preguntarle al socio. */
  pregunta: string
}

export interface CasoRevision {
  id: string
  nombre: string
  segmento: string
  severidad: 'alta' | 'media'
  hallazgos: Hallazgo[]
}

function mediana(valores: number[]): number {
  const orden = [...valores].sort((a, b) => a - b)
  const medio = Math.floor(orden.length / 2)
  return orden.length % 2 === 0 ? (orden[medio - 1] + orden[medio]) / 2 : orden[medio]
}

function rollosDeMalla(c: CarritoRevisable): number {
  return c.items.reduce((s, i) => s + (esNombreDeMalla(i.insumoNombre) ? i.cantidad : 0), 0)
}

/**
 * Mediana de rollos de malla por segmento, contando SOLO a los socios que
 * llevan malla: incluir a los que no llevan ninguna hundiría la mediana y
 * marcaría como raro a todo el mundo.
 *
 * Deliberadamente NO se comparan los polines. Los polines son el saldo --
 * la simulación gasta en polines lo que sobra después de la malla (ver
 * polinesQueCaben en business-logic) -- así que 4 polines y 48 polines son
 * los dos correctos según qué malla eligió cada socio. Compararlos marcaría
 * como anómalo a medio programa. La malla sí es una elección.
 */
function medianasDeMalla(carritos: CarritoRevisable[]): Map<string, number> {
  const porSegmento = new Map<string, number[]>()
  for (const c of carritos) {
    const rollos = rollosDeMalla(c)
    if (rollos <= 0) continue
    const arr = porSegmento.get(c.segmento) ?? []
    arr.push(rollos)
    porSegmento.set(c.segmento, arr)
  }

  const medianas = new Map<string, number>()
  for (const [segmento, valores] of porSegmento) {
    if (valores.length >= MINIMO_PARA_COMPARAR) medianas.set(segmento, mediana(valores))
  }
  return medianas
}

export function revisarCarritos(carritos: CarritoRevisable[]): CasoRevision[] {
  const medianas = medianasDeMalla(carritos)
  const casos: CasoRevision[] = []

  for (const c of carritos) {
    const hallazgos: Hallazgo[] = []

    if (c.items.length === 0) {
      hallazgos.push({
        motivo: 'sin_carrito',
        severidad: 'alta',
        titulo: 'No tiene ningún producto cargado',
        detalle: `${formatCLP(c.presupuestoBase)} de presupuesto sin asignar`,
        pregunta: 'Hay que cargarle el carrito en la pestaña Beneficiarios antes de que pueda comprar.',
      })
    } else if (!c.totalEsCompleto) {
      hallazgos.push({
        motivo: 'sin_precio',
        severidad: 'alta',
        titulo: `${c.itemsSinPrecio} producto${c.itemsSinPrecio === 1 ? '' : 's'} sin precio cotizado`,
        detalle: `El total de ${formatCLP(c.total)} es parcial: no incluye lo que falta cotizar`,
        pregunta: 'Falta cargar ese precio en la pestaña Precios. Hasta entonces no se sabe si el presupuesto alcanza.',
      })
    } else if (c.precioPolin !== null && c.presupuestoBase - c.total >= c.precioPolin) {
      // El saldo solo es un problema si todavía COMPRA algo. Con el ajuste
      // automático todos los carritos terminan con un resto de menos de un
      // polín, que es el vuelto y no un descuido: marcarlo sería ruido en
      // cada carga y taparía a los dos carritos que sí están a medio cargar.
      const sobra = c.presupuestoBase - c.total
      const polines = Math.floor(sobra / c.precioPolin)
      hallazgos.push({
        motivo: 'presupuesto_sin_usar',
        severidad: 'alta',
        titulo: `Le sobran ${formatCLP(sobra)} sin usar`,
        detalle: `${formatCLP(c.total)} de compra sobre ${formatCLP(c.presupuestoBase)} de presupuesto · alcanza para ${polines} ${polines === 1 ? 'polín' : 'polines'} más`,
        pregunta: '¿El carrito quedó a medio cargar, o pidió solo eso? Es plata del programa que se pierde si no se usa.',
      })
    }

    const rollos = rollosDeMalla(c)
    const normal = medianas.get(c.segmento)
    if (rollos > 0 && normal !== undefined && Math.abs(rollos - normal) / normal >= DESVIO_MALLA) {
      hallazgos.push({
        motivo: 'mallas_fuera_de_rango',
        severidad: 'media',
        titulo: `Lleva ${rollos} rollo${rollos === 1 ? '' : 's'} de malla`,
        detalle: `El resto de ${c.segmento} lleva ${normal % 1 === 0 ? normal : normal.toFixed(1)}`,
        pregunta: 'Conviene confirmar los metros de cierre que necesita antes de comprar: la malla es lo que define cuánto le queda para polines.',
      })
    }

    if (hallazgos.length > 0) {
      casos.push({
        id: c.id,
        nombre: c.nombre,
        segmento: c.segmento,
        severidad: hallazgos.some(h => h.severidad === 'alta') ? 'alta' : 'media',
        hallazgos,
      })
    }
  }

  // Los urgentes primero, y dentro de cada grupo por nombre: el orden tiene
  // que ser el mismo en cada carga, o la lista impresa de ayer no se puede
  // comparar con la de hoy.
  return casos.sort((a, b) =>
    (a.severidad === b.severidad ? 0 : a.severidad === 'alta' ? -1 : 1) || a.nombre.localeCompare(b.nombre)
  )
}
