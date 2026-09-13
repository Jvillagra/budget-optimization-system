-- 013 — Insumos desactivables (2026-09-13)
--
-- `catalogo_insumos` no se podía tocar desde la app: /precios solo editaba
-- `precios_proveedor`. Corregir "Polines (3 a 4 cm)" o su formato de venta
-- exigía entrar a la base a mano.
--
-- `es_activo` replica lo que ya hace `proveedores`: desactivar es el
-- "eliminar" reversible. No se borra nada -- el insumo sale de los
-- selectores y de la matriz de precios, pero sus precios, las asignaciones
-- históricas y los snapshots de compra siguen resolviendo su nombre.
--
-- Borrar de verdad no es una opción: `asignaciones.insumo_id` es ON DELETE
-- RESTRICT (a propósito) y `precios_proveedor.insumo_id` es ON DELETE
-- CASCADE, así que un DELETE se llevaría los precios de un insumo que quizá
-- está en el carrito de alguien.

alter table catalogo_insumos
  add column if not exists es_activo boolean not null default true;

comment on column catalogo_insumos.es_activo is
  'false = fuera de los selectores y de la matriz de precios. No borra nada; se revierte.';
