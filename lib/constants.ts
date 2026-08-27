// Mínimo de fotos de comprobante que un socio necesita subir para que su
// compra pueda marcarse como completa en /rendicion. Distinto de MAX_FOTOS
// (tope de subida, 5, definido en app/mi-dashboard/page.tsx) -- este es el
// piso, no el techo.
export const FOTOS_REQUERIDAS = 3

// Beneficiario de prueba dejado a propósito en la tabla real para QA
// (login, subida de fotos) -- se identifica por email exacto, no por
// nombre. Se excluye de las vistas/reportes staff-facing para no mezclar
// datos de prueba con los 29 socios reales; la cuenta sigue activa y su
// propio /mi-dashboard sigue funcionando normalmente.
export const EMAIL_QA_SOCIO = 'neurobotinnovations@gmail.com'
