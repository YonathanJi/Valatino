-- 067: la limpieza se lleva también los empleados dados de alta probando, y la
-- cuenta que TI les provisionó.
--
-- Lo pidió Jonathan al ver el estado tras la primera limpieza: si contrata a
-- alguien de prueba en Gestión Humana, eso también es dato de prueba.
--
-- ⚠️ Y al mirarlo apareció un cabo suelto que la 066 dejaba abierto: el flujo
-- RRHH → TI crea DOS cosas —la ficha de `empleados` y su **cuenta de asesor**—.
-- La 066 borraba solo las cuentas de rol `cliente`, así que un empleado de
-- prueba desaparecía y **su cuenta de asesor se quedaba viva**, sin ficha
-- detrás. Eso contradice el estado que se busca: «solo vive el súper admin».
--
-- Así que la regla se simplifica en vez de complicarse:
--
--   SE VAN  todas las cuentas cuyo rol NO sea `admin` (clientes y asesores),
--           y todos los empleados con su histórico mensual.
--   SE QUEDA el `admin`, y **los cargos con sus plantillas de permisos**.
--
-- ⚠️⚠️ LOS CARGOS NO SE TOCAN, Y ES DELIBERADO. No son datos de prueba: son el
-- organigrama del negocio (Gerente General, Director Comercial…) con 27 filas
-- de permisos ajustadas a mano, sembradas en la 038 y editables desde TI. Un
-- empleado se contrata y se va; el puesto que ocupaba sigue existiendo.
-- Borrarlos dejaría TI → Cargos vacío y provisionar a alguien exigiría
-- reconstruir el organigrama entero.
--
-- Que esto sea seguro depende del guardia del arranque fiscal, que sigue en pie:
-- nada de esto se ejecuta una vez la tienda vende de verdad.

