-- 020: Permisos por módulo para el staff del backoffice.
-- El rol admin tiene acceso implícito a todo (no necesita filas aquí).
-- Los asesores solo ven los módulos que un admin les otorgue.

create table public.staff_modulos (
  user_id uuid not null references auth.users (id) on delete cascade,
  modulo text not null check (modulo in ('pedidos', 'catalogo', 'inventario')),
  otorgado_por uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, modulo)
);

alter table public.staff_modulos enable row level security;

-- Cada miembro del staff puede leer sus propios módulos (para el sidebar).
create policy staff_modulos_select_own
  on public.staff_modulos
  for select
  to authenticated
  using (user_id = auth.uid());

-- Escritura: sin policies — solo service_role (la API NestJS) puede escribir.
