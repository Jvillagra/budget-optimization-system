---
target: budget-optimization-system app (login, rendicion, admin, mi-dashboard)
total_score: 20
max_score: 36
na_heuristics: 10
p0_count: 2
p1_count: 2
timestamp: 2026-08-27T05-33-56Z
slug: tion-system-app-login-rendicion-admin-mi-dashboard
---
Method: dual-agent (A: general-purpose design review · B: general-purpose detector+browser)

## Design Health Score

| # | Heurística | Score | Hallazgo clave |
|---|---|---|---|
| 1 | Visibilidad del estado del sistema | 3/4 | Skeleton + `loadError` en `rendicion`; `admin/page.tsx` no maneja error de red al cargar roles |
| 2 | Coincidencia con el mundo real | 3/4 | Buen lenguaje de dominio; rol crudo `owner`/`admin` en inglés visible en `admin/page.tsx:87` |
| 3 | Control y libertad del usuario | 1/4 | Sin confirmación al eliminar foto (`mi-dashboard`) ni al quitar admin (`admin`) |
| 4 | Consistencia y estándares | 2/4 | `DetalleCotizacionModal` usa estilos inline en vez del componente `Alert` que el propio sistema define |
| 5 | Prevención de errores | 2/4 | Sin validación de email antes de enviar en `admin`; sin confirmación en acciones destructivas |
| 6 | Reconocer antes que recordar | 3/4 | Buenos badges/avatares; selector de proveedor sin buscador (aceptable hoy, no escala) |
| 7 | Flexibilidad y eficiencia | 1/4 | Cero búsqueda/filtro/orden en tabla de 30+ beneficiarios |
| 8 | Diseño estético y minimalista | 3/4 | Buena densidad mobile-first, consistente con `DESIGN_SYSTEM.md` |
| 9 | Ayuda a reconocer/recuperarse de errores | 2/4 | Mensajes de error genéricos sin causa ni siguiente paso; tooltip por hover inútil en touch |
| 10 | Ayuda y documentación | n/a | No aplica — herramienta operativa interna |

**Total: 20/36** (heurística 10 no aplica) — banda: por debajo del promedio de interfaces reales (20-32/40 normalizado ≈ equivalente a ~22/40).

## Design Specificity Verdict

**Evaluación LLM (Assessment A):** Especificidad real pero superficial, no estructural. La paleta verde/café, "Proyecto PAT" y el copy en español chileno informal distinguen esto de un dashboard SaaS genérico. Pero la arquitectura de cada pantalla — tarjetas KPI + tabla + modal + badges — es el patrón admin-dashboard más genérico que existe. Ninguna decisión de layout deriva específicamente de que el público real son adultos mayores de una comunidad indígena usando el celular en terreno. La especificidad vive en la capa de skin (color + copy), no en la capa de decisiones.

**Scan determinístico (Assessment B):** `detect.mjs` corrió contra `app/login/page.tsx`, `app/rendicion/page.tsx`, `app/admin/page.tsx`, `app/mi-dashboard/page.tsx` y `components/design-system/` → **0 hallazgos** de "AI slop" visual (gradientes IA, easing bounce/elastic, glow excesivo, tipografía genérica). Verificado que el motor funciona (sanity check con snippet sintético detectó correctamente antipatrones conocidos). Conclusión: el diseño no cae en los clichés visuales típicos de IA — coherente con el veredicto de A de que el problema no es "genérico feo", es "genérico bien ejecutado sin decisiones propias de producto".

**Evidencia de navegador (Assessment B, `/login`, real, medido):**
- Botón "Enviarme el link": **40px de alto** (< 44px recomendado para touch)
- Input de email: **42px de alto** (< 44px)
- Botón icono del header: **35×27px** — el más severo de los tres
- Input de email sin `autocomplete="email"` ni `inputmode="email"` (ambos `null`)
- Contraste del texto secundario **verificado NO es un problema real**: `rgba(0,0,0,0.62)` sobre blanco da ≈6.2:1, supera AA — se ve gris claro pero cumple. Esto corrige cualquier sospecha visual de contraste insuficiente.
- Sin overflow horizontal en 375px (verificado, `scrollWidth === clientWidth`)

