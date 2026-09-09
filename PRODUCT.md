# Product

<!-- impeccable:product-schema 1 -->

<!-- Escrito en español a propósito: todo el corpus de este repo (docs/PRD.md,
     docs/CONTEXT.md, docs/briefs/, los comentarios del código) está en
     español, y una isla en inglés acá se leería como documento ajeno. -->

## Platform

web

## Users

**Socios (29).** Miembros de la Comunidad Pedro Huisca, comunidad agrícola
chilena. Son el usuario primario en volumen. Entran desde el **celular, en el
campo, con señal mala** — la app tiene que tolerar red intermitente y luz de
sol directa, y pesar poco. Su trabajo es uno solo: **subir las fotos de los
comprobantes de su compra** y ver cuánto gastó contra su presupuesto.

Dos hechos de esta población son restricciones de diseño, no preferencias:
- **Vista cansada.** La letra chica no sirve. El piso de tamaño de texto y de
  contraste va por encima del default de la industria.
- **Poca experiencia con apps.** Para varios es la primera app que usan. Cero
  jerga, un solo camino obvio por pantalla, nada escondido detrás de un ícono
  sin etiqueta.

**Staff (2): owner y admin.** Juan Villagra (owner) y María Inés Burgos
(admin). Permisos idénticos; el rol solo etiqueta quién hizo qué. María Inés
además es socia, así que una misma persona ocupa los dos lados del producto.
Su trabajo es cotizar, comparar proveedores, asignar materiales a cada socio,
cerrar la compra y **perseguir la rendición socio por socio**: saber a quién
llamar hoy es el resultado que buscan en pantalla.

## Product Purpose

Administra el fondo de materiales de un programa PAT para la Comunidad Pedro
Huisca: **$189.000 CLP de presupuesto por socio**, 29 socios, dos proyectos
(Cierre Perimetral, 20 socios; Invernadero, 9 socios).

El ciclo completo que cubre: cotizar los insumos con distintos proveedores →
armar el carrito de cada socio dentro de su presupuesto → consolidar la compra
de la comunidad → cerrar la compra congelando precios y cantidades → **rendir**
esa compra con los comprobantes fotográficos de cada socio.

Éxito = los 29 socios quedan rendidos con sus comprobantes cargados, y el
dinero del fondo queda cuadrado contra lo efectivamente comprado.

## Positioning

Lo que ninguna planilla ni herramienta de compras genérica hace: **el
presupuesto es por persona, pero la compra es colectiva**. El sistema mantiene
las dos verdades a la vez — el saldo individual de cada socio (y su aporte de
bolsillo cuando se pasa) y la cotización consolidada con la que la comunidad
va a negociar con el proveedor — y después las vuelve a unir en la rendición,
donde cada peso del consolidado tiene que tener una foto detrás.

Congelar precios y cantidades al marcar una compra como hecha es la pieza que
convierte esto de una calculadora en un registro: después de esa marca, la
lista de precios del proveedor puede cambiar y la rendición no se mueve.

## Operating Context

- **La compra se rinde hacia afuera.** La rendición (fotos + montos) se le
  entrega a un **organismo formal externo**, no es control interno. *Decisión
  abierta:* cuál es el organismo exacto y qué formato exige todavía no está
  confirmado. No inventar un formato ni prometer en la UI que la app cumple
  uno hasta que se confirme.
- **Terreno, no escritorio.** El socio opera de pie, con el celular, con
  conexión intermitente. El staff sí puede estar en escritorio, pero también
  revisa desde el teléfono.
- **Camino real de una foto:** el socio compra, fotografía la boleta y la sube.
  Se exigen **3 comprobantes** (`FOTOS_REQUERIDAS`) para que su rendición pueda
  marcarse completa; el tope de subida es 5.
- **Entrada por Magic Link.** No hay contraseñas. Cada persona entra con su
  email; el socio se resuelve por match de email contra la tabla de
  beneficiarios, el staff por estar en `app_roles`.
- **PWA instalable.** La app se ofrece para instalar en el teléfono (Android
  vía `beforeinstallprompt`, iOS con instrucción manual de Safari).

## Capabilities and Constraints

Capacidades confirmadas, hoy en producción:

- Maestro de precios por proveedor e insumo (`/precios`).
- Gestión de beneficiarios y su carrito de insumos (`/beneficiarios`).
- Simulador comparativo de proveedores (`/simulador`).
- Consolidado de compra de los dos proyectos, con cierre por proyecto que
  congela precios y cantidades, reversible (`/rendicion`, sub-tab Resumen).
- Seguimiento de rendición socio por socio, con filtro por etapa
  (completo / listo para marcar / faltan fotos / sin fotos) (`/rendicion`).
- Dashboard personal del socio con su gasto y composición (`/mi-dashboard`).
- Administración de admins y envío de Magic Links (`/admin`).

Restricciones y hechos técnicos:

