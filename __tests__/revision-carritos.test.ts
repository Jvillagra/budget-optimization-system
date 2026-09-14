import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { revisarCarritos, type CarritoRevisable } from '../lib/business-logic.ts'

// Base: un socio de Cierre Perimetral "normal" -- 2 rollos de malla, dentro
// de presupuesto y todo cotizado. Los casos se arman desviando esta fila.
function socio(over: Partial<CarritoRevisable> & { id: string; nombre: string }): CarritoRevisable {
  return {
    segmento: 'Cierre Perimetral',
    presupuestoBase: 189000,
    total: 187234,
    totalEsCompleto: true,
    itemsSinPrecio: 0,
    // Precio real del polín en Sodimac. Es la unidad con la que se mide si
    // el saldo todavía compra algo.
    precioPolin: 3950,
    items: [
      { insumoNombre: 'Malla Inchalam 120 cm', cantidad: 2 },
      { insumoNombre: 'Polines (3 a 4 cm)', cantidad: 15 },
    ],
    ...over,
  }
}

/** Cinco socios normales: sin ellos no hay mediana de malla contra la cual
 *  comparar (hacen falta al menos 3 con malla). */
const normales = ['a', 'b', 'c', 'd', 'e'].map(k => socio({ id: k, nombre: `Socio ${k.toUpperCase()}` }))