Donde A y B se refuerzan: A señala que el público real (adultos mayores) hace de la fricción táctil un problema serio (texto 12px, borrado sin confirmar); B aporta la medición dura que confirma que los touch targets del flujo de entrada — el primer contacto de cualquier usuario con la app — ya están por debajo del estándar mobile antes de llegar a ninguna pantalla interna.

## Overall Impression

La app funciona y no tiene los clichés visuales de "hecho con IA" (el detector lo confirma en cero). El problema no es fealdad, es genericidad de decisiones: cualquier dashboard admin podría tener esta misma estructura. Sumado a eso, el flujo de entrada (login, lo primero que toca cualquier usuario) tiene 3 touch targets por debajo del mínimo táctil recomendado, medidos en el navegador real. La mayor oportunidad: mover la especificidad de la capa de color/copy a la capa de decisiones — qué se prioriza, cómo se previene el error, cómo se tranquiliza al usuario en el momento de mayor riesgo — y subir la ejecución táctil a un nivel que de verdad sirva a adultos mayores en el celular.

## What's Working

1. **`env(safe-area-inset-bottom)` en `MobileTabBar`** — cuidado real de iPhone en producción (home indicator), no genérico.
2. **Priorización mobile-first deliberada en `FilaCardMobile`** (`rendicion/page.tsx:272-276`) — decisión de jerarquía documentada y basada en frecuencia de uso real del staff en terreno.
3. **Auditoría de contraste ya hecha una vez** (`DESIGN_SYSTEM.md` sección 2) y **cero antipatrones de IA visual** confirmado por el detector — disciplina real, no cosmética.

## Priority Issues

**[P0] Sin confirmación al eliminar la única foto de comprobante**
Por qué importa: para un adulto mayor con motricidad fina reducida en pantalla táctil, un tap accidental borra trabajo real (re-fotografiar un comprobante quizás ya extraviado).
Fix: modal de confirmación con el lenguaje visual del sistema, no un `window.confirm` nativo.
Comando sugerido: `/impeccable harden`

**[P0] Touch targets por debajo de 44px en el flujo de login**
Por qué importa: medido en el navegador real — botón principal 40px, input de email 42px, botón de header 35×27px. Es literalmente la primera interacción de cualquier usuario con la app, y ya falla el estándar táctil antes de llegar a cualquier otra pantalla.
Fix: subir min-height a 44px en los componentes `Button`/`Input` del sistema de diseño (cambio centralizado, no por página), y agrandar el botón de header.
Comando sugerido: `/impeccable audit` seguido de `/impeccable polish`

**[P1] Quitar un admin sin confirmación**
Por qué importa: acción de gobernanza de la comunidad ejecutada en un tap, sin fricción ni registro visible de qué se está por hacer.
Fix: confirmación explícita nombrando al admin a remover.
Comando sugerido: `/impeccable harden`

**[P1] Sin manejo de error de red en `admin/page.tsx`**
Por qué importa: si falla el fetch de roles, la lista queda vacía en silencio — un owner puede leer "0 admins" como estado real en vez de fallo de carga.
Fix: replicar el patrón `loadError` + "Reintentar" que ya existe en `rendicion`.
Comando sugerido: `/impeccable harden`

**[P2] Inconsistencia de estados de loading entre páginas**
Por qué importa: skeleton animado en `rendicion` vs. texto plano "Cargando…" en `admin`/`mi-dashboard` — rompe la sensación de "un mismo producto" que el propio `DESIGN_SYSTEM.md` declara como objetivo.
Fix: unificar en el skeleton ya construido para `rendicion`.
Comando sugerido: `/impeccable layout`

