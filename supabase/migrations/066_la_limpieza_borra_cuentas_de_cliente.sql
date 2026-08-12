-- 066: la limpieza también se lleva las cuentas de cliente.
--
-- La 064 las contaba y no las tocaba, por prudencia: borrar una cuenta es
-- irreversible de otra manera y vive en `auth`. Pero en la práctica dejaba un
-- cabo suelto en cada limpieza —«todo a cero menos esto»— que había que atar a
-- mano, y el estado que se busca es la tienda entera recién montada.
--
-- ⚠️ A QUIÉN NO TOCA, que es lo que hace que esto sea seguro:
--
--   1. Solo cuentas cuyo rol sea **exactamente `cliente`**. Desde la 058 un
--      usuario tiene como mucho un rol, así que no hay ambigüedad.
--   2. **Nunca** una cuenta ligada a una ficha de `empleados`, aunque su rol
--      siga siendo `cliente`. Es la red para quien quede a medias del flujo
--      RRHH → TI: la ficha existe, el rol todavía no se ha cambiado, y borrarle
--      la cuenta sería tirar el trabajo de dos personas.
--   3. **Nunca** una cuenta sin rol. Es un estado anómalo —`assign_default_role`
--      le pone `cliente` a todo el mundo al registrarse—, y ante algo anómalo lo
--      correcto es dejarlo y contarlo, no borrarlo en silencio.
--
-- El `delete` lleva su WHERE, como todos desde la 065: el rol de PostgREST
-- precarga `safeupdate` y rechaza los que no lo llevan.

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
  v_stock      jsonb;
  v_cuentas    int;
  v_sin_rol    int;
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

  -- Las cuentas van DESPUÉS de los pedidos a propósito. `pedidos.user_id`
  -- cascadea desde `auth.users`, así que hacerlo al revés borraría pedidos por
  -- la puerta de atrás y el recuento de arriba mentiría.
  with borradas as (
    delete from auth.users u
    where u.id in (
      select ur.user_id from user_roles ur
      join roles r on r.id = ur.role_id
      where r.nombre = 'cliente'
    )
      and not exists (select 1 from empleados e where e.user_id = u.id)
    returning u.id
  )
  select count(*) into v_cuentas from borradas;

  -- Anómalas: sin rol ninguno. No se tocan, se cuentan.
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
    union all select 'cuentas_de_cliente', count(*) from auth.users u
      join user_roles ur on ur.user_id = u.id
      join roles r on r.id = ur.role_id where r.nombre = 'cliente'
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
    'cuentas_de_cliente_borradas', v_cuentas,
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