- Presupuesto **fijo** de $189.000 CLP por socio ($5.481.000 total). No es
  configurable por UI hoy.
- Los dos segmentos (Cierre Perimetral, Invernadero) están **codificados** como
  valores del dominio, no son datos creables desde la app.
- Un mismo email no puede ser staff y socio al mismo tiempo en `app_roles`;
  el caso dual (María Inés) se resuelve con el `beneficiarioId` propio del
  staff, no con dos roles.
- Todo escribe contra Supabase con `service_role` **server-side**; el cliente
  nunca tiene credenciales de escritura.
- Las fotos viven en Cloudflare R2, convertidas a WebP con miniatura.
- El proyecto se autoimpone **WCAG AA medido**, no estimado: la paleta de
  `app/globals.css` documenta el ratio de cada token contra el papel crema.

Terminología del dominio (usarla, no traducirla ni suavizarla): socio,
beneficiario, segmento/proyecto, insumo, polines, rendición, comprobante,
cotización, aporte de bolsillo, proveedor de compra, marcar completo, marcar
como comprado.

## Brand Commitments

- Nombre visible: **Proyecto PAT**. Logo en `public/logo.png` (disco crema con
  árboles y leña) — de ahí sale la paleta corporativa vigente: verde bosque,
  terracota, naranja fuego sobre crema.
- Voz: español de Chile, directa y sin jerga. La UI le habla al socio como una
  persona, no como un sistema ("Nadie sobre su presupuesto", "Se habilita con
  3 comprobantes").
- El producto es de la comunidad; **Neurobot Innovations** lo construye y lo
  opera, pero no se marca a sí mismo en la interfaz.

## Evidence on Hand

- **Datos reales de producción**: 29 socios con nombre y email, precios reales
  de proveedores (Sodimac entre ellos), asignaciones reales. Son personas
  identificables: cualquier captura o demo pública debe anonimizarse.
- Documentación propia: `docs/PRD.md`, `docs/PRD-fase2-auth-fotos-dashboard.md`,
  `docs/DESIGN_SYSTEM.md`, `docs/briefs/`. `docs/CONTEXT.md` está **desfasado**
  (2026-06-25, anterior a auth, fotos y rendición) — no citarlo como verdad
  actual.
- Un beneficiario de prueba (`es_prueba`) queda a propósito en la tabla real
  para QA; los conteos de la UI lo excluyen.
- **No existen** testimonios, casos de éxito, benchmarks, precios de licencia
  ni clientes además de esta comunidad. No fabricarlos.

## Product Principles

1. **El socio tiene un solo trabajo.** Todo lo que no sea "sube tus 3 fotos y
   entiende cuánto gastaste" compite con eso y pierde. Su pantalla no se
   negocia con la del staff.
2. **La pantalla del staff existe para decidir a quién llamar hoy.** Un dato
   que no cambia esa decisión no gana espacio, aunque sea interesante.
3. **Después de la marca, el registro no se mueve.** Precios y cantidades
   congelados al cerrar una compra son la base de una rendición que se entrega
   hacia afuera; nada en la UI puede sugerir que ese número todavía flota.
4. **Legible primero, denso después.** Vista cansada y sol directo son el caso
   base, no el borde: el contraste y el tamaño se miden, y ante la duda gana
   el tamaño sobre la cantidad de información.
5. **No prometer lo que el código no verifica.** Vigencia de precios, tiempo
   real, cumplimiento de un formato de rendición: cada afirmación de la
   interfaz tiene que tener una fuente de verdad detrás.

## Accessibility & Inclusion

Requisitos específicos de esta población, por encima del estándar:

- **Tamaño de texto:** el cuerpo no baja del tamaño legible para vista cansada;
  la letra chica gris tenue está prohibida como portadora de información
  necesaria. Los tonos apagados de texto ya se subieron a 4.91:1 por esta razón.
- **Contraste:** WCAG AA medido contra el papel crema real, no estimado, y
  suficiente para pantalla al sol.
- **Primera app:** un camino obvio por pantalla, etiquetas en palabras, ningún
  ícono solo como única pista de una acción, y el estado del sistema siempre
  escrito ("faltan 3", no un ícono ambiguo).
- **Áreas de toque** de 44px como piso, ya aplicado en la barra inferior y en
  las acciones de rendición.

## Open Decisions

- **Replicación a otras comunidades.** La dirección de producto confirmada es
  que esto se **replica en otras comunidades u organizaciones** como producto
  de Neurobot. Hoy la app es **single-tenant y hardcodeada**: presupuesto fijo,
  dos segmentos fijos, una sola comunidad, marca fija. Multi-tenant, marca
  configurable y onboarding **no están construidos** y no deben darse por
  supuestos al diseñar; tampoco deben cerrarse puertas innecesarias.
- **Organismo y formato de rendición.** Confirmado que existe un receptor
  formal externo; sin confirmar cuál y con qué formato. Hasta que se confirme,
  no diseñar un export "oficial" ni afirmar cumplimiento.
