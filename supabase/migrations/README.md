# Migraciones — reglas para no repetir el incidente de RLS

**2026-08-25:** `budget-optimization-system` estuvo horas mostrando 0 datos en
producción porque RLS se activó en las 6 tablas de este proyecto Supabase
compartido (`vapmlcsspvskiswmnbmw`) sin ninguna policy — `anon` quedó sin
acceso de lectura, en silencio (200 OK, array vacío, sin error visible). El
fix de emergencia (`003_rls_anon_policies.sql`) fue demasiado permisivo
(`anon` con ALL/`using(true)`), lo que abrió un hueco de escritura pública
sin control. `004_rls_write_lockdown.sql` lo corrigió: `anon` sólo SELECT,
las escrituras pasan por Route Handlers server-side con service_role +
password gate.

**Regla desde ahora:** cualquier migración que haga `CREATE TABLE` en este
repo **debe** incluir, en el mismo archivo:
1. `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`
2. Las policies que correspondan (aunque sea `for select to anon using (true)`
   si la tabla es de lectura pública).

Nunca activar RLS "a nivel de proyecto" sin revisar qué apps del mismo
proyecto Supabase compartido dependen de policies que no existen.

**Deuda conocida:** `001_initial_schema.sql` describe una tabla `insumos`
que ya no existe en producción — en algún momento se migró a
`catalogo_insumos` + `precios_proveedor` sin dejar una migración que lo
documentara. Las migraciones históricas no se reescriben, pero cualquier
cambio de esquema nuevo debe traer su propio archivo (sin excepciones,
aunque se haya aplicado "a mano" antes).
