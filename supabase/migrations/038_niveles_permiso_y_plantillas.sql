-- 038: Niveles de permiso por módulo y plantillas de permisos por cargo.
--
-- Hasta ahora el permiso era binario: `staff_modulos(user_id, modulo)` decía si
-- alguien tenía un módulo, y quien lo tenía podía hacer todo lo que el módulo
-- permite. Con un solo asesor eso bastaba; con seis cargos (Gerente General,
-- tres Directores, Coordinador de Talento Humano y Asesor Comercial) y gente
-- entrando, no: un director necesita reembolsar sin poder entrar a TI, y un
-- director financiero necesita CONSULTAR compras sin poder modificarlas.
--
-- Dos piezas:
--   1. `staff_modulos.nivel` — lectura < edicion < total. Sigue siendo lo único
--      que el guard lee en cada petición: sin joins en el camino caliente.
--   2. `cargo_modulos` — la plantilla de cada cargo. NO se consulta al
--      autorizar; es un molde que se COPIA a staff_modulos al provisionar la
--      cuenta, y que TI puede reaplicar. Así el alta de quince asesores es una
--      sola configuración, y una persona concreta puede llevar algo extra.

-- ---------------------------------------------------------------------------
-- 1. El nivel
-- ---------------------------------------------------------------------------

-- Dominio y no un CHECK repetido: el nivel vive en dos tablas, y el CHECK de
-- `modulo` ya ha tenido que reescribirse cuatro veces (023, 030, 032, 036) por
-- estar copiado. No repetir ese patrón.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'nivel_permiso') then
    create domain public.nivel_permiso as text
      check (value in ('lectura', 'edicion', 'total'));
  end if;
end $$;

-- Default 'lectura' y no 'edicion': es el único valor que falla cerrando. Con
-- la tabla vacía no migra ningún dato, pero cubre la ventana en la que la API
-- anterior siga insertando filas sin `nivel` (la migración se despliega antes
-- que el código).
--
-- La clave primaria sigue siendo (user_id, modulo) a propósito: meter `nivel`
-- en ella permitiría dos filas del mismo módulo con niveles distintos y
-- obligaría al guard a quedarse con el máximo.
alter table public.staff_modulos
  add column if not exists nivel public.nivel_permiso not null default 'lectura';

comment on column public.staff_modulos.nivel is
  'lectura < edicion < total. El rol admin no tiene filas aquí: es total en todo.';

-- La policy staff_modulos_select_own no se toca: es row-level, no
-- column-level, así que la web sigue leyendo su propia fila ya con el nivel.

-- ---------------------------------------------------------------------------
-- 2. Las plantillas por cargo
-- ---------------------------------------------------------------------------

create table if not exists public.cargo_modulos (
  cargo_id        uuid not null references public.cargos (id) on delete cascade,
  modulo          text not null check (modulo in (
                    'pedidos', 'catalogo', 'inventario', 'dashboard',
                    'compras', 'clientes', 'gestion_humana', 'ti'
                  )),
  nivel           public.nivel_permiso not null,
  actualizado_por uuid references auth.users (id) on delete set null,
  updated_at      timestamptz not null default now(),
  primary key (cargo_id, modulo)
);

alter table public.cargo_modulos enable row level security;
-- Sin policies: solo service_role. La plantilla la edita TI a través de la API,
-- nunca el navegador directamente.

comment on table public.cargo_modulos is
  'Plantilla de permisos de un cargo. Molde que se copia a staff_modulos al '
  'provisionar la cuenta; NO se consulta al autorizar.';

-- ---------------------------------------------------------------------------
-- 3. Escritura transaccional de permisos
-- ---------------------------------------------------------------------------

