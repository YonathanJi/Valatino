-- ============================================================
-- 052 — Las reservas de un pedido no las toca nadie más
--
-- Reportado por Jonathan: hizo un pedido por transferencia, cerró sesión, volvió
-- a entrar, cogió el carrito y lo pagó con Bizum — y esta vez **no se enlazó**
-- con el anterior. Su hipótesis era la cookie.
--
-- No era la cookie: los dos pedidos tienen el mismo `user_id`. Lo que pasó es
-- que **el pedido por transferencia se había quedado sin sus reservas**, y son
-- las reservas lo que identifica al pedido a cancelar (047/049). Sin ellas no
-- había nada por lo que enlazarlos.
--
-- QUIÉN SE LAS LLEVÓ: `reservar_carrito` (034) empieza por limpiar lo que
-- hubiera de esa sesión —«recargar el checkout no apila reservas»— y eso era
-- correcto **cuando todas las reservas eran efímeras**: quince minutos, y el
-- cron las recogía. Desde la 045 hay reservas que pertenecen a un pedido y
-- duran días, y volver a abrir el checkout se las llevaba por delante
-- devolviendo su stock a la venta.
--
-- El enlace roto era lo de menos. El daño real:
--   · el pedido pendiente dejaba de retener stock, así que se podía vender
--     comprometido lo que ya estaba comprometido;
--   · y si luego alguien pulsaba «Pago recibido», el stock se descontaba sin
--     reserva detrás y podía quedar por debajo de lo real.
--
-- LA REGLA: **una reserva con `pedido_id` pertenece a ese pedido y solo se
-- suelta por su ciclo de vida** — al confirmar el ingreso, al cancelar el
-- pedido o al vencer el plazo. Ninguna limpieza «por sesión» puede tocarla.
-- ============================================================

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
  --
  -- ⚠️ `pedido_id is null` es la parte importante: las reservas que retiene un
  -- pedido por transferencia NO son de este checkout aunque compartan sesión.
  -- Sin este filtro, volver al carrito soltaba el stock de un pedido que sigue
  -- esperando su ingreso.
  update productos p
  set stock_disponible = p.stock_disponible + sr.cantidad,
      stock_reservado   = greatest(0, p.stock_reservado - sr.cantidad),
      updated_at        = now()
  from stock_reservas sr
  where sr.producto_id = p.id
    and sr.session_id = p_session_id
    and sr.pedido_id is null;

  delete from stock_reservas
  where session_id = p_session_id
    and pedido_id is null;

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

-- ── El índice único tenía que acompañar al cambio ──────────────────────────
--
-- `stock_reservas_session_producto_key` era único por (session_id, producto_id)
-- **a secas**. Existe para que recargar el checkout no apile dos reservas del
-- mismo artículo, y con ese propósito estaba bien.
--
-- Pero al dejar de borrar las reservas de un pedido (arriba), esa unicidad pasa
-- a impedir algo legítimo: **volver a comprar el mismo artículo mientras un
-- pedido anterior espera su transferencia**. El insert de `reservar_carrito`
-- chocaría con la reserva retenida y el checkout devolvería un 23505 — un
-- cliente que no puede comprar por tener un pedido pendiente.
--
-- Lo cazó la prueba en seco del propio arreglo, no la lógica: el filtro nuevo
-- parecía completo y no lo era.
--
-- Se vuelve parcial: la unicidad se aplica solo a las reservas **de checkout**,
-- que es donde tenía sentido. Y se añade la equivalente para las de pedido, que
-- tampoco deben duplicarse dentro del mismo pedido.
drop index if exists public.stock_reservas_session_producto_key;

create unique index if not exists stock_reservas_checkout_unico
  on public.stock_reservas (session_id, producto_id)
  where pedido_id is null;

create unique index if not exists stock_reservas_pedido_unico
  on public.stock_reservas (pedido_id, producto_id)
  where pedido_id is not null;

-- ── Consecuencia: ahora coexisten dos reservas del mismo producto ──────────
--
-- Al dejar de barrer las del pedido, un cliente con un pedido esperando
-- transferencia que vuelve a comprar lo mismo tiene DOS reservas del mismo
-- artículo: la retenida y la de su checkout nuevo. Eso rompía dos supuestos:
--
-- 1. `confirmar_venta` consumía las reservas «de esta sesión» sin distinguir, y
--    con dos filas casando el mismo producto un `update … from` **aplica una
--    sola** y descarta la otra en silencio: `stock_reservado` quedaba inflado.
--    Ahora consume solo las de checkout, que son las suyas.
--
-- 2. `cancelar_transferencia_reemplazada` (049) NO devolvía stock, con el
--    razonamiento de que «esas unidades se las lleva el pedido que sí se pagó».
--    Era cierto cuando ambos compartían la misma reserva; ahora son
--    independientes y el pedido nuevo tiene la suya, así que el cancelado
--    **tiene que soltar la que retenía** o esas unidades no vuelven nunca.
--
-- Las dos cosas juntas: se venden 2 unidades y salen 2 del inventario, no 4.
create or replace function public.cancelar_transferencia_reemplazada(
  p_session_id          uuid,
  p_usuario_autenticado uuid,
  p_producto_ids        uuid[],
  p_reemplazado_por     uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cancelados integer := 0;
begin
  with afectados as (
    select distinct sr.pedido_id
    from stock_reservas sr
    where sr.pedido_id is not null
      and sr.producto_id = any (p_producto_ids)
      and ((p_usuario_autenticado is not null and sr.user_id = p_usuario_autenticado)
           or sr.session_id = p_session_id)
  ),
  cancelados as (
    update pedidos p
    set estado = 'CANCELADO',
        pago_vence_el = null,
        reemplazado_por = p_reemplazado_por,
        updated_at = now()
    from afectados a
    where p.id = a.pedido_id
      and p.estado = 'PENDIENTE_PAGO'
      and p.metodo_pago = 'transferencia'
      and p.id is distinct from p_reemplazado_por
    returning p.id
  ),
  -- Suelta lo que retenían: son unidades distintas de las que va a consumir el
  -- pedido nuevo, que tiene su propia reserva.
  soltada as (
    delete from stock_reservas sr
    using cancelados c
    where sr.pedido_id = c.id
    returning sr.producto_id, sr.cantidad
  ),
  -- Agrupado por producto: `update … from` con dos filas del mismo artículo
  -- aplicaría una sola.
  agrupada as (
    select producto_id, sum(cantidad) as cantidad from soltada group by producto_id
  ),
  devuelta as (
    update productos p
    set stock_disponible = p.stock_disponible + a.cantidad,
        stock_reservado  = greatest(0, p.stock_reservado - a.cantidad),
        updated_at = now()
    from agrupada a
    where p.id = a.producto_id
    returning 1
  )
  select count(*) into v_cancelados from cancelados;

  return v_cancelados;
end;
$$;

revoke execute on function public.cancelar_transferencia_reemplazada(uuid, uuid, uuid[], uuid)
  from public, anon, authenticated;