describe('revisarCarritos', () => {
  test('un programa sano no genera ningún caso', () => {
    assert.deepEqual(revisarCarritos(normales), [])
  })

  test('marca el carrito a medio cargar y dice cuánta plata se pierde', () => {
    // El caso real de Maria Alejandra Huisca: un solo rollo de malla.
    const flojo = socio({
      id: 'x', nombre: 'Maria Alejandra', total: 67575,
      items: [{ insumoNombre: 'Malla Ursus 80 cm', cantidad: 1 }],
    })
    const casos = revisarCarritos([...normales, flojo])
    const caso = casos.find(c => c.id === 'x')
    assert.ok(caso, 'debía marcarla')
    assert.equal(caso.severidad, 'alta')
    const uso = caso.hallazgos.find(h => h.motivo === 'presupuesto_sin_usar')
    assert.ok(uso, 'debía marcar el presupuesto sin usar')
    // La plata que sobra, y cuántos polines más compra: 121.425 / 3.950 = 30.
    assert.match(uso.titulo, /121\.425/)
    assert.match(uso.detalle, /30 polines más/)
  })

  test('el vuelto que deja el ajuste automático NO es un caso', () => {
    // 187.234 de 189.000: sobran 1.766, menos que el polín de 3.950. No se
    // puede comprar nada con eso, así que marcarlo sería ruido en cada carga.
    assert.equal(revisarCarritos(normales).length, 0)
  })

  test('el umbral es el precio del polín, no un porcentaje', () => {
    // 184.000 de 189.000 es el 97,4%: el umbral viejo de 80% no lo veía. Le
    // sobran 5.000, que compran un polín más, así que ahora sí se marca.
    const casi = socio({ id: 'x', nombre: 'Casi', total: 184000 })
    const uso = revisarCarritos([...normales, casi])
      .find(c => c.id === 'x')?.hallazgos.find(h => h.motivo === 'presupuesto_sin_usar')
    assert.ok(uso, 'debía marcarlo: le alcanza para otro polín')
    assert.match(uso.detalle, /1 polín más/)

    // Un peso menos que un polín y ya no hay nada que comprar.
    const justo = socio({ id: 'y', nombre: 'Justo', total: 189000 - 3949 })
    assert.equal(revisarCarritos([...normales, justo]).find(c => c.id === 'y'), undefined)
  })

  test('sin precio de polín no se afirma que sobre plata gastable', () => {
    // Proveedor sin el polín cotizado: no hay vara. Callarse es lo correcto;
    // el umbral viejo habría marcado igual, con una cifra que nadie podía
    // verificar contra una compra real.
    const sinVara = socio({ id: 'x', nombre: 'Sin vara', total: 67575, precioPolin: null,
      items: [{ insumoNombre: 'Malla Ursus 80 cm', cantidad: 1 }] })
    const caso = revisarCarritos([...normales, sinVara]).find(c => c.id === 'x')
    assert.ok(!caso?.hallazgos.some(h => h.motivo === 'presupuesto_sin_usar'))
  })

  test('marca los rollos de malla fuera de la mediana, en los dos sentidos', () => {
    const deMas = socio({ id: 'x', nombre: 'Javier', items: [
      { insumoNombre: 'Malla Galvanizada 5014 100 cm', cantidad: 3 },
      { insumoNombre: 'Polines (3 a 4 cm)', cantidad: 7 },
    ]})
    const deMenos = socio({ id: 'y', nombre: 'Ana', total: 188000, items: [
      { insumoNombre: 'Malla Ursus 100 cm', cantidad: 1 },
      { insumoNombre: 'Polines (3 a 4 cm)', cantidad: 25 },
    ]})
    const casos = revisarCarritos([...normales, deMas, deMenos])
    assert.equal(casos.find(c => c.id === 'x')?.hallazgos[0].motivo, 'mallas_fuera_de_rango')
    assert.ok(casos.find(c => c.id === 'y')?.hallazgos.some(h => h.motivo === 'mallas_fuera_de_rango'))
  })

  test('NO compara polines: son el saldo, no una elección', () => {
    // 48 polines contra los 15 de los demás es una diferencia enorme, pero
    // legítima: con menos malla sobra más plata para polines. Si esta regla
    // mirara polines, marcaría a medio programa.
    const muchosPolines = socio({ id: 'x', nombre: 'Joel', total: 189600, items: [
      { insumoNombre: 'Malla Inchalam 120 cm', cantidad: 2 },
      { insumoNombre: 'Polines (3 a 4 cm)', cantidad: 48 },
    ]})
    assert.equal(revisarCarritos([...normales, muchosPolines]).length, 0)
  })

  test('sin suficientes carritos con malla no se inventa una normalidad', () => {
    const dos = [socio({ id: 'a', nombre: 'A' }), socio({ id: 'b', nombre: 'B', items: [
      { insumoNombre: 'Malla Ursus 100 cm', cantidad: 9 },
      { insumoNombre: 'Polines (3 a 4 cm)', cantidad: 1 },
    ]})]
    assert.equal(revisarCarritos(dos).length, 0)
  })

  test('un total parcial se marca como tal y no como presupuesto sin usar', () => {
    // Un ítem sin precio deja el total bajo; decir "usa el 40% de su
    // presupuesto" sería una conclusión falsa sacada de un dato incompleto.
    const parcial = socio({ id: 'x', nombre: 'Sin precio', total: 70000, totalEsCompleto: false, itemsSinPrecio: 1 })
    const caso = revisarCarritos([...normales, parcial]).find(c => c.id === 'x')
    assert.equal(caso?.hallazgos[0].motivo, 'sin_precio')
    assert.ok(!caso?.hallazgos.some(h => h.motivo === 'presupuesto_sin_usar'))
  })

  test('un carrito vacío se marca como vacío, no como sin precio', () => {
    const vacio = socio({ id: 'x', nombre: 'Vacío', total: 0, totalEsCompleto: false, itemsSinPrecio: 0, items: [] })
    const caso = revisarCarritos([...normales, vacio]).find(c => c.id === 'x')
    assert.equal(caso?.hallazgos[0].motivo, 'sin_carrito')
  })

  test('los urgentes van primero y el orden se repite entre cargas', () => {
    const media = socio({ id: 'm', nombre: 'Zzz Media', items: [
      { insumoNombre: 'Malla Ursus 100 cm', cantidad: 3 },
      { insumoNombre: 'Polines (3 a 4 cm)', cantidad: 7 },
    ]})
    const alta = socio({ id: 'h', nombre: 'Aaa Alta', total: 50000, items: [
      { insumoNombre: 'Malla Ursus 80 cm', cantidad: 2 },
    ]})
    const orden = (ls: CarritoRevisable[]) => revisarCarritos(ls).map(c => c.id)
    assert.deepEqual(orden([...normales, media, alta]), ['h', 'm'])
    assert.deepEqual(orden([alta, media, ...normales]), ['h', 'm'])
  })
})
