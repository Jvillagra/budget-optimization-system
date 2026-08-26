-- 007_estado_rendicion.sql
--
-- Agrega el estado de "rendición" a cada beneficiario: si ya completó su
-- compra (subió el mínimo de fotos de comprobante requerido) para que
-- staff (owner/admin) pueda rendir el proyecto ante el financista.
--
-- No existía ningún campo de estado hasta ahora -- se infiere hoy en día
-- contando filas de fotos_compra, pero ese conteo no distingue "ya revisado
-- y aprobado por staff" de "tiene fotos pero nadie lo validó todavía". Este
-- campo es la marca explícita de validación humana, no un cálculo derivado.
--
-- compra_completa_by es una referencia informativa al user_id de
-- auth.users que hizo la marca (para trazabilidad en /rendicion y
-- audit_log) -- sin FK estricta a auth.users para no acoplar RLS de
-- `beneficiarios` al schema `auth`, que ya tiene sus propias policies.

alter table beneficiarios
  add column compra_completa boolean not null default false,
  add column compra_completa_at timestamptz,
  add column compra_completa_by uuid;

comment on column beneficiarios.compra_completa is
  'Marca manual de staff: true cuando la compra del beneficiario fue revisada y tiene el mínimo de fotos de comprobante para la rendición del proyecto (ver FOTOS_REQUERIDAS en lib/constants.ts).';
comment on column beneficiarios.compra_completa_at is
  'Timestamp de cuándo se marcó (o se revirtió) compra_completa por última vez.';
comment on column beneficiarios.compra_completa_by is
  'user_id (auth.users.id) de staff que hizo la última marca/reversión. Referencia informativa, sin FK estricta.';