**[P2] Sin búsqueda/filtro en tabla de 30+ beneficiarios**
Por qué importa: único mecanismo de navegación es scroll; sin atajo para el staff que busca un nombre puntual.
Fix: input de búsqueda simple filtrando `filas` por nombre.
Comando sugerido: `/impeccable layout`

**[P3] Rol crudo en inglés visible (`owner`/`admin`)**
Por qué importa: rompe la coherencia en español que el resto de la app cuida.
Fix: mapa de traducción simple.
Comando sugerido: `/impeccable clarify`

## Persona Red Flags

**Adulto mayor, primera vez en un dashboard, en su iPhone** (persona primaria real de este producto):
- Texto secundario/metadata en `text-xs` (12px) en toda la app por decisión de sistema — contraste verificado correcto, pero el tamaño sigue siendo un obstáculo de lectura real para este público, no cosmético.
- Borrar foto de un tap sin confirmar — el tipo exacto de error irreversible-por-descuido que más frustra a un usuario con motricidad fina reducida.
- El flujo "pegar link" para el ícono de inicio de iOS (copiar URL larga desde Mail, cambiar de app, pegar en un textarea) es una operación técnicamente sofisticada para quien nunca usó un dashboard web — nunca validada con un socio real, según el propio historial del proyecto.

**Staff en terreno con conectividad inestable:**
- El flujo de 3 pasos de subida de foto (`upload-url` → `PUT` a R2 → confirmar) no distingue en el mensaje de error en qué paso falló, ni si la foto quedó huérfana en R2 sin confirmar — ansiedad innecesaria justo cuando la conectividad ya es el problema.

## Minor Observations / Edge Cases de Diseño Faltantes

1. Nombre de beneficiario muy largo sin truncar en la tabla desktop (`rendicion/page.tsx:319-327`), sí truncado en mobile.
2. Estado "justo 3 de 5 fotos" (mínimo exacto) sin refuerzo visual distinto de "4 de 5".
3. Proveedor con 100% de ítems sin precio → total mostrado `$0` sin advertencia de que es engañoso.
4. Beneficiario sin insumos asignados en `mi-dashboard`: ve `$0` sin explicación (sí cubierto en el modal de `rendicion`, no acá).
5. Sin paginación/virtualización/header sticky en `/rendicion` — con 50+ filas el `<thead>` desaparece al hacer scroll.
6. `<select>` de proveedor sin `text-overflow` para nombres largos.
7. Centrado vertical del login (`min-h-[70vh] flex items-center`) sin ajuste cuando el teclado de iOS reduce el viewport — riesgo de tapar el input.
8. `MobileTabBar` con 7 tabs para usuarios dual-rol en `overflow-x-auto` sin scroll shadow/gradiente que indique que hay más tabs fuera de pantalla.
9. Sin control de edición concurrente (`setProveedorCompra`/`marcarCompleto`/`revertir`) — dos admins editando el mismo beneficiario producen "last write wins" silencioso.
10. Mensaje de link expirado en "pegar link" sin botón directo para pedir uno nuevo desde la misma pantalla.
11. Input de email en login sin `autocomplete="email"`/`inputmode="email"` (medido: ambos `null`).
12. Botón "Instalar app" sin estado post-instalación — puede reaparecer aunque ya esté instalada.

## Questions to Consider

1. Si el criterio documentado en `DESIGN_SYSTEM.md` es "que las 4 páginas se sientan como un mismo producto", ¿por qué el manejo de error de red y los estados de loading siguen siendo distintos entre `rendicion` y `admin`/`mi-dashboard`?
2. ¿Alguien probó el flujo completo de "pegar link" con un socio real de la comunidad, o resuelve el problema técnico sin validar la capacidad real del usuario de ejecutarlo sin ayuda?
3. Con touch targets medidos por debajo de 44px en la primera pantalla que toca cualquier usuario, ¿qué tan bold puede ser un "premium" que todavía no resolvió lo básico táctil?
