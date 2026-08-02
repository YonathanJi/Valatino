-- ============================================================
-- 045 — Pagar por transferencia bancaria
--
-- Pedido por Jonathan: dar al cliente la opción de pagar por transferencia
-- (además de tarjeta y Bizum, que van por Stripe y no necesitan nada de esto).
--
-- Es el primer método de pago ASÍNCRONO de la tienda, y eso cambia el flujo
-- entero. Hasta ahora un pedido nacía ya pagado: `confirmar_venta` lo creaba
-- desde el webhook, con el dinero cobrado. Aquí el pedido nace DEBIENDO dinero
-- y se queda esperando —uno a tres días laborables— a que alguien del equipo
-- confirme que la transferencia llegó.
--
-- ⚠️ LA DECISIÓN QUE LO SOSTIENE TODO: EL PLAZO DE PAGO **ES** EL TTL DE LA
-- RESERVA DE STOCK. El checkout reserva las unidades 15 minutos (034) y el cron
-- las devuelve al vencer. Aquí esa misma reserva se estira hasta la fecha límite
-- de la transferencia. Así:
--   · el stock queda bloqueado mientras se espera el dinero, que es lo que se
--     decidió (nadie compra lo que ya está comprometido);
--   · si el dinero no llega, el mecanismo que ya existía lo devuelve solo;
--   · y no hay dos relojes distintos que puedan contradecirse.
--
-- ⚠️ Lo que NO cubre: los festivos. «Tres días laborables» aquí significa
-- saltando sábados y domingos. Un pedido hecho antes de Navidad dará un plazo
-- optimista. Se asume a sabiendas: mantener el calendario laboral de cada
-- comunidad es mucho más caro que el par de días de margen que cuesta.
-- ============================================================

-- ── 0. El método de pago era una lista cerrada ─────────────────────────────
-- `pedidos_metodo_pago_check` solo admitía 'stripe' y 'paypal'. Se amplía en
-- vez de quitarse: la lista cerrada es justo lo que impide que un método mal
-- escrito entre en la tabla y solo se descubra al facturar.
alter table public.pedidos drop constraint if exists pedidos_metodo_pago_check;
alter table public.pedidos add constraint pedidos_metodo_pago_check
  check (metodo_pago::text = any (array['stripe', 'paypal', 'transferencia']::text[]));

-- ── 1. Cuándo vence el plazo de pago ───────────────────────────────────────

alter table public.pedidos
  add column if not exists pago_vence_el timestamptz;

comment on column public.pedidos.pago_vence_el is
  'Fecha límite para que llegue la transferencia. NULL en los pagos inmediatos (tarjeta, Bizum, PayPal), que nacen ya cobrados.';

-- Qué reserva pertenece a qué pedido. Sin esto, al confirmar el pago tres días
-- después no habría forma de saber QUÉ unidades consumir: `confirmar_venta` las
-- localiza por sesión, y para entonces la sesión puede ser otra o tener encima
-- las reservas de otro checkout.
alter table public.stock_reservas
  add column if not exists pedido_id uuid references public.pedidos (id) on delete set null;

create index if not exists idx_stock_reservas_pedido on public.stock_reservas (pedido_id);

comment on column public.stock_reservas.pedido_id is
  'Pedido que retiene esta reserva mientras espera su transferencia. NULL en las reservas normales de checkout, que viven 15 minutos.';

-- ── 2. El código de método en el número de pedido ──────────────────────────
-- Sin esto la transferencia caería en el `else '00'` y sus pedidos no se
-- distinguirían de un método desconocido con solo mirar el número.
create or replace function public.generar_numero_pedido(p_metodo_pago text)
returns varchar(12)
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_prefijo text;
  v_candidato varchar(12);
begin
  v_prefijo :=
    to_char(now() at time zone 'Europe/Madrid', 'YYMMDD')
    || case p_metodo_pago
         when 'stripe' then '01'
         when 'paypal' then '02'
         when 'transferencia' then '03'
         else '00'
       end;

  for _ in 1..25 loop
    v_candidato := v_prefijo || lpad(floor(random() * 10000)::text, 4, '0');
    if not exists (select 1 from pedidos where numero_pedido = v_candidato) then
      return v_candidato;
    end if;
  end loop;

  raise exception 'No se pudo generar un número de pedido único';
end;
$$;

revoke execute on function public.generar_numero_pedido(text) from public, anon, authenticated;

