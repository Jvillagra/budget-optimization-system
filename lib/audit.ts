import 'server-only'
import { getSupabaseAdmin } from './supabase-admin'

type Operacion = 'insert' | 'update' | 'delete'

/** Registro de auditoría best-effort: si falla, no debe tumbar la mutación real. */
export async function logAudit(tabla: string, operacion: Operacion, rowId: string, payload: unknown) {
  try {
    await getSupabaseAdmin()
      .from('audit_log')
      .insert({ tabla, operacion, row_id: rowId, payload })
  } catch (err) {
    console.error('audit_log insert falló', { tabla, operacion, rowId, err })
  }
}
