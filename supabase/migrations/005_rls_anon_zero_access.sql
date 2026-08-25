-- Cierre final: el cliente ya no habla con Supabase en absoluto (ver
-- app/api/data/route.ts y lib/supabase.ts eliminado). La anon key pública
-- no tiene ningún uso legítimo restante -- se le revoca también el
-- SELECT que 004_rls_write_lockdown.sql le había dejado. Queda con 0
-- policies en las 6 tablas (equivalente a 0 acceso).

do $$
declare
  t text;
begin
  foreach t in array array['proveedores','beneficiarios','catalogo_insumos','asignaciones','ayuda_memoria','precios_proveedor']
  loop
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = t) then
      execute format('drop policy if exists anon_select on public.%I', t);
    end if;
  end loop;
end $$;

-- ============================================================
-- ROLLBACK: si algo externo a la app necesitaba leer con la anon key,
-- restaurar con:
-- do $$
-- declare
--   t text;
-- begin
--   foreach t in array array['proveedores','beneficiarios','catalogo_insumos','asignaciones','ayuda_memoria','precios_proveedor']
--   loop
--     if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = t) then
--       execute format('create policy anon_select on public.%I for select to anon using (true)', t);
--     end if;
--   end loop;
-- end $$;
