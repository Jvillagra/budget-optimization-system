import type { Beneficiario, Insumo, Asignacion, ResumenPresupuesto } from './types'

export const PRESUPUESTO_BASE = 189000
export const METROS_POLIETILENO_MINIMO = 20 // Regla Invernadero

/**
 * Calcula el resumen financiero de un beneficiario dado su carrito de asignaciones.
 */
export function calcularResumenPresupuesto(
  beneficiario: Beneficiario,
  asignaciones: Asignacion[]
): ResumenPresupuesto {
  const total_gastado = asignaciones.reduce((sum, a) => sum + a.costo_total, 0)
  const presupuesto = beneficiario.presupuesto_base ?? PRESUPUESTO_BASE
  const saldo_disponible = Math.max(0, presupuesto - total_gastado)
  const aporte_bolsillo = Math.max(0, total_gastado - presupuesto)

  return {
    beneficiario,
    asignaciones,
    total_gastado,
    saldo_disponible,
    aporte_bolsillo,
    tiene_aporte_bolsillo: aporte_bolsillo > 0,
  }
}

/**
 * Regla Invernadero: calcula cantidad máxima de polines con el saldo restante
 * tras la compra mínima de 20 metros de polietileno.
 */
export function calcularMaxPolines(
  saldoActual: number,
  precioPolietileno: number,
  precioPolin: number
): { cantidadMaxPolines: number; saldoTrasPolietileno: number } {
  const costoPolietilenoMinimo = METROS_POLIETILENO_MINIMO * precioPolietileno
  const saldoTrasPolietileno = saldoActual - costoPolietilenoMinimo
  const cantidadMaxPolines =
    saldoTrasPolietileno > 0 ? Math.floor(saldoTrasPolietileno / precioPolin) : 0

  return { cantidadMaxPolines, saldoTrasPolietileno: Math.max(0, saldoTrasPolietileno) }
}

/**
 * Regla Cierre Perimetral: calcula cuántos rollos adicionales y polines
 * caben con el saldo restante tras el primer rollo de malla.
 */
export function calcularAsignacionCierrePerimetral(
  saldoActual: number,
  precioMalla: number,
  precioPolin: number
): {
  rollosDisponibles: number
  saldoTrasMalla: number
  maxPolinesConSaldo: number
} {
  const saldoTrasMalla = saldoActual - precioMalla
  const rollosDisponibles =
    saldoTrasMalla >= 0 ? Math.floor(saldoTrasMalla / precioMalla) : 0
  const saldoParaPolines =
    saldoTrasMalla >= 0 ? saldoTrasMalla - rollosDisponibles * precioMalla : 0
  const maxPolinesConSaldo =
    precioPolin > 0 ? Math.floor(saldoParaPolines / precioPolin) : 0

  return {
    rollosDisponibles,
    saldoTrasMalla: Math.max(0, saldoTrasMalla),
    maxPolinesConSaldo,
  }
}

/**
 * Dado un listado de insumos de un proveedor y los 29 beneficiarios,
 * simula la asignación óptima automática y devuelve el volumen total de materiales
 * y el aporte de bolsillo comunitario total.
 */
export function simularEscenario(
  beneficiarios: Beneficiario[],
  insumos: Insumo[]
): { volumenTotal: number; aporteBolsilloTotal: number; gastoComunidad: number } {
  const polietileno = insumos.find(
    (i) => i.categoria === 'Polietileno' && i.nombre.toLowerCase().includes('polietileno')
  )
  const polin = insumos.find(
    (i) => i.categoria === 'Polines' && i.nombre.toLowerCase().includes('polin')
  )
  // Para malla toma el primer rollo disponible de cualquier tipo
  const malla = insumos.find((i) => i.categoria === 'Malla')

  let volumenTotal = 0
  let aporteBolsilloTotal = 0
  let gastoComunidad = 0

  for (const beneficiario of beneficiarios) {
    const presupuesto = beneficiario.presupuesto_base ?? PRESUPUESTO_BASE
    let gastoPersonal = 0
    let volumenPersonal = 0

    if (beneficiario.proyecto === 'Invernadero') {
      if (polietileno) {
        const metrosBase = METROS_POLIETILENO_MINIMO
        const costoBase = metrosBase * polietileno.precio_unitario
        gastoPersonal += costoBase
        volumenPersonal += metrosBase

        if (polin) {
          const saldoTras = presupuesto - costoBase
          if (saldoTras > 0) {
            const cantPolines = Math.floor(saldoTras / polin.precio_unitario)
            gastoPersonal += cantPolines * polin.precio_unitario
            volumenPersonal += cantPolines
          }
        }
      }
    } else {
      // Cierre Perimetral
      if (malla) {
        gastoPersonal += malla.precio_unitario
        volumenPersonal += 1

        const saldoTras = presupuesto - malla.precio_unitario
        if (saldoTras > 0 && polin) {
          const cantPolines = Math.floor(saldoTras / polin.precio_unitario)
          gastoPersonal += cantPolines * polin.precio_unitario
          volumenPersonal += cantPolines
        }
      }
    }

    gastoComunidad += gastoPersonal
    aporteBolsilloTotal += Math.max(0, gastoPersonal - presupuesto)
    volumenTotal += volumenPersonal
  }

  return { volumenTotal, aporteBolsilloTotal, gastoComunidad }
}

export function formatCLP(amount: number): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
  }).format(amount)
}
