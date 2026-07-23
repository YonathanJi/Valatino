-- 030: Módulo de Gestión Humana (RRHH).
-- Empleados de la empresa vinculados a su cuenta de acceso (auth.users), con
-- cargo (identificador único), tipo de contratación, correos personal/empresa,
-- fecha de vinculación y salario opcional. Histórico mes a mes por empleado
-- mediante snapshots idempotentes (RPC generar_historial_gh).
-- RLS activa sin policies: solo el backend (service_role vía NestJS) accede.

-- ============================================================
-- 1. Nuevo módulo asignable del backoffice
-- ============================================================

alter table public.staff_modulos
  drop constraint staff_modulos_modulo_check;

alter table public.staff_modulos
  add constraint staff_modulos_modulo_check
  check (modulo in ('pedidos', 'catalogo', 'inventario', 'dashboard', 'compras', 'gestion_humana'));

-- ============================================================
-- 2. Cargos (los "roles" de RRHH), con identificador único
-- ============================================================

create table public.cargos (
  id          uuid primary key default gen_random_uuid(),
  codigo      varchar(20) not null unique,
  nombre      varchar(120) not null,
  descripcion text,
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table public.cargos enable row level security;

insert into public.cargos (codigo, nombre, descripcion) values
  ('GER',    'Gerente General',                     'Máximo responsable de la compañía'),
  ('DIRCOM', 'Director Comercial',                  'Responsable del área comercial y de ventas'),
  ('DIROP',  'Director de Operaciones',             'Responsable de operaciones y logística'),
  ('DIRADM', 'Director Administrativo y Financiero','Responsable de administración y finanzas'),
  ('COORTH', 'Coordinador de Talento Humano',       'Gestión de personas y procesos de RRHH'),
  ('ASECOM', 'Asesor Comercial',                    'Atención y ventas a clientes')
on conflict (codigo) do nothing;

-- ============================================================
-- 3. Empleados (vinculados a una cuenta de acceso)
-- ============================================================

create table public.empleados (
  id                   uuid primary key default gen_random_uuid(),
  -- Cada empleado corresponde a una cuenta de acceso (staff). Si se elimina la
  -- cuenta, cae el empleado (y su histórico) en cascada.
  user_id              uuid not null unique references auth.users (id) on delete cascade,
  nombre_completo      varchar(200) not null,
  documento            varchar(40) not null unique,
  telefono             varchar(30),
  correo_personal      varchar(200),
  correo_empresa       varchar(200) not null unique,
  cargo_id             uuid not null references public.cargos (id),
  tipo_contratacion    varchar(40) not null
    check (tipo_contratacion in (
      'Indefinido', 'Temporal', 'Prácticas',
      'Formación en alternancia', 'Fijo discontinuo', 'Autónomo/Mercantil'
    )),
  fecha_vinculacion    date not null,
  fecha_desvinculacion date,
  salario              numeric(12,2) check (salario is null or salario >= 0),
  activo               boolean not null default true,
  notas                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table public.empleados enable row level security;

create index empleados_cargo_idx on public.empleados (cargo_id);
create index empleados_activo_idx on public.empleados (activo);

-- ============================================================
-- 4. Histórico mensual (snapshot por empleado y mes)
-- ============================================================

create table public.empleado_historial_mensual (
  id                uuid primary key default gen_random_uuid(),
  empleado_id       uuid not null references public.empleados (id) on delete cascade,
  anio              int not null,
  mes               int not null check (mes between 1 and 12),
  -- snapshot del estado del empleado en ese mes
  nombre_completo   varchar(200) not null,
  cargo_id          uuid,
  cargo_codigo      varchar(20),
  cargo_nombre      varchar(120),
  tipo_contratacion varchar(40),
  correo_empresa    varchar(200),
  salario           numeric(12,2),
  activo            boolean not null,
  fecha_vinculacion date,
  generado_at       timestamptz not null default now(),
  unique (empleado_id, anio, mes)
);

alter table public.empleado_historial_mensual enable row level security;

create index empleado_historial_periodo_idx
  on public.empleado_historial_mensual (anio, mes);

-- ============================================================
-- 5. RPC: generar el histórico de un mes (idempotente)
--    Toma una foto de todos los empleados ya vinculados a fecha del mes.
--    Repetirlo actualiza el snapshot en vez de duplicar.
-- ============================================================

create or replace function public.generar_historial_gh(p_anio int, p_mes int)
returns int
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_count int;
begin
  if p_mes < 1 or p_mes > 12 then
    raise exception 'Mes inválido: %', p_mes;
  end if;

  insert into empleado_historial_mensual (
    empleado_id, anio, mes, nombre_completo, cargo_id, cargo_codigo, cargo_nombre,
    tipo_contratacion, correo_empresa, salario, activo, fecha_vinculacion
  )
  select
    e.id, p_anio, p_mes, e.nombre_completo, e.cargo_id, c.codigo, c.nombre,
    e.tipo_contratacion, e.correo_empresa, e.salario, e.activo, e.fecha_vinculacion
  from empleados e
  left join cargos c on c.id = e.cargo_id
  where date_trunc('month', e.fecha_vinculacion) <= make_date(p_anio, p_mes, 1)
  on conflict (empleado_id, anio, mes) do update set
    nombre_completo   = excluded.nombre_completo,
    cargo_id          = excluded.cargo_id,
    cargo_codigo      = excluded.cargo_codigo,
    cargo_nombre      = excluded.cargo_nombre,
    tipo_contratacion = excluded.tipo_contratacion,
    correo_empresa    = excluded.correo_empresa,
    salario           = excluded.salario,
    activo            = excluded.activo,
    fecha_vinculacion = excluded.fecha_vinculacion,
    generado_at       = now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.generar_historial_gh(int, int) from public, anon, authenticated;
