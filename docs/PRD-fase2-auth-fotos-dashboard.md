# PRD — Fase 2: Auth por Magic Link, comprobantes de compra, dashboard por socio

**Proyecto:** budget-optimization-system (Proyecto PAT — Comunidad Pedro Huisca)
**Estado:** 🟡 En revisión — pendiente de tu aprobación antes de programar
**Fecha:** 2026-08-25

---

## 0. Resumen ejecutivo

Reemplaza el password-gate compartido (que acabamos de construir) por **identidad
real por persona vía Magic Link de Supabase Auth**: cada uno de los 29 socios
inicia sesión con su propio email, sube hasta 5 fotos de su compra, y ve un
dashboard personal con su gasto y un gráfico de composición por segmento.
María Inés Burgos (`mane.burgosc@gmail.com`) es **admin**, tú eres **owner**.
Diseño visual queda para una fase posterior (ya acordado).

---

## 1. Roles y permisos

**Ajuste vs. la v1 de este PRD:** María Inés (admin) tiene **exactamente los
mismos permisos que el owner**, incluyendo gestionar admins. La única
diferencia entre ambos roles es la etiqueta (para saber quién hizo qué en el
`audit_log`) — no hay ninguna acción reservada solo para owner.

Única excepción técnica, no funcional: quién es *el* owner es un dato que se
setea manualmente en la base (no un botón en la UI) — evita que alguien se
saque el rol de owner a sí mismo por error. No es una restricción de permisos,
es solo dónde vive ese dato.

| Acción | Owner / Admin | Socio (los 29) |
|---|---|---|
| Ver/editar beneficiarios, precios, proveedores | ✅ | ❌ |
| Ver dashboard consolidado / vista resumen | ✅ | ❌ (solo el propio) |
| Gestionar admins (agregar/quitar) | ✅ | ❌ |
| Enviar Magic Links masivos | ✅ | ❌ |
| Ver fotos de cualquier socio | ✅ | ❌ (solo las propias) |
| Ver/subir/borrar sus propias fotos (máx. 5) | — (no aplica) | ✅ |
| Ver su propio dashboard + gráfico | — | ✅ |

**Ajuste (v3):** el socio sí ve el contenido de sus propias fotos (miniatura
+ vista ampliada), no solo un contador. Al borrar una, desaparece de su vista
de inmediato (borrado real, no soft-delete visible). Owner/admin ven el
contenido de las fotos de cualquier socio.

Un mismo email **no puede** tener dos roles a la vez (owner/admin y socio son
mutuamente excluyentes en este proyecto).

## 2. Autenticación — diseño técnico

**Reemplaza** el sistema de contraseña compartida (`proxy.ts` + `lib/auth.ts`
+ cookie HMAC) por **Supabase Auth nativo, Magic Link (OTP por email), sin
contraseña**.

- `beneficiarios` gana columna `email` (nullable, unique cuando está seteado).
- Tabla nueva `app_roles (user_id uuid → auth.users, role text check in ('owner','admin'))`.
  Owner/admin se identifican por estar en esta tabla; cualquier otro usuario
  autenticado se resuelve como **socio** buscando su `beneficiario` por email.
- Sesión vía cookies de Supabase Auth (`@supabase/ssr`) en vez de la cookie
  HMAC custom — el proxy.ts pasa a verificar la sesión de Supabase, no la
  contraseña compartida.
- Las rutas `/api/*` siguen usando `service_role` server-side (sin cambios en
  ese patrón), pero ahora determinan el **rol real** del usuario antes de
  decidir qué datos devolver/permitir escribir (owner/admin → todo; socio →
  solo su propio `beneficiario_id`).

### 2.1 Envío de Magic Links — el punto que cambia el plan original

Configuro el **SMTP personalizado a nivel del proyecto Supabase**
(`vapmlcsspvskiswmnbmw` → Authentication → SMTP Settings) con el Gmail App
Password que ya usa `muni-villarrica-platform-db`, en vez de escribir código
de envío de emails dentro de esta app.

**Por qué así y no con nodemailer en la app:** una vez configurado a nivel de
proyecto, **cualquier app futura que uses en este mismo Supabase** hereda
automáticamente Magic Link con límites de Gmail (~500/día) en vez del límite
de Supabase gratis (2-4/hora) — sin escribir una línea de código de envío en
cada repo nuevo. Es la respuesta directa a tu pregunta de "cómo debe ser mi
autenticación para todas las apps que desarrolle" (ver sección 7).

El "envío masivo" para los 29 socios es entonces: un botón admin/owner que
recorre los `beneficiarios` con `email` seteado y llama
`supabase.auth.signInWithOtp({ email })` por cada uno (con una pequeña pausa
entre llamadas), reportando éxito/error por persona. No hace falta backend de
email propio.

**Checklist de configuración que hay que hacer con cuidado (causa raíz de un
problema pendiente en muni-villarrica, ver `project_muni_villarrica_chatbot_sprint1`
en memoria):** el **Site URL** y **Redirect URLs** de Supabase Auth deben
apuntar a `https://budget-optimization-system.vercel.app/**` *antes* de
probar el primer Magic Link real — si no, el link llega pero redirige mal y
"no funciona" en producción aunque el email se mande bien.

### 2.2 Prueba antes de cargar los 29 emails reales

Usamos `neurobotinnovations@gmail.com` como socio de prueba (asignado a un
`beneficiario` de prueba o a uno real, a definir) para validar el flujo
completo de punta a punta antes de que me pases la lista real de 29 emails.

## 3. Fotos de comprobante de compra

**Ajuste (v3): storage en Cloudflare R2, no en Supabase Storage.**