-- ── 3. Días laborables ─────────────────────────────────────────────────────
-- Se cuenta desde el final del día para no prometer un plazo que en realidad
-- son unas horas: un pedido de las 23:50 del lunes con «un día» daría el martes
-- a las 23:50, pero uno de las 00:10 daría el martes a las 00:10 y el cliente
-- tendría diez minutos. Redondear al final del día iguala a todo el mundo.
create or replace function public.sumar_dias_laborables(
  p_desde timestamptz,
  p_dias  integer
)
returns timestamptz
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_fecha date := (p_desde at time zone 'Europe/Madrid')::date;
  v_restantes integer := greatest(p_dias, 1);
begin
  while v_restantes > 0 loop
    v_fecha := v_fecha + 1;
    -- isodow: 6 sábado, 7 domingo.
    if extract(isodow from v_fecha) < 6 then
      v_restantes := v_restantes - 1;
    end if;
  end loop;

  -- Final del día, en hora de Madrid, devuelto como instante absoluto.
  return ((v_fecha + 1)::timestamp at time zone 'Europe/Madrid') - interval '1 second';
end;
$$;

comment on function public.sumar_dias_laborables(timestamptz, integer) is
  'Suma días laborables saltando fines de semana (no festivos) y devuelve el final de ese día en hora de Madrid.';

