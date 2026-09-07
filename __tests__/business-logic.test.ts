import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  simularBeneficiario,
  calcularCostoCarrito,
  elegirMejorProveedor,
  buildPrecioMap,
  normalizar,
  METROS_POLY_MIN,
  ROLLOS_MALLA,
} from '../lib/business-logic.ts'
import type { Beneficiario, CatalogoInsumo, Proveedor, Asignacion, AyudaMemoria } from '../lib/types.ts'

// Los números del programa (20 m de polietileno, 1 rollo de malla, el
// presupuesto por socio) se fijan acá a propósito: si alguien los cambia sin
// querer, estos tests lo dicen. Ver comentarios en lib/business-logic.ts.

const POLIN: CatalogoInsumo = { id: 'i-polin', segmento: 'Ambos', nombre: 'Polines (3 a 4 cm)', formato_venta: 'Unidad' }
const POLY: CatalogoInsumo = { id: 'i-poly', segmento: 'Invernadero', nombre: 'Polietileno (Largo 4m, Ancho 8m)', formato_venta: 'Metro' }
const MALLA_A: CatalogoInsumo = { id: 'i-malla-a', segmento: 'Cierre Perimetral', nombre: 'Malla Ursus 80', formato_venta: 'Rollo' }
const MALLA_B: CatalogoInsumo = { id: 'i-malla-b', segmento: 'Cierre Perimetral', nombre: 'Malla Inchalam 120', formato_venta: 'Rollo' }

const PROV = 'p1'

function ben(over: Partial<Beneficiario> = {}): Beneficiario {
  return {
    id: 'b1', nombre: 'Socio', segmento: 'Invernadero', presupuesto_base: 189000,
    email: null, compra_completa: false, compra_completa_at: null,
    compra_completa_by: null, proveedor_compra_id: null, ...over,
  }
}
function precios(entries: [string, number | null][]): Map<string, number | null> {
  return new Map(entries.map(([insumoId, precio]) => [`${PROV}_${insumoId}`, precio]))
}
function am(insumoId: string): AyudaMemoria {
  return { id: `am-${insumoId}`, beneficiario_id: 'b1', insumo_id: insumoId, detalle_original: null }
}

describe('simularBeneficiario', () => {
  test('invernadero: gasta el mínimo de polietileno y reparte el saldo en polines', () => {
    const r = simularBeneficiario(
      ben(), PROV, precios([['i-poly', 2800], ['i-polin', 3500]]), [POLIN, POLY], []
    )
    assert.equal(r.error, null)
    assert.equal(r.insumo_base_cantidad, METROS_POLY_MIN)
    // 189000 - (20 * 2800 = 56000) = 133000 -> floor(133000/3500) = 38
    assert.equal(r.polines, 38)
    assert.equal(r.gasto_total, 56000 + 38 * 3500)
    assert.equal(r.aporte_bolsillo, 0)
  })

  test('usa el presupuesto de SU fila, no una constante global', () => {
    const caro = simularBeneficiario(ben({ presupuesto_base: 400000 }), PROV, precios([['i-poly', 2800], ['i-polin', 3500]]), [POLIN, POLY], [])
    const barato = simularBeneficiario(ben({ presupuesto_base: 100000 }), PROV, precios([['i-poly', 2800], ['i-polin', 3500]]), [POLIN, POLY], [])
    assert.ok(caro.polines > barato.polines)
    assert.equal(barato.polines, Math.floor((100000 - 56000) / 3500))
  })

  test('precio 0 es un precio válido, no "sin precio"', () => {
    // Insumo donado: antes `if (!precio)` lo trataba como falta de dato y
    // sacaba al socio de la simulación.
    const r = simularBeneficiario(ben(), PROV, precios([['i-poly', 0], ['i-polin', 3500]]), [POLIN, POLY], [])
    assert.equal(r.error, null)
    assert.equal(r.polines, Math.floor(189000 / 3500))
  })

  test('precio null sí es falta de dato', () => {
    const r = simularBeneficiario(ben(), PROV, precios([['i-poly', null], ['i-polin', 3500]]), [POLIN, POLY], [])
    assert.match(r.error ?? '', /Sin precio/)
  })

  test('polines a precio 0 no producen infinitos polines', () => {
    const r = simularBeneficiario(ben(), PROV, precios([['i-poly', 2800], ['i-polin', 0]]), [POLIN, POLY], [])
    assert.equal(r.error, null)
    assert.ok(Number.isFinite(r.polines))
    assert.equal(r.polines, 0)
  })

  test('el catálogo tolera tildes y espacios de más en el nombre', () => {
    const polinRaro: CatalogoInsumo = { ...POLIN, nombre: '  Polínes  (3 a 4 cm) ' }
    const r = simularBeneficiario(ben(), PROV, precios([['i-poly', 2800], ['i-polin', 3500]]), [polinRaro, POLY], [])
    assert.equal(r.error, null)
  })

  test('cierre perimetral: 1 rollo de malla + polines con el saldo', () => {
    const r = simularBeneficiario(
      ben({ segmento: 'Cierre Perimetral' }), PROV,
      precios([['i-polin', 3500], ['i-malla-a', 45000]]),
      [POLIN, MALLA_A], [am('i-malla-a')]
    )
    assert.equal(r.error, null)
    assert.equal(r.insumo_base_id, 'i-malla-a')
    assert.equal(r.insumo_base_cantidad, ROLLOS_MALLA)
    assert.equal(r.polines, Math.floor((189000 - 45000) / 3500))
  })

  test('con dos mallas en ayuda memoria el resultado es determinista', () => {
    const mapa = precios([['i-polin', 3500], ['i-malla-a', 45000], ['i-malla-b', 38000]])
    const elegidos = new Set<string | null>()
    for (const orden of [[am('i-malla-a'), am('i-malla-b')], [am('i-malla-b'), am('i-malla-a')]]) {
      const r = simularBeneficiario(ben({ segmento: 'Cierre Perimetral' }), PROV, mapa, [POLIN, MALLA_A, MALLA_B], orden)
      elegidos.add(r.insumo_base_id)
    }
    // El orden en que Postgres devuelva ayuda_memoria no puede cambiar la
    // cotización del socio.
    assert.equal(elegidos.size, 1)
  })

  test('socio sin malla en ayuda memoria: todo el presupuesto en polines', () => {
    const r = simularBeneficiario(
      ben({ segmento: 'Cierre Perimetral' }), PROV, precios([['i-polin', 3500]]), [POLIN], []
    )
    assert.equal(r.error, null)
    assert.equal(r.insumo_base_id, null)
    assert.equal(r.polines, Math.floor(189000 / 3500))
  })

  test('presupuesto insuficiente para el insumo base: 0 polines, sin negativos', () => {
    const r = simularBeneficiario(
      ben({ presupuesto_base: 10000 }), PROV, precios([['i-poly', 2800], ['i-polin', 3500]]), [POLIN, POLY], []
    )
    assert.equal(r.polines, 0)
    assert.equal(r.gasto_total, METROS_POLY_MIN * 2800)
    assert.equal(r.aporte_bolsillo, r.gasto_total - 10000)
  })
})

