-- ============================================================
-- 051 — Un pedido cancelado no retiene stock
--
-- Cabo suelto que sale de la regla nueva: un pedido por transferencia pendiente
-- de pago ya solo se puede **cancelar** desde el desplegable (avanzarlo exige
-- «Pago recibido», que es lo único que cobra, consume la reserva y avisa al
-- cliente). Pero cancelar iba por `cambiar_estado_pedido`, que solo toca el
-- estado: las unidades seguían retenidas hasta que venciera el plazo —hasta
-- tres días laborables— aunque ya se supiera que ese pedido no se iba a pagar.
--
-- Se resuelve en la propia RPC y no en la API para que valga por cualquier
-- camino: **ningún pedido cancelado debe seguir reteniendo stock**, lo cancele
-- quien lo cancele.
-- ============================================================

create or replace function public.cambiar_estado_pedido(
  p_pedido_id uuid,
  p_estado    public.pedido_estado,
  p_actor_id  uuid default null
)
returns public.pedidos
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pedido public.pedidos;
begin
  perform set_config('app.actor_id', coalesce(p_actor_id::text, ''), true);
  perform set_config('app.origen', case when p_actor_id is null then 'sistema' else 'panel' end, true);

  update public.pedidos
  set estado = p_estado,
      updated_at = now()
  where id = p_pedido_id
  returning * into v_pedido;

  -- Se limpia en cuanto el update ha pasado: set_config dura toda la
  -- transacción, no solo la sentencia siguiente.
  perform set_config('app.actor_id', '', true);
  perform set_config('app.origen', '', true);

  if v_pedido.id is null then
    raise exception 'Pedido % no existe', p_pedido_id using errcode = 'P0002';
  end if;

  -- Cancelado = suelta lo que retuviera. Solo afecta a los pedidos con reserva
  -- viva a su nombre, que hoy son los de transferencia esperando el ingreso;
  -- en los demás no hay filas y no se toca nada.
  if p_estado = 'CANCELADO' then
    with soltada as (
      delete from public.stock_reservas sr
      where sr.pedido_id = p_pedido_id
      returning sr.producto_id, sr.cantidad
    ),
    agrupada as (
      select producto_id, sum(cantidad) as cantidad from soltada group by producto_id
    )
    update public.productos p
    set stock_disponible = p.stock_disponible + a.cantidad,
        stock_reservado  = greatest(0, p.stock_reservado - a.cantidad),
        updated_at = now()
    from agrupada a
    where p.id = a.producto_id;

    update public.pedidos set pago_vence_el = null where id = p_pedido_id;
  end if;

  return v_pedido;
end;
$$;

revoke execute on function public.cambiar_estado_pedido(uuid, public.pedido_estado, uuid)
  from public, anon, authenticated;