-- La API hacía DELETE y luego INSERT en dos viajes: si el INSERT fallaba, la
-- persona se quedaba sin ningún permiso. Al reaplicar una plantilla a N
-- empleados ese riesgo se multiplica por N, así que el reemplazo pasa a ser
-- atómico.
create or replace function public.reemplazar_staff_modulos(
  p_user_id uuid,
  p_permisos jsonb,
  p_otorgado_por uuid
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_insertados integer;
begin
  if jsonb_typeof(p_permisos) <> 'array' then
    raise exception 'p_permisos debe ser un array JSON' using errcode = '22023';
  end if;

  delete from public.staff_modulos where user_id = p_user_id;

  insert into public.staff_modulos (user_id, modulo, nivel, otorgado_por)
  select p_user_id,
         elem ->> 'modulo',
         (elem ->> 'nivel')::public.nivel_permiso,
         p_otorgado_por
  from jsonb_array_elements(p_permisos) as elem;

  get diagnostics v_insertados = row_count;
  return v_insertados;
end;
$$;

revoke execute on function public.reemplazar_staff_modulos(uuid, jsonb, uuid)
  from public, anon, authenticated;

-- Copia la plantilla de un cargo a los empleados que lo ocupan.
--
-- Es un REEMPLAZO completo, no una suma: un merge que solo añadiera nunca
-- convergería a la plantilla y con el tiempo todo el mundo acumularía permisos.
-- Que pise los ajustes individuales es la decisión correcta; avisar antes de
-- hacerlo es responsabilidad de la interfaz (ver el diff de «afectados»).
--
-- Idempotente por construcción: dos ejecuciones seguidas dejan el mismo estado.
create or replace function public.aplicar_plantilla_cargo(
  p_cargo_id uuid,
  p_otorgado_por uuid,
  p_user_ids uuid[] default null
)
returns table (
  empleado_id uuid,
  user_id uuid,
  nombre text,
  aplicado boolean,
  motivo text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_emp record;
  v_permisos jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('modulo', cm.modulo, 'nivel', cm.nivel)), '[]'::jsonb)
    into v_permisos
  from public.cargo_modulos cm
  where cm.cargo_id = p_cargo_id;

  for v_emp in
    select e.id, e.user_id, e.nombre_completo, e.activo,
           exists (
             select 1
             from public.user_roles ur
             join public.roles r on r.id = ur.role_id
             where ur.user_id = e.user_id and r.nombre = 'admin'
           ) as es_admin
    from public.empleados e
    where e.cargo_id = p_cargo_id
      and (p_user_ids is null or e.user_id = any (p_user_ids))
    order by e.nombre_completo
  loop
    -- Empleado que RRHH ha dado de alta pero al que TI aún no ha creado cuenta.
    if v_emp.user_id is null then
      return query select v_emp.id, null::uuid, v_emp.nombre_completo::text, false, 'sin_cuenta';
      continue;
    end if;

    -- El súper admin no se toca nunca: su acceso no sale de staff_modulos y
    -- dejarlo en manos de una plantilla sería la forma más fácil de que alguien
    -- se quedara fuera del sistema por accidente.
    if v_emp.es_admin then
      return query select v_emp.id, v_emp.user_id, v_emp.nombre_completo::text, false, 'es_admin';
      continue;
    end if;

    -- Quien ya no trabaja aquí no recibe permisos nuevos.
    if not v_emp.activo then
      return query select v_emp.id, v_emp.user_id, v_emp.nombre_completo::text, false, 'inactivo';
      continue;
    end if;

    perform public.reemplazar_staff_modulos(v_emp.user_id, v_permisos, p_otorgado_por);
    return query select v_emp.id, v_emp.user_id, v_emp.nombre_completo::text, true, null::text;
  end loop;
end;
$$;

revoke execute on function public.aplicar_plantilla_cargo(uuid, uuid, uuid[])
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. El cargo de quien está mirando
-- ---------------------------------------------------------------------------

-- El panel deja de mostrar «Asesor» y muestra el cargo real (Director
-- Comercial…). Hace falta una RPC porque `empleados` tiene RLS activa y CERO
-- policies: leerla con la sesión del usuario devuelve cero filas EN SILENCIO y
-- el cargo saldría siempre vacío sin ningún error visible.
--
-- Se descartó abrir una policy «select own» sobre `empleados`: expondría el
-- salario y las notas de RRHH para resolver una etiqueta de la interfaz.
create or replace function public.mi_cargo()
returns table (codigo varchar, nombre varchar)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.codigo, c.nombre
  from public.empleados e
  join public.cargos c on c.id = e.cargo_id
  where e.user_id = auth.uid()
  limit 1;
$$;

grant execute on function public.mi_cargo() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Plantillas de arranque para los seis cargos existentes
-- ---------------------------------------------------------------------------

-- Punto de partida razonable, no doctrina: son DATOS y TI los ajusta desde
-- «TI → Cargos» sin tocar código. Sin esta siembra la pantalla arranca vacía y
-- provisionar una cuenta no copiaría nada.
--
-- El Gerente General lleva `ti: lectura` a propósito: puede auditar quién tiene
-- qué, pero administrar cuentas y credenciales sigue siendo del súper admin.
insert into public.cargo_modulos (cargo_id, modulo, nivel)
select c.id, p.modulo, p.nivel::public.nivel_permiso
from (values
  -- Gerente General
  ('GER',    'dashboard',      'total'),
  ('GER',    'pedidos',        'total'),
  ('GER',    'clientes',       'total'),
  ('GER',    'compras',        'total'),
  ('GER',    'inventario',     'total'),
  ('GER',    'catalogo',       'total'),
  ('GER',    'gestion_humana', 'total'),
  ('GER',    'ti',             'lectura'),
  -- Director Comercial
  ('DIRCOM', 'pedidos',        'total'),
  ('DIRCOM', 'clientes',       'total'),
  ('DIRCOM', 'catalogo',       'edicion'),
  ('DIRCOM', 'inventario',     'lectura'),
  ('DIRCOM', 'dashboard',      'lectura'),
  -- Director de Operaciones
  ('DIROP',  'inventario',     'total'),
  ('DIROP',  'compras',        'total'),
  ('DIROP',  'catalogo',       'edicion'),
  ('DIROP',  'pedidos',        'edicion'),
  ('DIROP',  'dashboard',      'lectura'),
  -- Director Administrativo y Financiero
  ('DIRADM', 'dashboard',      'total'),
  ('DIRADM', 'compras',        'total'),
  ('DIRADM', 'pedidos',        'lectura'),
  ('DIRADM', 'clientes',       'lectura'),
  -- Coordinador de Talento Humano
  ('COORTH', 'gestion_humana', 'total'),
  ('COORTH', 'dashboard',      'lectura'),
  -- Asesor Comercial
  ('ASECOM', 'pedidos',        'edicion'),
  ('ASECOM', 'clientes',       'lectura'),
  ('ASECOM', 'catalogo',       'lectura')
) as p (cargo_codigo, modulo, nivel)
join public.cargos c on c.codigo = p.cargo_codigo
on conflict (cargo_id, modulo) do nothing;
