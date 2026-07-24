-- 031: Identificador de empleado estable e inmutable (EMP-0001), independiente
-- del cargo. El código del cargo (cargos.codigo) identifica el puesto; este
-- identifica a la persona y NO cambia aunque ascienda o cambie de cargo — clave
-- para la trazabilidad del histórico mensual y futuros modelos de datos.

alter table public.empleados
  add column numero_empleado int generated always as identity,
  add column codigo_empleado text
    generated always as ('EMP-' || lpad(numero_empleado::text, 4, '0')) stored;

alter table public.empleados
  add constraint empleados_numero_empleado_key unique (numero_empleado),
  add constraint empleados_codigo_empleado_key unique (codigo_empleado);

-- El snapshot histórico guarda también el código estable (inmutable) para que
-- cada fila del histórico sea autosuficiente en exportaciones/análisis.
alter table public.empleado_historial_mensual
  add column codigo_empleado varchar(20);

-- RPC v2: incluye codigo_empleado en el snapshot (idempotente).
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
    empleado_id, anio, mes, codigo_empleado, nombre_completo, cargo_id, cargo_codigo,
    cargo_nombre, tipo_contratacion, correo_empresa, salario, activo, fecha_vinculacion
  )
  select
    e.id, p_anio, p_mes, e.codigo_empleado, e.nombre_completo, e.cargo_id, c.codigo,
    c.nombre, e.tipo_contratacion, e.correo_empresa, e.salario, e.activo, e.fecha_vinculacion
  from empleados e
  left join cargos c on c.id = e.cargo_id
  where date_trunc('month', e.fecha_vinculacion) <= make_date(p_anio, p_mes, 1)
  on conflict (empleado_id, anio, mes) do update set
    codigo_empleado   = excluded.codigo_empleado,
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
