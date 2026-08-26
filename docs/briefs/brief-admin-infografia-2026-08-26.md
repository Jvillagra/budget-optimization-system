# Brief — Infografía + reorden de `app/admin/page.tsx`

Deriva del backlog abierto en `docs/briefs/backlog-diseno.md` tras el
rediseño visual del 2026-08-26. Decisiones tomadas con el usuario en esta
sesión (quedan fijadas acá para no re-derivarlas):

- "El menú" del backlog = las 3 secciones de acción actuales de la página
  (Owner/Admin, Informe consultora, Magic Links masivos), no el nav
  `STAFF_LINKS` de `components/Navbar.tsx`.
- La infografía va **arriba**, con datos reales (no decorativa): cantidad de
  owners y de admins activos, leída de `app_roles` (mismo endpoint que ya
  usa `AdminPage`, `GET /api/admin/roles`).
- Las 3 secciones de acción bajan, debajo de la infografía, en el mismo
  orden relativo que tienen hoy.

## Layout objetivo

```
┌─────────────────────────────────────┐
│  Administración (h1)                 │
│  ┌─────────────────────────────────┐ │
│  │  Infografía: N owners · N admins │ │ ← nueva, arriba
│  └─────────────────────────────────┘ │
│  Owner / Admin (listado + form)      │ ← baja, sin cambios internos
│  Informe para consultora             │ ← baja, sin cambios internos
│  Magic Links masivos                 │ ← baja, sin cambios internos
└─────────────────────────────────────┘
```

## Infografía — contenido y datos

- Fuente de datos: la misma llamada `GET /api/admin/roles` que ya hace
  `cargar()` en `AdminPage` — no agrega un endpoint nuevo. Derivar los
  conteos client-side con `.filter()` sobre `roles` (ya está en state).
- Mostrar 2 números: `owners = roles.filter(r => r.role === 'owner').length`
  y `admins = roles.filter(r => r.role === 'admin').length`.
- Mientras `loading` es `true`, mostrar placeholder (`—` o skeleton), igual
  que ya hace el resto de la página con "Cargando…".

## Dirección visual

Seguir `docs/DESIGN_SYSTEM.md` sección 2 (paleta) y 3 (tipografía) sin
excepción — no introducir tokens nuevos. Referencia de tono: skills
`impeccable` / `apple-design` ya usadas en la ronda de rediseño anterior
(restrained, sin gradientes decorativos nuevos, sin iconografía ajena a
`lucide-react` que ya está en el proyecto).

- Contenedor: `<Card>` existente (mismo componente que usan las 3 secciones
  de abajo), para no introducir un cuarto lenguaje visual de tarjeta.
- Dos cifras lado a lado (flex/grid 2 columnas), número grande + label
  chica debajo, mismo patrón tipográfico que usa el resto del dashboard
  para jerarquía número/label (revisar `app/mi-dashboard` o `app/rendicion`
  para el patrón exacto de tamaño antes de implementar, no inventar uno).
- Color de acento: `--verde-dark` para "owners" (rol de mayor jerarquía),
  `--cafe-dark` para "admins" — mismo criterio semántico que ya usa
  `<Badge tone="verde"|"cafe">` en el listado de roles de esta misma página.
- Contraste: reusar los pares ya auditados en `DESIGN_SYSTEM.md` (no
  inventar combinaciones nuevas que requieran re-auditar WCAG).

## Fuera de alcance

- No se toca `components/Navbar.tsx` ni `STAFF_LINKS`.
- No se agrega un endpoint nuevo — todo sale de `GET /api/admin/roles`.
- No se cambia el comportamiento de las 3 secciones existentes, solo su
  posición vertical.

## Criterio de éxito

- La infografía muestra el conteo correcto de owners/admins y se actualiza
  tras agregar/quitar un admin (mismo `cargar()` que ya dispara esas
  acciones).
- Las 3 secciones existentes siguen funcionando igual (agregar/quitar
  admin, descargar informe, enviar Magic Links) — cero cambios de lógica,
  solo de orden en el JSX.
- Contraste de la infografía cumple AA reusando pares ya documentados.
