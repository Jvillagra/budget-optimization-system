-- 010 — Compra confirmada por segmento (2026-09-08)
--
-- María Inés cotiza con varios proveedores y, cuando elige el ganador de un
-- proyecto, marca la compra como confirmada. A partir de ahí ese segmento
-- pasa a la etapa de fotos/rendición y sus cantidades quedan de solo lectura.
--
-- Por segmento y no global: Cierre Perimetral e Invernadero se pueden comprar
-- a proveedores distintos y en fechas distintas.
--
-- El snapshot de precios es el punto del ejercicio: `precios_proveedor` sigue
-- editándose después (hace falta para cotizar el OTRO segmento, y el precio
-- de "Polines" lo comparten los dos), así que sin la foto del precio pagado
-- un cambio posterior descuadraría una rendición ya cerrada.

create table if not exists compras_segmento (
  segmento        text primary key check (segmento in ('Invernadero', 'Cierre Perimetral')),
  proveedor_id    uuid not null references proveedores(id),
  confirmada_at   timestamptz not null default now(),
  confirmada_by   text
);

comment on table compras_segmento is
  'Un segmento con fila acá = compra confirmada. Revertir = borrar la fila (y su snapshot en cascada).';

create table if not exists compras_segmento_precio (
  segmento        text not null references compras_segmento(segmento) on delete cascade,
  insumo_id       uuid not null references catalogo_insumos(id),
  precio_unitario numeric,
  primary key (segmento, insumo_id)
);

comment on table compras_segmento_precio is
  'Precio pagado por insumo al confirmar. Congela la rendición del segmento frente a ediciones posteriores en precios_proveedor.';

-- Mismo criterio que 005_rls_anon_zero_access: RLS activo y CERO policies.
-- Todo pasa por route handlers con service_role; anon no lee ni escribe.
alter table compras_segmento enable row level security;
alter table compras_segmento_precio enable row level security;