- Bucket privado en **Cloudflare R2** (ya tengo acceso al Cloudflare de
  Neurobot vía MCP para crearlo). R2 es compatible con la API S3 — subida y
  lectura se hacen con URLs firmadas (presigned) generadas **server-side**
  en las rutas `/api/*` existentes (mismo patrón que ya usa el resto de la
  app: el navegador nunca habla directo con el storage, solo pide una URL
  firmada de corta duración a nuestro backend).
- Nuevas env vars server-only: `CLOUDFLARE_R2_ACCOUNT_ID`,
  `CLOUDFLARE_R2_ACCESS_KEY_ID`, `CLOUDFLARE_R2_SECRET_ACCESS_KEY`,
  `CLOUDFLARE_R2_BUCKET`. Librería: `@aws-sdk/client-s3` +
  `@aws-sdk/s3-request-presigner` (R2 usa el protocolo S3).
- Tabla en Supabase (los metadatos siguen ahí, solo el archivo va a R2):
  `fotos_compra (id, beneficiario_id, r2_key, uploaded_at)`.
- Regla: **hasta 5 fotos por socio, ninguna obligatoria**. Validación
  server-side: tipo de archivo (jpg/png/webp/heic), tamaño máximo por foto
  (propongo 8MB), y rechazo si ya tiene 5.
- **El socio ve, sube y borra sus propias fotos** (miniatura + vista
  ampliada) — al borrar una, desaparece de su vista de inmediato. Owner/admin
  ven el contenido de las fotos de cualquier socio, sin poder subir en su
  nombre.

## 4. Dashboard por socio

Pantalla nueva (reemplaza el login-gate genérico por una vista propia post-login
para rol `socio`):

- Sus datos: nombre, segmento, presupuesto base.
- Su carrito real (`asignaciones`) con costo total y aporte de bolsillo —
  reutiliza la lógica que ya existe en `lib/business-logic.ts`
  (`calcularCostoCarrito`).
- **Gráfico de torta**: % de su gasto por segmento de cada ítem comprado
  (Invernadero / Cierre Perimetral / Ambos) — agrupa por
  `catalogo_insumos.segmento` de cada línea de su carrito, tal como pediste.
- Sección de fotos: ver, subir y borrar (hasta 5), guardadas en Cloudflare
  R2 (ver sección 3).

## 5. Migraciones necesarias (Supabase)

1. `beneficiarios.email text unique` (nullable).
2. `app_roles (user_id uuid primary key references auth.users, role text check (role in ('owner','admin')))`.
3. `fotos_compra (id uuid pk, beneficiario_id uuid references beneficiarios, r2_key text, uploaded_at timestamptz default now())`.
4. Bucket **Cloudflare R2** `comprobantes-compra` (privado, credenciales S3 vía env vars: `CLOUDFLARE_R2_ACCOUNT_ID`, `CLOUDFLARE_R2_ACCESS_KEY_ID`, `CLOUDFLARE_R2_SECRET_ACCESS_KEY`, `CLOUDFLARE_R2_BUCKET`).
5. Seed: insertar tu usuario (owner) y `mane.burgosc@gmail.com` (admin) en
   `app_roles` una vez que ambos hayan iniciado sesión al menos una vez (Supabase
   Auth crea el `auth.users.id` recién en el primer login).

## 6. Fuera de alcance de esta fase (confirmado contigo)

- Rediseño visual completo (skills de diseño) → **fase siguiente**, después
  de que esto funcione.
- Aprobación/moderación formal de las fotos subidas (admin las ve, pero no
  hay flujo de "aprobar/rechazar" a menos que me digas que lo necesitas).
- Carga real de los 29 emails → me los pasas tú cuando quieras probarlo con
  la comunidad completa.

## 7. Recomendación permanente: autenticación para tus futuras apps

1. **Supabase Auth + Magic Link como default**, no contraseñas propias. El
   password-gate que hice para esta app fue un parche válido de emergencia,
   no el patrón a repetir — cuesta más mantener y no da identidad individual.
2. **SMTP custom a nivel de proyecto Supabase, una sola vez** (no por app) —
   así todas tus apps en `vapmlcsspvskiswmnbmw` heredan envío de Magic Link
   sin código de email propio.
3. **`auth.users` es compartido entre TODAS tus apps** de este mismo proyecto
   Supabase — el mismo email/login sirve para budget-optimization-system,
   vista-magna, muni-villarrica, etc. Por diseño, eso NO da permisos
   automáticos en otra app: cada app debe tener su **propia tabla de roles**
   (como `app_roles` acá) y nunca asumir que "está logueado" = "tiene acceso
   a esta app". Te lo marco explícito porque es un error fácil de cometer.
4. **Registrar Site URL / Redirect URLs en Supabase Auth apenas se crea el
   proyecto/dominio**, no después del primer reporte de "el link no funciona"
   — ya nos pasó una vez (muni-villarrica).

## 8. Riesgos que quiero que sepas antes de aprobar

- Cambiar el mecanismo de auth es un cambio de arquitectura, no un parche —
  hay una ventana en que el password-gate deja de existir y el Magic Link
  debe quedar 100% probado antes, o la app queda inaccesible.
- El primer Magic Link real depende de que configures bien el SMTP en
  Supabase (yo lo dejo armado, pero la propagación/verificación de Gmail
  puede tardar y no la controlo del todo).
- Con 0 emails reales cargados todavía, solo puedo probar el flujo con la
  cuenta de prueba — el QA "a la primera" con los 29 socios reales depende de
  que la lista de emails que me pases sea correcta.

---

## ¿Apruebas este alcance para que empiece a programar?

Si algo de esto no es lo que imaginabas, dímelo ahora — es mucho más barato
ajustar el PRD que rehacer código.
