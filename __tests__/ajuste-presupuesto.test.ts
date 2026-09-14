import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  ajustarCarritoAPresupuesto,
  cambioDePrecioEsGrande,
  UMBRAL_CAMBIO_PRECIO,
  type LineaAjustable,
} from '../lib/business-logic.ts'
import type { CatalogoInsumo } from '../lib/types.ts'

// El presupuesto por socio es FIJO y las cantidades son la variable. Estos
// tests fijan el ORDEN en que ceden las cosas, que es la regla de negocio:
// las líneas del socio no se tocan, el material base baja proporcionalmente y
// truncado a unidades enteras, y los polines absorben el resto.

const POLIN: CatalogoInsumo = { id: 'i-polin', segmento: 'Ambos', nombre: 'Polines (4 a 5 cm)', formato_venta: 'Unidad' }
const MALLA: CatalogoInsumo = { id: 'i-malla', segmento: 'Cierre Perimetral', nombre: 'Malla Ursus 80 cm', formato_venta: 'Rollo 100m' }
const POLY: CatalogoInsumo = { id: 'i-poly', segmento: 'Invernadero', nombre: 'Polietileno (Largo 4m, Ancho 8m)', formato_venta: 'Metro' }

const PROV = 'p1'
const PRESUPUESTO = 189000

function precios(mapa: Record<string, number | null>): Map<string, number | null> {
  return new Map(Object.entries(mapa).map(([insumoId, v]) => [`${PROV}_${insumoId}`, v]))
}

function linea(insumo: CatalogoInsumo, cantidad: number, es_extra = false): LineaAjustable {
  return { insumo_id: insumo.id, cantidad, es_extra, insumo }
}

const cambioDe = (r: { cambios: { insumo_id: string; cantidad_despues: number }[] }, id: string) =>
  r.cambios.find(c => c.insumo_id === id)?.cantidad_despues

