-- 034: La reserva de stock del checkout pasa a ser una sola RPC transaccional.
--
-- Antes CheckoutService recorría los ítems llamando a reservar_stock() una vez
-- por producto y, si alguno fallaba, deshacía a mano las reservas ya creadas.
-- Dos problemas:
--   1. Sin transacción: un fallo entre medias dejaba stock reservado colgado.
--   2. La carrera entre peticiones paralelas se contenía con un Map en memoria
--      del proceso Node (`reservasEnVuelo`), que deja de funcionar en cuanto
--      hay más de una instancia — y la constitución exige poder escalar en
--      horizontal sin estado compartido en memoria (Principio V).
--
-- Aquí un lock de sesión en BD serializa las reservas concurrentes de la misma
-- sesión, y el todo-o-nada lo garantiza la transacción de la función.
-- reservar_stock() se mantiene: sigue siendo útil para reservas de un producto.

create or replace function public.reservar_carrito(
  p_session_id uuid,
  p_user_id    uuid default null
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_carrito_id uuid;
  v_expires_at timestamptz := now() + interval '15 minutes';
  v_sin_stock  uuid[];
  v_reservas   jsonb;
begin
  -- Serializa las peticiones concurrentes de esta sesión (doble montaje de
  -- React, doble clic, reintentos). Se libera al cerrar la transacción.
  perform pg_advisory_xact_lock(hashtext('reservar_carrito:' || p_session_id::text));

  if p_user_id is not null then
    select id into v_carrito_id from carritos where user_id = p_user_id;
  else
    select id into v_carrito_id
    from carritos
    where session_id = p_session_id and user_id is null;
  end if;

  if v_carrito_id is null then
    raise exception 'Carrito no encontrado' using errcode = 'P0002';
  end if;

  if not exists (select 1 from carrito_items where carrito_id = v_carrito_id) then
    raise exception 'El carrito está vacío' using errcode = 'P0003';
  end if;

  -- Idempotencia: recargar el checkout no apila reservas. Se devuelven al stock
  -- las previas de esta sesión antes de volver a calcular.
  update productos p
  set stock_disponible = p.stock_disponible + sr.cantidad,
      stock_reservado   = greatest(0, p.stock_reservado - sr.cantidad),
      updated_at        = now()
  from stock_reservas sr
  where sr.producto_id = p.id
    and sr.session_id = p_session_id;

  delete from stock_reservas where session_id = p_session_id;

  -- Bloquear los productos del carrito y comprobar TODO el stock antes de
  -- tocar nada: así no hay que deshacer reservas parciales.
  perform 1
  from productos p
  join carrito_items ci on ci.producto_id = p.id
  where ci.carrito_id = v_carrito_id
  order by p.id            -- orden estable: evita deadlocks entre sesiones
  for update of p;

  select array_agg(ci.producto_id)
  into v_sin_stock
  from carrito_items ci
  join productos p on p.id = ci.producto_id
  where ci.carrito_id = v_carrito_id
    and (p.activo = false or p.stock_disponible < ci.cantidad);

  if v_sin_stock is not null then
    return jsonb_build_object('ok', false, 'sin_stock', to_jsonb(v_sin_stock));
  end if;

  update productos p
  set stock_disponible = p.stock_disponible - ci.cantidad,
      stock_reservado   = p.stock_reservado + ci.cantidad,
      updated_at        = now()
  from carrito_items ci
  where ci.carrito_id = v_carrito_id
    and ci.producto_id = p.id;

  insert into stock_reservas (producto_id, user_id, session_id, cantidad, expires_at)
  select ci.producto_id, p_user_id, p_session_id, ci.cantidad, v_expires_at
  from carrito_items ci
  where ci.carrito_id = v_carrito_id;

  select jsonb_agg(
           jsonb_build_object(
             'productoId', ci.producto_id,
             'cantidad',   ci.cantidad,
             'expiresAt',  v_expires_at
           )
         )
  into v_reservas
  from carrito_items ci
  where ci.carrito_id = v_carrito_id;

  return jsonb_build_object(
    'ok', true,
    'reservas', coalesce(v_reservas, '[]'::jsonb),
    'expiresAt', v_expires_at
  );
end;
$$;

revoke execute on function public.reservar_carrito(uuid, uuid) from public, anon, authenticated;

-- Antes de imponer el índice hay que vaciar lo que ya haya: sin él pueden
-- existir varias reservas de la misma sesión y producto (justo el bug que se
-- está cerrando), y el CREATE UNIQUE fallaría. Las reservas son efímeras —TTL
-- de 15 min, el cron las recoge—, así que se devuelve su stock y se borran; un
-- checkout en vuelo simplemente vuelve a reservar al recargar.
update productos p
set stock_disponible = p.stock_disponible + sr.cantidad,
    stock_reservado   = greatest(0, p.stock_reservado - sr.cantidad),
    updated_at        = now()
from (
  select producto_id, sum(cantidad) as cantidad
  from stock_reservas
  group by producto_id
) sr
where sr.producto_id = p.id;

delete from stock_reservas;

-- Una reserva por sesión y producto: refuerza en BD la idempotencia que antes
-- solo vivía en el Map en memoria del proceso Node.
create unique index if not exists stock_reservas_session_producto_key
  on public.stock_reservas (session_id, producto_id);
