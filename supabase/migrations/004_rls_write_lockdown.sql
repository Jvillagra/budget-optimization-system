-- Cierra el hueco abierto por 003_rls_anon_policies.sql: aquella migración
-- restauró la app dando a `anon` SELECT+INSERT+UPDATE+DELETE con
-- `using (true) with check (true)` -- es decir, cualquiera con la anon key
-- pública (visible en el bundle del cliente / devtools) podía borrar o
-- alterar cualquier fila de un programa de beneficios comunitario real.
--
-- Esta migración:
--   1. Deja a `anon` con SELECT-only (la app sigue siendo un roster de
--      lectura pública, eso no cambia).
--   2. Revoca INSERT/UPDATE/DELETE de `anon`. Toda escritura ahora pasa por
--      Route Handlers server-side (app/api/asignaciones, /api/proveedores,
--      /api/precios-proveedor) que usan el service_role key -- nunca
--      expuesto al cliente -- y quedan además detrás de un gate de
--      contraseña compartida (middleware.ts + lib/auth.ts).
--   3. Agrega audit_log: cada escritura hecha vía esas rutas queda
--      registrada (tabla, operación, row_id, payload, timestamp). No hay
--      identidad por usuario porque la app no tiene login individual; es
--      trazabilidad de "qué cambió y cuándo", no de "quién lo hizo".
--
-- Nota sobre deuda preexistente: la tabla real en producción es
-- `catalogo_insumos` (con `precios_proveedor` separada), no `insumos` como
-- describe 001_initial_schema.sql -- ese archivo quedó desactualizado
-- respecto al esquema real hace tiempo, sin que ninguna migración lo
-- documentara. No lo reescribimos (las migraciones ya aplicadas no se
-- editan), pero dejamos esto anotado para que el próximo que lea 001 no se
-- confunda. La lista de tablas de abajo usa los nombres reales verificados
-- contra information_schema.

do $$
declare
  t text;
begin
  foreach t in array array['proveedores','beneficiarios','catalogo_insumos','asignaciones','ayuda_memoria','precios_proveedor']
  loop
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = t) then
      execute format('drop policy if exists anon_all on public.%I', t);
      execute format('drop policy if exists anon_select on public.%I', t);
      execute format(
        'create policy anon_select on public.%I for select to anon using (true)',
        t
      );
    end if;
  end loop;
end $$;

-- Tabla de auditoría para las escrituras que ahora sólo puede hacer el
-- service_role (vía las Route Handlers).
create table if not exists public.audit_log (
  id uuid primary key default uuid_generate_v4(),
  tabla text not null,
  operacion text not null check (operacion in ('insert', 'update', 'delete')),
  row_id text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_log_tabla_created on public.audit_log(tabla, created_at desc);

alter table public.audit_log enable row level security;
-- Nadie lee/escribe audit_log directo con la anon key; sólo el service_role
-- (que bypassa RLS) la usa desde el server. Sin policies para `anon` acá a
-- propósito: 0 acceso, no "acceso total por default" como pasó la vez pasada.

-- ============================================================
-- ROLLBACK (ejecutar a mano si esto rompe algo en producción):
-- ============================================================
-- do $$
-- declare
--   t text;
-- begin
--   foreach t in array array['proveedores','beneficiarios','catalogo_insumos','asignaciones','ayuda_memoria','precios_proveedor']
--   loop
--     if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = t) then
--       execute format('drop policy if exists anon_select on public.%I', t);
--       execute format('create policy anon_all on public.%I for all to anon using (true) with check (true)', t);
--     end if;
--   end loop;
-- end $$;
-- drop table if exists public.audit_log;
