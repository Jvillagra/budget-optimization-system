-- App sin capa de auth: el cliente usa la anon key para todo el CRUD.
-- RLS fue activado a nivel de proyecto Supabase (auditoría de seguridad de
-- neurobot-innovations-platform, mismo proyecto) sin agregar policies acá,
-- lo que dejó las 6 tablas devolviendo 0 filas al anon key (200 OK, array vacío).
-- Restauramos el comportamiento previo: acceso completo para anon.

do $$
declare
  t text;
begin
  foreach t in array array['proveedores','beneficiarios','insumos','catalogo_insumos','asignaciones','ayuda_memoria','precios_proveedor']
  loop
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = t) then
      execute format('drop policy if exists anon_all on public.%I', t);
      execute format(
        'create policy anon_all on public.%I for all to anon using (true) with check (true)',
        t
      );
    end if;
  end loop;
end $$;