create or replace function public.limpiar_datos_de_prueba(p_actor_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_arranque   timestamptz;
  v_borrados   jsonb;
  v_pedidos    int;
  v_empleados  int;
  v_cuentas    int;
  v_sin_rol    int;
  v_stock      jsonb;
  v_descuadres int;
begin
  select arranque_fiscal_el into v_arranque from ajustes_tienda where id;

  if v_arranque is not null then
    raise exception
      'La tienda arrancó de verdad el % y sus datos ya no son de prueba. '
      'Borrar ventas reales destruye registros contables, así que esta función '
      'no vuelve a ejecutarse.', v_arranque;
  end if;

  select count(*) into v_pedidos from pedidos;

  delete from stock_reservas    where id is not null;
  delete from carrito_items     where id is not null;
  delete from carritos          where id is not null;
  delete from checkout_datos    where session_id is not null;
  delete from pedidos           where id is not null;
  delete from direcciones_envio where id is not null;

  -- Gestión Humana. `empleado_historial_mensual` cae en cascada, así que no
  -- hace falta borrarlo aparte —y contarlo antes sería contar dos veces—.
  with fuera as (delete from empleados where id is not null returning id)
  select count(*) into v_empleados from fuera;

  -- Las cuentas: todo lo que no sea `admin`. Va DESPUÉS de los pedidos y de los
  -- empleados a propósito, porque `pedidos.user_id` cascadea desde `auth.users`
  -- y hacerlo al revés se llevaría pedidos por la puerta de atrás dejando el
  -- recuento de arriba mintiendo.
  --
  -- En UNA sola sentencia, y eso importa: `user_roles.asignado_por` es
  -- NO ACTION, así que si un asesor asignó el rol de otro, borrarlos por
  -- separado fallaría. En la misma sentencia Postgres comprueba al final.
  --
  -- `profiles`, `user_roles` y `staff_modulos` caen en cascada con la cuenta.
  with fuera as (
    delete from auth.users u
    where u.id in (
      select ur.user_id from user_roles ur
      join roles r on r.id = ur.role_id
      where r.nombre <> 'admin'
    )
    returning u.id
  )
  select count(*) into v_cuentas from fuera;

  -- Sin rol ninguno: estado anómalo (`assign_default_role` le pone `cliente` a
  -- todo el que se registra). Se cuenta y NO se borra: ante algo que no debería
  -- existir, avisar es más útil que borrar en silencio.
  select count(*) into v_sin_rol
  from auth.users u
  where not exists (select 1 from user_roles ur where ur.user_id = u.id);

  select jsonb_object_agg(t, n) into v_borrados from (
    select 'pedidos' t, count(*) n from pedidos
    union all select 'pedido_items', count(*) from pedido_items
    union all select 'pedido_iva', count(*) from pedido_iva
    union all select 'pedido_eventos', count(*) from pedido_eventos
    union all select 'pedido_calificaciones', count(*) from pedido_calificaciones
    union all select 'transacciones_pago', count(*) from transacciones_pago
    union all select 'reembolso_lineas', count(*) from reembolso_lineas
    union all select 'carritos', count(*) from carritos
    union all select 'stock_reservas', count(*) from stock_reservas
    union all select 'direcciones_envio', count(*) from direcciones_envio
    union all select 'empleados', count(*) from empleados
    union all select 'empleado_historial_mensual', count(*) from empleado_historial_mensual
    union all select 'staff_modulos', count(*) from staff_modulos
    union all select 'cuentas_no_admin', count(*) from auth.users u
      join user_roles ur on ur.user_id = u.id
      join roles r on r.id = ur.role_id where r.nombre <> 'admin'
  ) x;

  with comprado as (
    select fci.producto_id, sum(fci.cantidad)::int uds from factura_compra_items fci group by 1
  ),
  abierto as (
    select d.origen_id producto_id, sum(d.bultos)::int uds from desempaquetados d group by 1
  ),
  generado as (
    select d.destino_id producto_id, sum(d.bultos * d.unidades_por_bulto)::int uds
    from desempaquetados d group by 1
  ),
  ajustado as (
    select a.producto_id, sum(a.cantidad)::int uds from ajustes_stock a group by 1
  ),
  objetivo as (
    select pr.id,
           greatest(0, coalesce(c.uds,0) - coalesce(ab.uds,0)
                       + coalesce(g.uds,0) + coalesce(aj.uds,0)) as stock
    from productos pr
    left join comprado c on c.producto_id = pr.id
    left join abierto ab on ab.producto_id = pr.id
    left join generado g on g.producto_id = pr.id
    left join ajustado aj on aj.producto_id = pr.id
  ),
  movidos as (
    update productos pr
    set stock_disponible = o.stock, stock_reservado = 0, updated_at = now()
    from objetivo o
    where o.id = pr.id and (pr.stock_disponible <> o.stock or pr.stock_reservado <> 0)
    returning pr.nombre, o.stock
  )
  select coalesce(jsonb_object_agg(nombre, stock), '{}'::jsonb) into v_stock from movidos;

  select count(*) into v_descuadres from comprobar_stock();

  return jsonb_build_object(
    'pedidos_borrados', v_pedidos,
    'empleados_borrados', v_empleados,
    'cuentas_borradas', v_cuentas,
    'cuentas_sin_rol_sin_tocar', v_sin_rol,
    'quedan', v_borrados,
    'stock_recalculado', v_stock,
    'descuadres_tras_limpiar', v_descuadres,
    'actor', p_actor_id,
    'cuando', now()
  );
end;
$$;

revoke execute on function public.limpiar_datos_de_prueba(uuid) from public, anon, authenticated;

do $comprobar$
begin
  if has_function_privilege('anon', 'public.limpiar_datos_de_prueba(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.limpiar_datos_de_prueba(uuid)', 'EXECUTE') then
    raise exception 'PELIGRO: limpiar_datos_de_prueba es ejecutable desde internet';
  end if;
end
$comprobar$;