describe('ajustarCarritoAPresupuesto', () => {
  test('si sube el precio del polín, el socio lleva menos polines', () => {
    const mapa = precios({ 'i-malla': 67575, 'i-polin': 3950 })
    // 1 malla (67.575) + saldo 121.425 -> 30 polines a 3.950 = 118.500
    const antes = ajustarCarritoAPresupuesto([linea(MALLA, 1), linea(POLIN, 30)], PROV, mapa, PRESUPUESTO)
    assert.equal(antes.cambios.length, 0, 'con el precio viejo el carrito ya estaba ajustado')

    // El polín sube a 6.590: en el mismo saldo caben 18.
    const caro = precios({ 'i-malla': 67575, 'i-polin': 6590 })
    const r = ajustarCarritoAPresupuesto([linea(MALLA, 1), linea(POLIN, 30)], PROV, caro, PRESUPUESTO)
    assert.equal(cambioDe(r, 'i-polin'), 18)
    assert.equal(cambioDe(r, 'i-malla'), undefined, 'la malla no se toca: el saldo alcanzaba')
    assert.ok(r.totalDespues <= PRESUPUESTO)
  })

  test('si el precio BAJA, los polines suben para gastar el presupuesto', () => {
    const mapa = precios({ 'i-malla': 67575, 'i-polin': 2000 })
    const r = ajustarCarritoAPresupuesto([linea(MALLA, 1), linea(POLIN, 18)], PROV, mapa, PRESUPUESTO)
    // saldo 121.425 / 2.000 = 60
    assert.equal(cambioDe(r, 'i-polin'), 60)
    assert.ok(r.totalDespues <= PRESUPUESTO)
  })

  test('las líneas del socio no se tocan ni cuentan contra su presupuesto', () => {
    // `asignaciones` tiene unique(beneficiario_id, insumo_id) desde la
    // migración 012, así que un insumo no puede estar dos veces en el mismo
    // carrito: ser extra es un atributo de la línea, no una línea aparte.
    const mapa = precios({ 'i-malla': 67575, 'i-polin': 6590, 'i-poly': 3832 })
    const r = ajustarCarritoAPresupuesto(
      [linea(MALLA, 1), linea(POLIN, 30), linea(POLY, 50, true)],
      PROV, mapa, PRESUPUESTO
    )
    assert.equal(cambioDe(r, 'i-poly'), undefined, 'la línea del socio no se toca')
    assert.equal(cambioDe(r, 'i-polin'), 18, 'el extra no consume presupuesto')
    assert.equal(r.totalAntes, 67575 + 30 * 6590, 'el extra tampoco entra en el total del programa')
  })

  test('si el material base no cabe, baja proporcionalmente y truncado a enteros', () => {
    // 3 mallas a 85.419 = 256.257, que no cabe en 189.000.
    // factor 0,7375 -> floor(3 * 0,7375) = 2 mallas = 170.838
    const mapa = precios({ 'i-malla': 85419, 'i-polin': 6590 })
    const r = ajustarCarritoAPresupuesto([linea(MALLA, 3), linea(POLIN, 10)], PROV, mapa, PRESUPUESTO)
    assert.equal(cambioDe(r, 'i-malla'), 2)
    // saldo 18.162 -> 2 polines (13.180), sobran 4.982
    assert.equal(cambioDe(r, 'i-polin'), 2)
    assert.equal(r.saldoSinUsar, 189000 - 170838 - 2 * 6590)
    assert.ok(r.totalDespues <= PRESUPUESTO, 'nunca queda sobre presupuesto')
  })

  test('si ni una unidad del material base cabe, la cantidad queda en cero', () => {
    const mapa = precios({ 'i-malla': 200000, 'i-polin': 6590 })
    const r = ajustarCarritoAPresupuesto([linea(MALLA, 1), linea(POLIN, 5)], PROV, mapa, PRESUPUESTO)
    assert.equal(cambioDe(r, 'i-malla'), 0)
    assert.ok(r.totalDespues <= PRESUPUESTO)
  })

  test('un solo precio faltante bloquea el ajuste entero', () => {
    const mapa = precios({ 'i-malla': 67575, 'i-polin': null })
    const r = ajustarCarritoAPresupuesto([linea(MALLA, 1), linea(POLIN, 30)], PROV, mapa, PRESUPUESTO)
    assert.equal(r.cambios.length, 0, 'no se escribe nada sobre un total parcial')
    assert.match(r.error ?? '', /Sin precio/)
  })

  test('sin línea de polines el saldo queda sin usar, no se inventa una', () => {
    const mapa = precios({ 'i-poly': 3832 })
    const r = ajustarCarritoAPresupuesto([linea(POLY, 20)], PROV, mapa, PRESUPUESTO)
    assert.equal(r.cambios.length, 0)
    assert.equal(r.saldoSinUsar, PRESUPUESTO - 20 * 3832)
  })

  test('un precio 0 es válido y no consume saldo, pero no da infinitos polines', () => {
    const mapa = precios({ 'i-malla': 67575, 'i-polin': 0 })
    const r = ajustarCarritoAPresupuesto([linea(MALLA, 1), linea(POLIN, 30)], PROV, mapa, PRESUPUESTO)
    assert.equal(cambioDe(r, 'i-polin'), 0)
    assert.ok(Number.isFinite(r.totalDespues))
  })

  test('un carrito que ya calza no genera ningún cambio', () => {
    const mapa = precios({ 'i-malla': 67575, 'i-polin': 3950 })
    const r = ajustarCarritoAPresupuesto([linea(MALLA, 1), linea(POLIN, 30)], PROV, mapa, PRESUPUESTO)
    assert.deepEqual(r.cambios, [])
    assert.equal(r.error, null)
  })

  test('un carrito de puras líneas del socio no se toca', () => {
    const mapa = precios({ 'i-malla': 67575 })
    const r = ajustarCarritoAPresupuesto([linea(MALLA, 3, true)], PROV, mapa, PRESUPUESTO)
    assert.deepEqual(r.cambios, [])
    assert.equal(r.error, null)
  })
})

describe('cambioDePrecioEsGrande', () => {
  test('deja pasar una variación normal de mercado', () => {
    // Las dos son subidas REALES del 2026-09-14, no números inventados.
    assert.equal(cambioDePrecioEsGrande(67575, 85419), false) // Malla Ursus 80, +26%
    assert.equal(cambioDePrecioEsGrande(87290, 110582), false) // Malla Ursus 100, +27%
    assert.equal(cambioDePrecioEsGrande(5490, 6590), false)   // polines, +20%
  })

  test('frena un cero de más al teclear', () => {
    assert.equal(cambioDePrecioEsGrande(6590, 65900), true)
    assert.equal(cambioDePrecioEsGrande(6590, 659), true)
  })

  test('estrenar o borrar un precio nunca es sospechoso', () => {
    assert.equal(cambioDePrecioEsGrande(null, 6590), false)
    assert.equal(cambioDePrecioEsGrande(6590, null), false)
  })

  test('el umbral es el que dice la constante', () => {
    const base = 1000
    assert.equal(cambioDePrecioEsGrande(base, base * (1 + UMBRAL_CAMBIO_PRECIO) + 1), true)
    assert.equal(cambioDePrecioEsGrande(base, base * (1 + UMBRAL_CAMBIO_PRECIO)), false)
  })
})
