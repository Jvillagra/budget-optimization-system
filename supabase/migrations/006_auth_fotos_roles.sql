-- Fase 2: Magic Link + fotos de comprobante + dashboard por socio.
-- Ver docs/PRD-fase2-auth-fotos-dashboard.md para el diseño completo.

-- 1. Email por beneficiario (para resolver "quién es este socio" tras el
--    login por Magic Link).
alter table public.beneficiarios add column if not exists email text unique;

-- 2. Roles de owner/admin. Cualquier auth.users que NO esté acá y cuyo email
--    matchee un beneficiarios.email se resuelve como socio en el código de
--    la app (no en RLS -- todo el acceso sigue pasando por rutas /api/* con
--    service_role, igual que el resto de la app).
create table if not exists public.app_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin')),
  created_at timestamptz not null default now()
);
alter table public.app_roles enable row level security;
-- Sin policies para anon/authenticated: solo el service_role (bypassa RLS)
-- la lee, desde las rutas server-side.

-- 3. Metadatos de fotos de comprobante -- el archivo en sí vive en
--    Cloudflare R2 (r2_key), no en Supabase Storage.
create table if not exists public.fotos_compra (
  id uuid primary key default uuid_generate_v4(),
  beneficiario_id uuid not null references public.beneficiarios(id) on delete cascade,
  r2_key text not null unique,
  uploaded_at timestamptz not null default now()
);
create index if not exists idx_fotos_compra_beneficiario on public.fotos_compra(beneficiario_id);
alter table public.fotos_compra enable row level security;
-- Mismo criterio: 0 policies para anon, todo el acceso vía service_role.