describe('calcularCostoCarrito', () => {
  const asigs: Asignacion[] = [
    { id: 'a1', beneficiario_id: 'b1', insumo_id: 'i-polin', cantidad: 10 },
    { id: 'a2', beneficiario_id: 'b1', insumo_id: 'i-malla-a', cantidad: 1 },
  ]

  test('suma solo lo cotizado y cuenta lo que falta', () => {
    const r = calcularCostoCarrito(asigs, PROV, precios([['i-polin', 3500], ['i-malla-a', null]]))
    assert.equal(r.total, 35000)
    assert.equal(r.itemsConPrecio, 1)
    assert.equal(r.itemsSinPrecio, 1)
  })

  test('un ítem a precio 0 cuenta como cotizado', () => {
    const r = calcularCostoCarrito(asigs, PROV, precios([['i-polin', 3500], ['i-malla-a', 0]]))
    assert.equal(r.itemsSinPrecio, 0)
    assert.equal(r.total, 35000)
  })
})

describe('elegirMejorProveedor', () => {
  const pA: Proveedor = { id: 'pa', nombre: 'Agrícola A', es_activo: true }
  const pB: Proveedor = { id: 'pb', nombre: 'Beta', es_activo: true }
  const asigs: Asignacion[] = [{ id: 'a1', beneficiario_id: 'b1', insumo_id: 'i-polin', cantidad: 10 }]

  test('sin carrito NO elige proveedor ni reporta un total', () => {
    // Antes todos empataban en 0 y "ganaba" el primero: se reportaba
    // "Proveedor X — $0" como un hecho y el PDF sumaba ese cero.
    const r = elegirMejorProveedor([], [pA, pB], new Map())
    assert.equal(r.proveedor, null)
    assert.equal(r.totalEsCompleto, false)
  })

  test('elige el más barato entre los que cotizan todo', () => {
    const mapa = buildPrecioMap([
      { id: '1', proveedor_id: 'pa', insumo_id: 'i-polin', precio_unitario: 3500 },
      { id: '2', proveedor_id: 'pb', insumo_id: 'i-polin', precio_unitario: 3200 },
    ])
    const r = elegirMejorProveedor(asigs, [pA, pB], mapa)
    assert.equal(r.proveedor?.id, 'pb')
    assert.equal(r.total, 32000)
    assert.equal(r.totalEsCompleto, true)
  })

  test('prefiere cobertura sobre precio y marca el total como parcial', () => {
    const asigs2: Asignacion[] = [
      ...asigs,
      { id: 'a2', beneficiario_id: 'b1', insumo_id: 'i-malla-a', cantidad: 1 },
    ]
    const mapa = buildPrecioMap([
      { id: '1', proveedor_id: 'pa', insumo_id: 'i-polin', precio_unitario: 3500 },
      { id: '2', proveedor_id: 'pa', insumo_id: 'i-malla-a', precio_unitario: 45000 },
      { id: '3', proveedor_id: 'pb', insumo_id: 'i-polin', precio_unitario: 1 },
    ])
    const r = elegirMejorProveedor(asigs2, [pA, pB], mapa)
    assert.equal(r.proveedor?.id, 'pa')
    assert.equal(r.totalEsCompleto, true)

    const soloParcial = elegirMejorProveedor(asigs2, [pB], mapa)
    assert.equal(soloParcial.totalEsCompleto, false)
    assert.equal(soloParcial.itemsSinPrecio, 1)
  })

  test('empate exacto: gana el alfabéticamente menor, siempre el mismo', () => {
    const mapa = buildPrecioMap([
      { id: '1', proveedor_id: 'pa', insumo_id: 'i-polin', precio_unitario: 3500 },
      { id: '2', proveedor_id: 'pb', insumo_id: 'i-polin', precio_unitario: 3500 },
    ])
    assert.equal(elegirMejorProveedor(asigs, [pA, pB], mapa).proveedor?.id, 'pa')
    assert.equal(elegirMejorProveedor(asigs, [pB, pA], mapa).proveedor?.id, 'pa')
  })
})

describe('normalizar', () => {
  test('quita tildes, colapsa espacios y baja a minúsculas', () => {
    assert.equal(normalizar('  Polínes   (3 a 4 CM) '), 'polines (3 a 4 cm)')
  })
})
