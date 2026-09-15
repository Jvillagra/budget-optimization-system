-- 017 — Proveedor por línea del carrito (2026-09-14)
--
-- Hasta hoy el proveedor de compra era uno por socio
-- (`beneficiarios.proveedor_compra_id`, o Sodimac si estaba en null). Juan
-- pidió que el polietileno de los socios de Invernadero se cotice en MCT
-- Villarrica y los polines sigan en Sodimac: dos proveedores en el mismo
-- carrito, cosa que ese modelo no podía decir.
--
-- `asignaciones.proveedor_id` en null significa "el del socio" (el confirmado,
-- y si no el de referencia). Con valor, esa línea se cotiza ahí. La regla de
-- resolución vive UNA vez en lib/business-logic.ts (proveedorDeLinea) y la
-- usan el carrito, la rendición, el ajuste al presupuesto y el consolidado:
-- si cada pantalla la reescribiera, dos de ellas terminarían discrepando
-- sobre el mismo socio -- el bug que definió este proyecto.
--
-- Se borra en cascada a null si el proveedor desaparece: la línea vuelve al
-- proveedor del socio en vez de quedar apuntando a nada.

alter table asignaciones
  add column if not exists proveedor_id uuid null references proveedores(id) on delete set null;

comment on column asignaciones.proveedor_id is
  'Proveedor con el que se cotiza ESTA línea. null = el proveedor del socio (beneficiarios.proveedor_compra_id, o el de referencia).';

create index if not exists asignaciones_proveedor_id_idx
  on asignaciones (proveedor_id) where proveedor_id is not null;
