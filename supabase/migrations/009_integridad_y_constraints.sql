-- 009_integridad_y_constraints.sql
--
-- Cierra las reglas que hasta ahora solo existían en TypeScript. Todo lo de
-- acá es la clase de invariante que un cliente concurrente puede violar por
-- mucho que el route handler la valide: dos peticiones simultáneas leen el
-- mismo conteo y ambas pasan.
--
-- Idempotente: se puede correr más de una vez sin efecto adicional.

-- ============================================================
-- 1. precios_proveedor: la constraint que el upsert ya asumía
-- ============================================================
-- app/api/precios-proveedor/route.ts hace
--   upsert(..., { onConflict: 'proveedor_id,insumo_id' })
-- sobre una constraint que NINGUNA migración declaraba. En producción SÍ
-- existe (`precios_proveedor_proveedor_id_insumo_id_key`, creada a mano y
-- nunca versionada), pero un entorno reconstruido desde estas migraciones
-- no la tendría y el upsert duplicaría filas: dos precios para la misma
-- celda del maestro.
-- Solo se crea si no hay ya un índice único sobre esas columnas, para no
-- dejar dos índices redundantes encareciendo cada escritura.
do $$
begin
  if not exists (
    select 1
      from pg_index i
      join pg_class t on t.oid = i.indrelid
      join pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'public'
       and t.relname = 'precios_proveedor'
       and i.indisunique
       and i.indnatts = 2
       and (
         select array_agg(a.attname::text order by a.attname)
           from unnest(i.indkey) k
           join pg_attribute a on a.attrelid = t.oid and a.attnum = k
       ) = array['insumo_id','proveedor_id']
  ) then
    create unique index uq_precios_proveedor_prov_insumo
      on public.precios_proveedor (proveedor_id, insumo_id);
  end if;
end $$;

-- ============================================================
-- 2. Tope real de fotos por socio
-- ============================================================
-- El límite de 5 se validaba solo contando filas antes de insertar (TOCTOU:
-- dos POST concurrentes con count = 4 pasaban los dos). Esto lo hace
-- imposible a nivel de base.
create or replace function public.fn_tope_fotos_por_socio()
returns trigger
language plpgsql
as $$
declare
  actuales integer;
begin
  select count(*) into actuales
    from public.fotos_compra
   where beneficiario_id = new.beneficiario_id;

  if actuales >= 5 then
    raise exception 'El beneficiario ya alcanzó el máximo de 5 fotos de comprobante'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_tope_fotos_por_socio on public.fotos_compra;
create trigger trg_tope_fotos_por_socio
  before insert on public.fotos_compra
  for each row execute function public.fn_tope_fotos_por_socio();

-- ============================================================
-- 3. Beneficiario de prueba: columna, no constante en el código
-- ============================================================
-- Hasta ahora el socio de QA se ocultaba con un `if` sobre un email
-- hardcodeado (EMAIL_QA_SOCIO) repetido en tres endpoints. Un dato de
-- prueba en producción escondido en el código de aplicación: cualquier
-- query directa a la tabla lo ve, y los conteos de /api/rendicion no
-- cuadran con la tabla sin que nada lo explique.
alter table public.beneficiarios
  add column if not exists es_prueba boolean not null default false;

update public.beneficiarios
   set es_prueba = true
 where lower(email) = 'neurobotinnovations@gmail.com'
   and es_prueba = false;

comment on column public.beneficiarios.es_prueba is
  'true = fila de QA (login, subida de fotos). Se excluye de vistas y reportes staff-facing; su propio /mi-dashboard sigue funcionando. Reemplaza el filtro por email hardcodeado en lib/constants.ts.';

-- ============================================================
-- 4. Email de beneficiario, sin duplicados por mayúsculas
-- ============================================================
-- `email text unique` (006) distingue Juan@x.com de juan@x.com: son dos
-- socios distintos para Postgres y el mismo para Supabase Auth, que
-- normaliza a minúsculas. Resultado: el login resuelve a uno arbitrario.
-- Se normaliza lo existente y se impide que vuelva a pasar.
update public.beneficiarios
   set email = lower(trim(email))
 where email is not null
   and email <> lower(trim(email));

do $$
begin
  create unique index uq_beneficiarios_email_lower
    on public.beneficiarios (lower(email))
    where email is not null;
exception
  when duplicate_table then
    null; -- ya existe
  when unique_violation then
    raise notice 'Hay emails duplicados (ignorando mayúsculas) en beneficiarios: resolver a mano antes de crear el índice.';
end $$;

-- ============================================================
-- 5. Deuda de 001_initial_schema.sql (documental, no ejecutable)
-- ============================================================
-- 001 describe una tabla `insumos` y una columna `beneficiarios.proyecto`
-- que NO existen en producción: el esquema real usa `catalogo_insumos` +
-- `precios_proveedor` y `beneficiarios.segmento`. 002 siembra además 29
-- beneficiarios de ficción. Consecuencia: `supabase db reset` sobre este
-- directorio NO reconstruye un entorno usable.
-- No se editan migraciones ya aplicadas; queda anotado acá, que es el
-- archivo más nuevo y por tanto el que alguien lee primero.
comment on table public.catalogo_insumos is
  'Catálogo real de insumos (reemplazó a la tabla `insumos` de 001_initial_schema.sql, que nunca existió en producción). Los precios viven en precios_proveedor, no acá.';

-- ============================================================
-- ROLLBACK (ejecutar a mano):
-- ============================================================
-- drop trigger if exists trg_tope_fotos_por_socio on public.fotos_compra;
-- drop function if exists public.fn_tope_fotos_por_socio();
-- drop index if exists public.uq_precios_proveedor_prov_insumo; -- solo si la creó esta migración
-- drop index if exists public.uq_beneficiarios_email_lower;
-- alter table public.beneficiarios drop column if exists es_prueba;