-- ── 4. Crear el pedido que espera la transferencia ─────────────────────────
--
-- Hermano de `confirmar_venta`, con dos diferencias que lo cambian todo: el
-- pedido nace en PENDIENTE_PAGO y **el stock no se consume, se retiene**. La
-- reserva del checkout se estira hasta la fecha límite y se marca con el
-- pedido, que es lo que permitirá consumirla o soltarla más adelante.
create or replace function public.crear_pedido_transferencia(
  p_session_id           uuid,
  p_usuario_autenticado  uuid,
  p_user_id              uuid,
  -- La genera el navegador al abrir el checkout. Es lo que hace idempotente
  -- esta llamada: un doble clic devuelve el mismo pedido en vez de crear dos,
  -- y un checkout nuevo trae una clave nueva y sí crea otro.
  p_clave_idempotencia   text,
  p_dias_plazo           integer default 3,
  p_direccion_envio_id   uuid    default null,
  p_email_cliente        text    default null,
  p_documento_cliente    text    default null,
  p_envio                jsonb   default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pedido_id    uuid;
  v_carrito_id   uuid;
  v_total        numeric(10,2);
  v_envio        jsonb := p_envio;
  v_producto_ids uuid[];
  v_referencia   text;
  v_vence        timestamptz;
  v_reservadas   integer;
begin
  if p_clave_idempotencia is null or p_clave_idempotencia = '' then
    raise exception 'Falta la clave de idempotencia del checkout';
  end if;

  v_referencia := 'transferencia:' || p_clave_idempotencia;

  perform pg_advisory_xact_lock(hashtext('confirmar_venta:' || v_referencia));

  -- Mismo criterio que confirmar_venta: si ya existe, se devuelve.
  select id into v_pedido_id from pedidos where referencia_pago = v_referencia;
  if v_pedido_id is not null then
    return v_pedido_id;
  end if;

  if p_usuario_autenticado is not null then
    select id into v_carrito_id from carritos where user_id = p_usuario_autenticado;
  else
    select id into v_carrito_id
    from carritos
    where session_id = p_session_id and user_id is null;
  end if;

  if v_carrito_id is null then
    raise exception 'Carrito no encontrado al iniciar la transferencia (sesión %)', p_session_id;
  end if;

  select sum(ci.precio_unitario * ci.cantidad), array_agg(ci.producto_id)
  into v_total, v_producto_ids
  from carrito_items ci
  where ci.carrito_id = v_carrito_id;

  if v_total is null then
    raise exception 'Carrito vacío al iniciar la transferencia (carrito %)', v_carrito_id;
  end if;

  -- Sin reserva viva no hay stock que prometer, y un pedido por transferencia
  -- dura días: aceptarlo aquí sería comprometerse a servir algo que puede
  -- venderse mañana. Mejor fallar ahora, con el cliente delante.
  select count(*) into v_reservadas
  from stock_reservas sr
  where sr.producto_id = any (v_producto_ids)
    and sr.pedido_id is null
    and (
      (p_usuario_autenticado is not null and sr.user_id = p_usuario_autenticado)
      or sr.session_id = p_session_id
    );

  if v_reservadas = 0 then
    raise exception 'La reserva del carrito ha caducado; vuelve a intentarlo'
      using errcode = 'P0003';
  end if;

  if v_envio is null and p_direccion_envio_id is not null then
    select to_jsonb(d) into v_envio
    from (
      select nombre_destinatario, linea1, linea2, ciudad, codigo_postal, provincia, pais
      from direcciones_envio
      where id = p_direccion_envio_id
    ) d;
  end if;

  v_vence := sumar_dias_laborables(now(), p_dias_plazo);

  insert into pedidos (
    numero_pedido, user_id, estado, total, metodo_pago, referencia_pago,
    direccion_envio_id, email_cliente, documento_cliente, pago_vence_el,
    envio_nombre, envio_linea1, envio_linea2, envio_ciudad,
    envio_codigo_postal, envio_provincia, envio_pais, envio_telefono
  )
  values (
    generar_numero_pedido('transferencia'),
    p_user_id,
    'PENDIENTE_PAGO',
    v_total,
    'transferencia',
    v_referencia,
    p_direccion_envio_id,
    lower(nullif(p_email_cliente, '')),
    nullif(p_documento_cliente, ''),
    v_vence,
    v_envio->>'nombre_destinatario',
    v_envio->>'linea1',
    v_envio->>'linea2',
    v_envio->>'ciudad',
    v_envio->>'codigo_postal',
    v_envio->>'provincia',
    v_envio->>'pais',
    v_envio->>'telefono'
  )
  returning id into v_pedido_id;

  insert into pedido_items (pedido_id, producto_id, nombre_producto, cantidad, precio_unitario)
  select v_pedido_id, ci.producto_id, p.nombre, ci.cantidad, ci.precio_unitario
  from carrito_items ci
  join productos p on p.id = ci.producto_id
  where ci.carrito_id = v_carrito_id;

  -- El corazón de todo esto: la reserva pasa a ser del pedido y dura lo que
  -- dura el plazo de pago. `stock_disponible` ya se descontó al reservar, así
  -- que las unidades siguen fuera de la venta sin tocar nada más.
  update stock_reservas sr
  set pedido_id  = v_pedido_id,
      expires_at = v_vence
  where sr.producto_id = any (v_producto_ids)
    and sr.pedido_id is null
    and (
      (p_usuario_autenticado is not null and sr.user_id = p_usuario_autenticado)
      or sr.session_id = p_session_id
    );

  delete from carrito_items where carrito_id = v_carrito_id;

  return v_pedido_id;
end;
$$;

revoke execute on function public.crear_pedido_transferencia(uuid, uuid, uuid, text, integer, uuid, text, text, jsonb)
  from public, anon, authenticated;

-- ── 5. Confirmar que la transferencia llegó ────────────────────────────────
--
-- Lo lanza una persona desde el panel. Consume la reserva igual que hace
-- `confirmar_venta` al cobrar, pero acotada por pedido.
--
-- ⚠️ Puede que la reserva ya no exista: si el cron la recogió al vencer el
-- plazo y el dinero llegó justo después, el stock ya volvió a la venta. En ese
-- caso NO se falla —el dinero está en la cuenta y el pedido debe salir—, se
-- descuenta del disponible y se avisa en el resultado para que el panel pueda
-- decirlo. Callarlo dejaría el inventario descuadrado en silencio.
create or replace function public.confirmar_pago_transferencia(
  p_pedido_id uuid,
  p_actor_id  uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_estado public.pedido_estado;
  v_metodo text;
  v_consumidas integer := 0;
  v_sin_reserva integer := 0;
begin
  perform pg_advisory_xact_lock(hashtext('confirmar_transferencia:' || p_pedido_id::text));

  select estado, metodo_pago into v_estado, v_metodo
  from pedidos where id = p_pedido_id for update;

  if not found then
    raise exception 'Pedido % no existe', p_pedido_id using errcode = 'P0002';
  end if;

  if v_metodo <> 'transferencia' then
    raise exception 'El pedido % no se paga por transferencia', p_pedido_id using errcode = 'P0001';
  end if;

  -- Ya confirmado: el otro camino llegó primero. No es un error.
  if v_estado <> 'PENDIENTE_PAGO' then
    return jsonb_build_object('confirmado', false, 'estado', v_estado, 'sin_reserva', 0);
  end if;

  -- Consumir la reserva: stock_disponible ya estaba descontado, solo se suelta
  -- el reservado y se borra la fila.
  with consumida as (
    delete from stock_reservas sr
    where sr.pedido_id = p_pedido_id
    returning sr.producto_id, sr.cantidad
  ),
  agrupada as (
    select producto_id, sum(cantidad) as cantidad from consumida group by producto_id
  ),
  aplicada as (
    update productos p
    set stock_reservado = greatest(0, p.stock_reservado - a.cantidad),
        updated_at = now()
    from agrupada a
    where p.id = a.producto_id
    returning 1
  )
  select count(*) into v_consumidas from aplicada;

  -- No había reserva: la recogió el cron al vencer el plazo y las unidades ya
  -- volvieron a la venta. Hay que sacarlas otra vez.
  if v_consumidas = 0 then
    with pendiente as (
      select i.producto_id, sum(i.cantidad) as cantidad
      from pedido_items i
      where i.pedido_id = p_pedido_id
      group by i.producto_id
    ),
    descontada as (
      update productos p
      set stock_disponible = greatest(0, p.stock_disponible - pe.cantidad),
          updated_at = now()
      from pendiente pe
      where p.id = pe.producto_id
      returning 1
    )
    select count(*) into v_sin_reserva from descontada;
  end if;

  perform set_config('app.actor_id', coalesce(p_actor_id::text, ''), true);
  perform set_config('app.origen', case when p_actor_id is null then 'sistema' else 'panel' end, true);

  update pedidos
  set estado = 'PROCESANDO',
      pago_vence_el = null,
      updated_at = now()
  where id = p_pedido_id;

  perform set_config('app.actor_id', '', true);
  perform set_config('app.origen', '', true);

  return jsonb_build_object(
    'confirmado', true,
    'estado', 'PROCESANDO',
    -- > 0 significa que el stock se descontó sin reserva detrás: conviene
    -- mirar el inventario de esos productos.
    'sin_reserva', v_sin_reserva
  );
end;
$$;

revoke execute on function public.confirmar_pago_transferencia(uuid, uuid)
  from public, anon, authenticated;

-- ── 6. Los que nunca pagaron ───────────────────────────────────────────────
--
-- El cron de reservas (004) ya devuelve el stock cuando vence `expires_at`,
-- pero no sabe nada de pedidos: sin esto, el pedido se quedaría en
-- PENDIENTE_PAGO para siempre. Las dos cosas son idempotentes y complementarias
-- —una suelta unidades, la otra cierra el pedido— y da igual cuál llegue antes.
create or replace function public.caducar_transferencias_vencidas()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pedido record;
  v_total integer := 0;
begin
  for v_pedido in
    select id from pedidos
    where estado = 'PENDIENTE_PAGO'
      and metodo_pago = 'transferencia'
      and pago_vence_el is not null
      and pago_vence_el < now()
    for update skip locked
  loop
    -- Soltar lo que quede reservado de este pedido. Si el cron de reservas ya
    -- pasó, no hay filas y no se toca nada: por eso se borra al liberar.
    with soltada as (
      delete from stock_reservas sr
      where sr.pedido_id = v_pedido.id
      returning sr.producto_id, sr.cantidad
    ),
    agrupada as (
      select producto_id, sum(cantidad) as cantidad from soltada group by producto_id
    )
    update productos p
    set stock_disponible = p.stock_disponible + a.cantidad,
        stock_reservado  = greatest(0, p.stock_reservado - a.cantidad),
        updated_at = now()
    from agrupada a
    where p.id = a.producto_id;

    perform set_config('app.actor_id', '', true);
    perform set_config('app.origen', 'sistema', true);

    update pedidos
    set estado = 'CANCELADO',
        updated_at = now()
    where id = v_pedido.id;

    perform set_config('app.origen', '', true);

    v_total := v_total + 1;
  end loop;

  return v_total;
end;
$$;

revoke execute on function public.caducar_transferencias_vencidas()
  from public, anon, authenticated;

-- Cada diez minutos: el plazo se mide en días, así que al minuto no se gana
-- nada y son 1.440 despertares diarios de más.
select cron.schedule(
  'caducar-transferencias-vencidas',
  '*/10 * * * *',
  $cron$ select public.caducar_transferencias_vencidas(); $cron$
);
