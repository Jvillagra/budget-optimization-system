import 'server-only'
import { getSupabaseAdmin } from './supabase-admin'

type Operacion = 'insert' | 'update' | 'delete'

/**
 * Registro de auditoría best-effort: si falla, no debe tumbar la mutación
 * real (el dato de negocio ya se escribió; abortar acá dejaría al usuario
 * con un error sobre una operación que sí ocurrió).
 *
 * Pero un fallo silencioso tampoco sirve: en un proyecto de fondos la
 * trazabilidad ES el entregable. El error se emite con un prefijo fijo,
 * `[AUDIT_FAIL]`, para poder alertarlo desde los logs de Vercel, e incluye
 * el registro completo que no se pudo guardar, de modo que el propio log de
 * la plataforma quede como respaldo de último recurso.
 */
export async function logAudit(tabla: string, operacion: Operacion, rowId: string, payload: unknown) {
  const registro = { tabla, operacion, row_id: rowId, payload }
  try {
    const { error } = await getSupabaseAdmin().from('audit_log').insert(registro)
    if (error) {
      console.error('[AUDIT_FAIL] no se pudo escribir audit_log', JSON.stringify({ ...registro, error: error.message }))
    }
  } catch (err) {
    console.error('[AUDIT_FAIL] excepción al escribir audit_log', JSON.stringify(registro), err)
  }
}
