import { NextRequest, NextResponse } from 'next/server'
import { getViewerContext, isStaff } from '@/lib/roles'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { urlsFirmadasFoto, keyMiniatura, borrarFoto, objetoMeta, descargarObjeto, subirObjeto, SUFIJO_OPTIMIZADA, SUFIJO_MINIATURA, MAX_FOTOS_POR_SOCIO, MAX_BYTES, TIPOS_PERMITIDOS } from '@/lib/r2'
import { convertirAWebp } from '@/lib/imagen'
import { logAudit } from '@/lib/audit'
import { FOTOS_REQUERIDAS } from '@/lib/constants'

// La confirmación de subida ahora también baja la foto de R2, la recodifica
// a WebP y la vuelve a subir (ver lib/imagen.ts). Con el máximo de 8MB por
// archivo eso son un par de segundos, muy por encima de los 10s por defecto
// de una función serverless en el plan Hobby.
export const maxDuration = 60

// GET: lista de fotos con URL firmada de lectura.
//  - socio: siempre las suyas.
//  - owner/admin: las de cualquier beneficiario, vía ?beneficiarioId=.
export async function GET(req: NextRequest) {
  const ctx = await getViewerContext()
  if (!ctx.role) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  let beneficiarioId: string
  if (ctx.role === 'socio') {
    beneficiarioId = ctx.beneficiarioId
  } else if (isStaff(ctx)) {
    const qp = req.nextUrl.searchParams.get('beneficiarioId')
    if (!qp) return NextResponse.json({ error: 'beneficiarioId es requerido' }, { status: 400 })
    beneficiarioId = qp
  } else {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from('fotos_compra')
    .select('id, r2_key, uploaded_at')
    .eq('beneficiario_id', beneficiarioId)
    .order('uploaded_at', { ascending: true })

  if (error) {
    console.error('fotos GET', error)
    return NextResponse.json({ error: 'Error al cargar las fotos' }, { status: 500 })
  }

  const fotos = await Promise.all(
    (data ?? []).map(async f => ({
      id: f.id,
      uploaded_at: f.uploaded_at,
      ...(await urlsFirmadasFoto(f.r2_key)),
    }))
  )

  return NextResponse.json({ fotos, max: MAX_FOTOS_POR_SOCIO })
}

// POST: confirma una subida ya hecha directo a R2 (ver /api/fotos/upload-url)
// e inserta el metadato.
export async function POST(req: NextRequest) {
  const ctx = await getViewerContext()

  const body = await req.json().catch(() => null)

  let beneficiarioId: string
  if (ctx.role === 'socio') {
    beneficiarioId = ctx.beneficiarioId
  } else if (isStaff(ctx)) {
    const bid = body?.beneficiarioId
    if (typeof bid !== 'string' || !bid) {
      return NextResponse.json({ error: 'beneficiarioId es requerido' }, { status: 400 })
    }
    beneficiarioId = bid
  } else {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const key = body?.key
  if (typeof key !== 'string' || !key.startsWith(`${beneficiarioId}/`)) {
    return NextResponse.json({ error: 'key inválida' }, { status: 400 })
  }

  // El objeto tiene que existir DE VERDAD en R2 antes de crear la fila.
  // Sin esto se podían registrar 5 keys inventadas: el socio se autobloqueaba
  // el cupo, la rendición contaba fotos que no existen y el PDF de la
  // consultora salía con imágenes rotas.
  const meta = await objetoMeta(key)
  if (!meta) {
    return NextResponse.json({ error: 'No encontramos la imagen subida. Intenta de nuevo.' }, { status: 400 })
  }
  // Segundo cinturón sobre el tamaño: la firma ya lleva ContentLength, esto
  // cubre el caso de un cliente que consiga eludirlo.
  if (meta.size > MAX_BYTES || (meta.contentType && !TIPOS_PERMITIDOS.includes(meta.contentType))) {
    await borrarFoto(key).catch(err => console.error('no se pudo limpiar objeto inválido', key, err))
    return NextResponse.json({ error: 'El archivo subido no es válido.' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const { count } = await admin
    .from('fotos_compra')
    .select('id', { count: 'exact', head: true })
    .eq('beneficiario_id', beneficiarioId)
  if ((count ?? 0) >= MAX_FOTOS_POR_SOCIO) {
    await borrarFoto(key).catch(err => console.error('no se pudo limpiar objeto sobre el cupo', key, err))
    return NextResponse.json({ error: `Ya tienes el máximo de ${MAX_FOTOS_POR_SOCIO} fotos.` }, { status: 400 })
  }

  // A WebP antes de registrar nada: la fila apunta siempre al objeto que la
  // app va a servir. Se hace acá y no antes del cupo para no gastar CPU
  // recodificando una foto que igual se iba a rechazar.
  //
  // Si algo de esto falla se sigue con el original -- una foto que el socio
  // ya subió no se pierde por un problema de codificación. Lo peor que pasa
  // es que esa foto quede pesada, y queda el log para detectarlo.
  const keyFinal = await aWebpEnR2(key)

  const { data, error } = await admin
    .from('fotos_compra')
    .insert({ beneficiario_id: beneficiarioId, r2_key: keyFinal })
    .select('id, uploaded_at')
    .single()

  if (error || !data) {
    // Si la fila no se pudo crear (incluido el trigger de tope por socio de
    // 009), el objeto en R2 quedaría huérfano y nadie lo borraría nunca.
    const huerfanos = [keyFinal, keyMiniatura(keyFinal)].filter((k): k is string => k !== null)
    await Promise.all(huerfanos.map(k =>
      borrarFoto(k).catch(err => console.error('no se pudo limpiar objeto huérfano', k, err))))
    console.error('fotos POST insert', error)
    const esTope = error?.message?.includes('máximo') || error?.code === 'P0001'
    return NextResponse.json(
      { error: esTope ? `Ya tienes el máximo de ${MAX_FOTOS_POR_SOCIO} fotos.` : 'No se pudo registrar la foto.' },
      { status: 400 }
    )
  }

  // Si quien sube es staff en nombre de otro, se deja trazado quién ejecutó
  // la acción (no solo el beneficiario dueño de la foto).
  const payload: Record<string, unknown> = { beneficiario_id: beneficiarioId, r2_key: keyFinal }
  if (isStaff(ctx)) payload.actor = { email: ctx.email, userId: ctx.userId, role: ctx.role }

  await logAudit('fotos_compra', 'insert', data.id, payload)
  return NextResponse.json({ data })
}

// DELETE: el socio borra su propia foto; el staff puede borrar la foto de
// cualquier beneficiario (mismo criterio que el GET, sin restringir a uno).
export async function DELETE(req: NextRequest) {
  const ctx = await getViewerContext()
  if (ctx.role !== 'socio' && !isStaff(ctx)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id es requerido' }, { status: 400 })

  const admin = getSupabaseAdmin()
  const { data: foto } = await admin
    .from('fotos_compra')
    .select('id, r2_key, beneficiario_id, uploaded_at')
    .eq('id', id)
    .maybeSingle()

  const puedeBorrar = foto && (isStaff(ctx) || foto.beneficiario_id === ctx.beneficiarioId)
  if (!puedeBorrar) {
    return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
  }

  // Orden invertido respecto de la versión anterior: primero la fila,
  // después el objeto. Al revés, si el DELETE de Postgres fallaba quedaba
  // una fila apuntando a un objeto inexistente -- foto rota para siempre
  // que seguía contando para FOTOS_REQUERIDAS. Un objeto sin fila es basura
  // silenciosa; una fila sin objeto corrompe la rendición.
  const { error } = await admin.from('fotos_compra').delete().eq('id', id)
  if (error) {
    console.error('fotos DELETE', error)
    return NextResponse.json({ error: 'No se pudo eliminar la foto' }, { status: 400 })
  }

  // Las dos versiones: la que se sirve y su miniatura (ver lib/imagen.ts).
  // Si solo se borrara la principal, la miniatura quedaría en R2 para
  // siempre sin que nadie la referencie.
  const objetos = [foto.r2_key, keyMiniatura(foto.r2_key)].filter((k): k is string => k !== null)
  await Promise.all(objetos.map(k => borrarFoto(k).catch(err => {
    // La fila ya no está: la rendición quedó consistente. El objeto huérfano
    // se limpia con la regla de ciclo de vida del bucket.
    console.error('fila borrada pero el objeto sigue en R2', k, err)
  })))

  // El payload en null no servía para nada: se borraba una foto y no quedaba
  // registro de cuál, con un row_id que ya no resuelve a ninguna fila.
  await logAudit('fotos_compra', 'delete', id, {
    beneficiario_id: foto.beneficiario_id,
    r2_key: foto.r2_key,
    uploaded_at: foto.uploaded_at,
    actor: { email: ctx.email, userId: ctx.userId, role: ctx.role },
  })

  // Borrar un comprobante puede dejar al beneficiario bajo el mínimo. El
  // estado "compra completa" tiene que caerse con él: si no, queda marcado
  // como completo con menos fotos de las que exige /completar y nadie lo
  // nota. Pasó de verdad -- una socia quedó COMPLETO con 0 fotos porque las
  // 3 fotos de prueba con que se marcó en agosto se borraron en septiembre.
  // El diálogo de confirmación de /rendicion ya prometía esta reversión;
  // faltaba cumplirla.
  //
  // `null` = el estado no cambió (no hacía falta, o no se pudo verificar).
  let compraCompleta: boolean | null = null
  const { count: restantes, error: countError } = await admin
    .from('fotos_compra')
    .select('id', { count: 'exact', head: true })
    .eq('beneficiario_id', foto.beneficiario_id)

  if (countError) {
    // El borrado ya ocurrió y es lo que el usuario pidió: no se devuelve
    // error, pero queda el rastro para poder cuadrarlo después.
    console.error('[ESTADO_SIN_REVISAR] no se pudo contar fotos tras el delete', foto.beneficiario_id, countError)
  } else if ((restantes ?? 0) < FOTOS_REQUERIDAS) {
    const { data: ben } = await admin
      .from('beneficiarios')
      .select('compra_completa')
      .eq('id', foto.beneficiario_id)
      .maybeSingle()

    if (ben?.compra_completa) {
      const { error: revertError } = await admin
        .from('beneficiarios')
        .update({
          compra_completa: false,
          compra_completa_at: new Date().toISOString(),
          compra_completa_by: ctx.userId,
        })
        .eq('id', foto.beneficiario_id)

      if (revertError) {
        console.error('[ESTADO_SIN_REVISAR] no se pudo revertir compra_completa', foto.beneficiario_id, revertError)
      } else {
        compraCompleta = false
        await logAudit('beneficiarios', 'update', foto.beneficiario_id, {
          compra_completa: false,
          motivo: 'fotos_insuficientes_tras_borrado',
          fotos: restantes ?? 0,
          requeridas: FOTOS_REQUERIDAS,
          foto_borrada: id,
          actor: { email: ctx.email, userId: ctx.userId, role: ctx.role },
        })
      }
    }
  }

  return NextResponse.json({
    ok: true,
    beneficiarioId: foto.beneficiario_id,
    fotosRestantes: countError ? null : restantes ?? 0,
    compraCompleta,
  })
}

/**
 * Reemplaza en R2 el objeto recién subido por su versión WebP y devuelve la
 * key que hay que registrar. Ante cualquier problema devuelve la original:
 * el flujo de subida nunca falla por culpa de la conversión.
 */
async function aWebpEnR2(key: string): Promise<string> {
  const original = await descargarObjeto(key)
  if (!original) {
    console.error('[WEBP] no se pudo descargar para convertir', key)
    return key
  }

  const res = await convertirAWebp(original)
  if (!res.convertida) {
    console.info('[WEBP] se deja el original', key, res.motivo)
    return key
  }

  // Misma carpeta (`<beneficiarioId>/`) y mismo UUID que el original: la
  // validación de key del POST y del DELETE sigue valiendo tal cual.
  const raiz = key.replace(/\.[^./]+$/, '')
  const keyPrincipal = raiz + SUFIJO_OPTIMIZADA
  const keyMini = raiz + SUFIJO_MINIATURA
  try {
    // La miniatura primero: si falla, no queda una foto marcada como `.opt`
    // (o sea, "tiene miniatura") apuntando a una miniatura que no existe.
    await subirObjeto(keyMini, res.miniatura, res.contentType)
    await subirObjeto(keyPrincipal, res.principal, res.contentType)
  } catch (err) {
    console.error('[WEBP] no se pudo subir la version convertida', keyPrincipal, err)
    await borrarFoto(keyMini).catch(() => {})
    await borrarFoto(keyPrincipal).catch(() => {})
    return key
  }

  // Recién ahora: mientras el original exista, un fallo arriba no deja al
  // socio sin foto.
  await borrarFoto(key).catch(err => console.error('[WEBP] quedo el original sin borrar', key, err))

  const ahorro = Math.round((1 - res.principal.byteLength / original.byteLength) * 100)
  console.info('[WEBP]', key, '->', keyPrincipal,
    `${(original.byteLength / 1024).toFixed(0)}KB -> ${(res.principal.byteLength / 1024).toFixed(0)}KB (-${ahorro}%)`,
    `+ miniatura ${(res.miniatura.byteLength / 1024).toFixed(0)}KB`)
  return keyPrincipal
}
