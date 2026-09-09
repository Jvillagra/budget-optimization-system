import 'server-only'
import sharp, { type Metadata } from 'sharp'

// Toda imagen que sirve la app va como WebP. La conversión es server-side a
// propósito: el navegador no sube WebP por su cuenta y confiar en que lo haga
// deja el formato librado al dispositivo. Como el archivo sube DIRECTO a R2
// (presigned PUT, para esquivar el límite de ~4.5MB de body de las funciones
// de Vercel), el único momento en que el servidor puede tocarlo es al
// confirmar la subida: se baja, se convierte y se reemplaza el objeto.
//
// MEDIDO sobre fotos reales de celular (8160x4592, ~5MB de JPEG) antes de
// elegir estos números, porque la intuición acá falla:
//
//   misma resolución, q95 -> +85%   <- MÁS pesado que el original
//   misma resolución, q92 -> +58%
//   misma resolución, q82 ->  +2%
//   misma resolución, q78 -> -10%   <- ya con pérdida generacional
//   2400px, q85           -> -77%
//    800px, q75           -> -98%
//
// O sea: el ahorro NO viene del formato. Un JPEG de celular ya está
// comprimido, y re-codificarlo fiel cuesta más bytes que el original. Viene
// de acotar la resolución. 8160px es resolución de impresión; un comprobante
// se lee y se amplía sin problema a 2400px.

/** Lado largo de la imagen que se sirve al abrir el comprobante. */
const LADO_MAXIMO = 2400
/** Lado largo de la miniatura de la grilla (/rendicion, /mi-dashboard). */
const LADO_MINIATURA = 800

const CALIDAD = 85
const CALIDAD_MINIATURA = 75
/** Los PNG suelen ser capturas de pantalla de una boleta: texto de bordes
 *  duros, donde el lossy a 85 se nota. Suben un escalón; igual comprimen
 *  mejor que una fotografía por las zonas planas. */
const CALIDAD_GRAFICO = 92

export type ResultadoConversion =
  | { convertida: true; principal: Buffer; miniatura: Buffer; contentType: 'image/webp' }
  | { convertida: false; motivo: string }

/**
 * Devuelve `convertida: false` en vez de tirar error cuando no puede o no
 * conviene convertir -- quien llama se queda con el original. Una foto que el
 * socio ya subió no se pierde nunca por un problema de codificación.
 */
export async function convertirAWebp(original: Buffer): Promise<ResultadoConversion> {
  let meta: Metadata
  try {
    meta = await sharp(original).metadata()
  } catch (err) {
    // Caso real esperable: HEIC/HEIF. El sharp del entorno de deploy puede no
    // traer libheif compilado (va aparte por patentes), así que la
    // decodificación falla acá. iOS convierte a JPEG al subir por un input de
    // archivo, por eso en la práctica casi nunca llega un HEIC.
    return { convertida: false, motivo: `no se pudo decodificar: ${(err as Error).message}` }
  }

  const calidad = meta.format === 'png' ? CALIDAD_GRAFICO : CALIDAD

  let principal: Buffer
  let miniatura: Buffer
  try {
    // `rotate()` sin argumentos aplica la orientación EXIF de la cámara y la
    // normaliza a píxeles. Sin esto una foto sacada en vertical se guarda
    // rotada: el WebP no arrastra ese tag igual que el JPEG y se ve acostada.
    // `withoutEnlargement` deja intacta una imagen que ya es más chica que el
    // tope -- nunca se interpola hacia arriba.
    principal = await sharp(original)
      .rotate()
      .resize({ width: LADO_MAXIMO, height: LADO_MAXIMO, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: calidad, effort: 4 })
      .toBuffer()

    // La miniatura sale de la principal, NO del original: decodificar dos
    // veces una foto de 8MB son ~110MB de bitmap por pipeline, y en una
    // función serverless eso se paga en memoria y en tiempo. A 800px, bajando
    // desde 2400px, no hay diferencia visible con hacerlo desde el original.
    miniatura = await sharp(principal)
      .resize({ width: LADO_MINIATURA, height: LADO_MINIATURA, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: CALIDAD_MINIATURA, effort: 4 })
      .toBuffer()
  } catch (err) {
    return { convertida: false, motivo: `falló la codificación: ${(err as Error).message}` }
  }

  // Una imagen chica y ya optimizada (un WebP que alguien suba a mano, un PNG
  // de 30KB) puede salir más pesada. Convertir ahí no aporta nada.
  if (principal.byteLength >= original.byteLength) {
    return { convertida: false, motivo: 'el webp no pesa menos que el original' }
  }

  return { convertida: true, principal, miniatura, contentType: 'image/webp' }
}
