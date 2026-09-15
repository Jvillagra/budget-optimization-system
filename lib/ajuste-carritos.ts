import 'server-only'
import { getSupabaseAdmin } from './supabase-admin'
import { logAudit } from './audit'
import {
  ajustarCarritoAPresupuesto,
  buildPrecioMap,
  proveedorPorDefecto,
  esDePrueba,
  type LineaAjustable,
} from './business-logic'
import type { Beneficiario, CatalogoInsumo, Asignacion, Proveedor, PrecioProveedor } from './types'

/**
 * Aplica el ajuste al presupuesto sobre los carritos REALES.
 *
 * La regla vive completa en `ajustarCarritoAPresupuesto` (lib/business-logic);
 * acá solo está el trabajo de ir a buscar los datos, decidir a quién le toca y
 * escribir. Esa separación es a propósito: la regla se prueba sin base de
 * datos y no puede divergir entre quien la aplica y quien la muestra -- que es
 * el error que definió este proyecto.
 *
 * A quién NO se le toca el carrito, y por qué:
 *
 *  - Al socio de QA (`es_prueba`), como en todo el resto de la app.
 *  - A quien ya tiene la compra confirmada (`compra_completa`): si ya se
 *    compró, la cantidad es un hecho, no una propuesta. Cambiarla dejaría la
 *    rendición describiendo algo distinto de lo que hay en la bodega.
 *  - A quien no tenga NADA cotizado con ese proveedor: un precio de Sodimac
 *    no puede mover el carrito de alguien que le compra todo a Agrícola
 *    Villarrica. Desde la migración 017 una línea puede tener su propio
 *    proveedor, así que "depende de" es: su proveedor por defecto es ese, o
 *    alguna línea suya se cotiza ahí.
 *  - A quien tenga cualquier línea sin precio cotizado: ahí el total es
 *    parcial y el ajuste saldría calculado contra un presupuesto que en
 *    realidad ya está comprometido (lo resuelve la propia regla, que devuelve
 *    error y ningún cambio).
 */

export interface AjusteDeSocio {
  beneficiario_id: string
  nombre: string
  cambios: { insumo_id: string; nombre: string; cantidad_antes: number; cantidad_despues: number }[]
  totalAntes: number
  totalDespues: number
  error: string | null
}

export interface ResumenAjuste {
  sociosRevisados: number
  sociosAjustados: number
  lineasCambiadas: number
  omitidos: { nombre: string; motivo: string }[]
  detalle: AjusteDeSocio[]
}

interface Actor {
  email: string | null
  userId: string | null
  role: string | null
}

/** Calcula el ajuste de todos los carritos que dependen de `proveedorId`.
 *  `aplicar: false` deja todo como está y solo devuelve qué cambiaría.
 *  `soloBeneficiarioId` limita el trabajo a un socio: es lo que usa el
 *  cambio de proveedor de una línea, que solo mueve ese carrito. */
export async function ajustarCarritosDelProveedor(
  proveedorId: string,
  opciones: { aplicar: boolean; actor: Actor; soloBeneficiarioId?: string }
): Promise<ResumenAjuste> {
  const admin = getSupabaseAdmin()

  const [{ data: bens }, { data: insumos }, { data: asigs }, { data: precios }, { data: provs }] = await Promise.all([
    admin.from('beneficiarios').select('*'),
    admin.from('catalogo_insumos').select('*'),
    admin.from('asignaciones').select('*'),
    admin.from('precios_proveedor').select('*'),
    admin.from('proveedores').select('*'),
  ])

  const beneficiarios = (bens ?? []) as (Beneficiario & { es_prueba?: boolean })[]
  const catalogo = (insumos ?? []) as CatalogoInsumo[]
  const asignaciones = (asigs ?? []) as Asignacion[]
  const proveedores = (provs ?? []) as Proveedor[]
  const precioMap = buildPrecioMap((precios ?? []) as PrecioProveedor[])

  const insumoPorId = new Map(catalogo.map(i => [i.id, i]))
  const referencia = proveedorPorDefecto(proveedores.filter(p => p.es_activo)) ?? null

  const porBeneficiario = new Map<string, Asignacion[]>()
  for (const a of asignaciones) {
    const lista = porBeneficiario.get(a.beneficiario_id) ?? []
    lista.push(a)
    porBeneficiario.set(a.beneficiario_id, lista)
  }

  const resumen: ResumenAjuste = {
    sociosRevisados: 0, sociosAjustados: 0, lineasCambiadas: 0, omitidos: [], detalle: [],
  }

  for (const ben of beneficiarios) {
    if (esDePrueba(ben)) continue

    if (opciones.soloBeneficiarioId && ben.id !== opciones.soloBeneficiarioId) continue

    const proveedorDelSocio = ben.proveedor_compra_id ?? referencia?.id ?? null
    if (!proveedorDelSocio) continue
    const lineasDelSocio = porBeneficiario.get(ben.id) ?? []
    const dependeDelProveedor = proveedorDelSocio === proveedorId
      || lineasDelSocio.some(a => a.proveedor_id === proveedorId)
    if (!dependeDelProveedor) continue

    if (ben.compra_completa) {
      resumen.omitidos.push({ nombre: ben.nombre, motivo: 'compra ya confirmada' })
      continue
    }

    resumen.sociosRevisados++

    const lineas: LineaAjustable[] = lineasDelSocio
      .map(a => {
        const insumo = a.catalogo_insumos ?? insumoPorId.get(a.insumo_id) ?? null
        return insumo ? ({ insumo_id: a.insumo_id, cantidad: a.cantidad, proveedor_id: a.proveedor_id ?? null, insumo } as LineaAjustable) : null
      })
      .filter((l): l is LineaAjustable => l !== null)

    // Se ajusta con el proveedor DEL SOCIO, no con el que disparó el ajuste:
    // las líneas con proveedor propio lo resuelven solas (proveedorDeLinea).
    const ajuste = ajustarCarritoAPresupuesto(lineas, proveedorDelSocio, precioMap, ben.presupuesto_base)

    if (ajuste.error) {
      resumen.omitidos.push({ nombre: ben.nombre, motivo: ajuste.error })
      continue
    }
    if (ajuste.cambios.length === 0) continue

    resumen.detalle.push({
      beneficiario_id: ben.id, nombre: ben.nombre, cambios: ajuste.cambios,
      totalAntes: ajuste.totalAntes, totalDespues: ajuste.totalDespues, error: null,
    })
    resumen.sociosAjustados++
    resumen.lineasCambiadas += ajuste.cambios.length

    if (!opciones.aplicar) continue

    for (const c of ajuste.cambios) {
      // Un insumo tiene UNA fila por socio (migración 012).
      const fila = lineasDelSocio.find(a => a.insumo_id === c.insumo_id)
      if (!fila) continue

      const { error } = await admin
        .from('asignaciones')
        .update({ cantidad: c.cantidad_despues })
        .eq('id', fila.id)

      if (error) {
        console.error('ajuste-carritos update', error)
        resumen.omitidos.push({ nombre: ben.nombre, motivo: `no se pudo escribir ${c.nombre}` })
        continue
      }

      await logAudit('asignaciones', 'update', fila.id, {
        motivo: 'ajuste automático al presupuesto',
        insumo_id: c.insumo_id,
        insumo_nombre: c.nombre,
        cantidad_anterior: c.cantidad_antes,
        cantidad: c.cantidad_despues,
        beneficiario_id: ben.id,
        proveedor_id: proveedorId,
        actor: opciones.actor,
      })
    }
  }

  return resumen
}
