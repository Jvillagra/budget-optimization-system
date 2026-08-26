# Brief: Rediseño visual/UX — budget-optimization-system (2026-08-26)

## Rol y modelo
- Agente: implementación fullstack (Next.js/TypeScript/TailwindCSS).
- Alcance: SOLO diseño visual/UX. No arquitectura, no backend, no schema.

## Contexto
- Next.js App Router + TypeScript + TailwindCSS + Supabase.
- Hardening de seguridad cerrado 2026-08-25 (RLS anon SELECT-only, escrituras server-side, password gate, audit_log) — NO TOCAR.
- Fase 2 (Magic Link + fotos R2 + dashboard socio) implementada y verificada E2E 2026-08-26; `/rendicion` (cuadro de mando staff) recién en producción.
- Gotcha conocido: `router.replace` tras login puede rebotar por router cache prefetcheado → se usa `window.location.assign`. NO revertir eso.

## Páginas a intervenir (en este orden de prioridad)
1. `app/login/page.tsx` — punto de entrada, debe quedar impecable.
2. `app/rendicion/page.tsx` — cuadro de mando recién en prod, oportunidad de fijar el patrón visual nuevo.
3. `app/admin/page.tsx` — dashboard heredado, alinear al nuevo patrón.
4. `app/mi-dashboard/page.tsx` — dashboard beneficiario, comparar experiencia con admin.

## Restricciones estrictas (NO tocar)
- `app/api/**` (ninguna ruta).
- Queries/RLS/policies de Supabase, `supabase/migrations/**`.
- `.env.local`, `.env.example`, variables de entorno.
- Rutas existentes (mantener `/login`, `/admin`, `/rendicion`, `/mi-dashboard` intactas).
- Props públicas de componentes existentes (backward-compat) salvo que sea imprescindible — si se cambia, actualizar todos los usos.
- El flujo de Magic Link (`window.location.assign` post-login) y la estructura de forms de upload a R2.
- No agregar librerías nuevas de UI (mantener solo TailwindCSS + lo ya instalado).

## Qué sí se permite
- Crear componentes reutilizables en `components/design-system/` (Button, Card, Form, Badge, Alert).
- Definir paleta de colores, tipografía (2-3 familias máx.) y espaciado en grid de 8px.
- Tono visual: moderno + profesional, sobrio (cliente: municipios/ONGs), NO juguetón.
- Micro-interacciones sutiles (fade-in, hover/focus states) si aportan pulido sin romper nada.

## Skills a cargar en este orden
1. `redesign-existing-projects` (auditoría + dirección visual sin romper funcionalidad)
2. `apple-design` (motion sutil, estados de foco/interacción)
3. `impeccable` (auditoría final de pulido)

## Workflow
1. **Discovery**: leer las 4 páginas, documentar inconsistencias actuales (paleta, tipografía, espaciado, componentes duplicados).
2. **Sistema de diseño**: escribir `docs/DESIGN_SYSTEM.md` con paleta, tipografía, espaciado y catálogo de componentes base.
3. **Refactor**: crear componentes en `components/design-system/`, aplicar a las 4 páginas en el orden indicado.
4. **Capturas**: antes/después de cada página (guardar en `docs/briefs/capturas-2026-08-26/`).
5. **Auditoría**: correr `/impeccable` sobre los cambios; verificar contraste WCAG AA (≥4.5:1), focus states, navegación por teclado.
6. **Verificación funcional manual**: login → dashboard → rendición, sin errores de consola, sin romper Magic Link ni upload de fotos R2.
7. **Commit** (sin push): `refactor(ui): rediseño visual login/rendicion/admin/mi-dashboard — sistema de diseño cohesivo`.

## Criterio de éxito verificable
- [ ] Paleta/tipografía/espaciado consistentes en las 4 páginas.
- [ ] Capturas antes/después que muestren la mejora.
- [ ] Magic Link funciona igual que antes (verificar manualmente).
- [ ] Upload de fotos a R2 no roto.
- [ ] Contraste WCAG AA en textos clave.
- [ ] Sin errores nuevos en consola del navegador.
- [ ] `docs/DESIGN_SYSTEM.md` creado y documentado.

## Nota de cierre
Después de este commit, el `neurobot-adversarial-reviewer` audita el diff automáticamente en sesión headless separada. No hacer `git push` (bloqueado siempre, requiere permiso humano explícito).
