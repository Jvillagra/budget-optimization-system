// Mínimo de fotos de comprobante que un socio necesita subir para que su
// compra pueda marcarse como completa en /rendicion. Distinto de MAX_FOTOS
// (tope de subida, 5, definido en app/mi-dashboard/page.tsx) -- este es el
// piso, no el techo.
export const FOTOS_REQUERIDAS = 3

// Beneficiario de prueba dejado a propósito en la tabla real para QA
// (login, subida de fotos).
//
// OBSOLETO como fuente de verdad: desde la migración 009 la marca es la
// columna `beneficiarios.es_prueba`, para que una query directa a la tabla
// vea lo mismo que la app y los conteos cuadren. Esta constante queda solo
// como respaldo del filtro por si 009 todavía no se aplicó en algún
// entorno; una vez aplicada en todos, se puede borrar junto con los `||`
// que la usan en lib/rendicion-data.ts y app/api/data/route.ts.
export const EMAIL_QA_SOCIO = 'neurobotinnovations@gmail.com'
