-- 008_proveedor_compra.sql
--
-- Agrega el proveedor REAL con el que cada beneficiario compró, como dato
-- persistido en la propia fila de beneficiarios.
--
-- Hasta ahora no existía ningún registro de con qué proveedor compró un
-- socio: el selector de /mi-dashboard es puramente un comparador
-- client-side (localStorage, ver lib/proveedor-context.tsx) y /rendicion
-- solo muestra un "mejor proveedor calculado" (el que cotiza más barato el
-- carrito completo, ver comentario en app/api/rendicion/route.ts) -- una
-- aproximación de reporte, no un hecho verificado. Este campo es el dato
-- real: staff lo setea en /rendicion al validar el comprobante de compra,
-- y una vez seteado debe dejar de ofrecerse como opción en el selector de
-- /mi-dashboard (ya no tiene sentido "comparar" con un proveedor con el
-- que el socio ya no puede comprar el mismo insumo).
--
-- Nullable porque la gran mayoría de beneficiarios no tiene compra
-- validada todavía. FK a proveedores sin on delete especial: un proveedor
-- activo no debería borrarse mientras haya compras registradas contra él
-- (comportamiento restrict por defecto de Postgres).

alter table beneficiarios
  add column proveedor_compra_id uuid references proveedores(id);

comment on column beneficiarios.proveedor_compra_id is
  'Proveedor real con el que el beneficiario compró, seteado por staff en /rendicion tras validar el comprobante. Distinto del "mejor proveedor calculado" que es solo una estimación de reporte -- ver app/api/rendicion/route.ts.';
