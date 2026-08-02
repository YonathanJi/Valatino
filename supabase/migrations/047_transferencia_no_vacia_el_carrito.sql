-- ============================================================
-- 047 — El carrito no se vacía hasta que el pago existe
--
-- Reportado por Jonathan: «si seleccioné transferencia y luego pasé a tarjeta
-- y Bizum dice que no permite porque el carro está vacío».
--
-- LA CAUSA: `crear_pedido_transferencia` (045) vaciaba el carrito al crear el
-- pedido, copiando lo que hace `confirmar_venta`. Allí es correcto —el dinero
-- ya está cobrado y el carrito ha cumplido su función—, pero aquí **el pago aún
-- no ha ocurrido**: elegir transferencia no es pagar, es decir cómo se va a
-- pagar. Quien cambia de idea y vuelve a la tarjeta se encuentra sin carrito y
-- sin poder comprar.
--
-- Y dejaba algo peor detrás: un pedido en PENDIENTE_PAGO reteniendo stock que
-- nadie va a pagar, visible en el panel durante tres días, donde alguien podría
-- darlo por bueno y descontar inventario por una venta que no existió.
--
-- La regla que se adopta: **el carrito se vacía cuando el pago se materializa,
-- no cuando se anuncia.** Tres cambios que la implementan:
--   1. crear_pedido_transferencia deja el carrito intacto.
--   2. confirmar_pago_transferencia lo vacía, que es cuando entra el dinero.
--   3. confirmar_venta cancela el pedido por transferencia que este mismo
--      checkout hubiera dejado a medias.
-- ============================================================

-- ── 1. Crear el pedido ya no vacía el carrito ──────────────────────────────
-- Idéntica a la de la 045 salvo el `delete from carrito_items` del final.
create or replace function public.crear_pedido_transferencia(
  p_session_id           uuid,
  p_usuario_autenticado  uuid,
  p_user_id              uuid,
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
    raise exception 'Carrito no encontrado al iniciar la transferencia (sesion %)', p_session_id;
  end if;

  select sum(ci.precio_unitario * ci.cantidad), array_agg(ci.producto_id)
  into v_total, v_producto_ids
  from carrito_items ci
  where ci.carrito_id = v_carrito_id;

  if v_total is null then
    raise exception 'Carrito vacio al iniciar la transferencia (carrito %)', v_carrito_id;
  end if;

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

  update stock_reservas sr
  set pedido_id  = v_pedido_id,
      expires_at = v_vence
  where sr.producto_id = any (v_producto_ids)
    and sr.pedido_id is null
    and (
      (p_usuario_autenticado is not null and sr.user_id = p_usuario_autenticado)
      or sr.session_id = p_session_id
    );

  -- ⚠️ AQUÍ NO SE VACÍA EL CARRITO. Elegir transferencia no es pagar: quien
  -- cambie de idea y vuelva a la tarjeta tiene que encontrar su compra donde
  -- la dejó. Se vacía al confirmar el ingreso.
  return v_pedido_id;
end;
$$;

revoke execute on function public.crear_pedido_transferencia(uuid, uuid, uuid, text, integer, uuid, text, text, jsonb)
  from public, anon, authenticated;

-- ── 2. Confirmar el ingreso sí vacía el carrito ────────────────────────────
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

  if v_estado <> 'PENDIENTE_PAGO' then
    return jsonb_build_object('confirmado', false, 'estado', v_estado, 'sin_reserva', 0);
  end if;

  with consumida as (
    delete from stock_reservas sr
    where sr.pedido_id = p_pedido_id
    returning sr.producto_id, sr.cantidad, sr.session_id, sr.user_id
  ),
  agrupada as (
    select producto_id, sum(cantidad) as cantidad from consumida group by producto_id
  ),
  -- El carrito que originó este pedido, ahora sí: el dinero ha entrado y la
  -- compra está cerrada. Se localiza por la reserva, que es lo único que
  -- ata el pedido con la sesión que lo hizo.
  vaciado as (
    delete from carrito_items ci
    where ci.carrito_id in (
      select c.id from carritos c
      join consumida co on true
      where (co.user_id is not null and c.user_id = co.user_id)
         or (c.session_id = co.session_id and c.user_id is null)
    )
    returning 1
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
    'sin_reserva', v_sin_reserva
  );
end;
$$;

revoke execute on function public.confirmar_pago_transferencia(uuid, uuid)
  from public, anon, authenticated;

-- ── 3. Pagar por otra vía cancela el pedido a medias ───────────────────────
--
-- El cliente pidió los datos de la transferencia, se lo pensó mejor y pagó con
-- tarjeta. Sin esto quedaría un pedido en PENDIENTE_PAGO durante tres días, y
-- alguien del equipo podría darlo por bueno y descontar inventario por una
-- venta que ya se cobró por otro sitio.
--
-- Se identifica por la RESERVA, no por la sesión ni por el tiempo: las reservas
-- que `confirmar_venta` está a punto de consumir son exactamente las que aquel
-- pedido retenía. Sin heurísticas, sin ventanas de una hora, sin falsos
-- positivos con un pedido legítimo de otro día.
--
-- **No se devuelve stock**: esas unidades no vuelven a la venta, se las lleva
-- el pedido que sí se ha pagado.
create or replace function public.cancelar_transferencia_reemplazada(
  p_session_id          uuid,
  p_usuario_autenticado uuid,
  p_producto_ids        uuid[]
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
      and (
        (p_usuario_autenticado is not null and sr.user_id = p_usuario_autenticado)
        or sr.session_id = p_session_id
      )
  ),
  cancelados as (
    update pedidos p
    set estado = 'CANCELADO',
        pago_vence_el = null,
        updated_at = now()
    from afectados a
    where p.id = a.pedido_id
      and p.estado = 'PENDIENTE_PAGO'
      and p.metodo_pago = 'transferencia'
    returning 1
  )
  select count(*) into v_cancelados from cancelados;

  return v_cancelados;
end;
$$;

revoke execute on function public.cancelar_transferencia_reemplazada(uuid, uuid, uuid[])
  from public, anon, authenticated;

-- ── 4. confirmar_venta avisa de que ha reemplazado a la transferencia ──────
-- Idéntica a la de la 033 salvo la llamada añadida justo antes de consumir las
-- reservas: tiene que ser ANTES, porque es la reserva la que identifica al
-- pedido que hay que cancelar y después ya no existe.
create or replace function public.confirmar_venta(
  p_session_id           uuid,
  p_usuario_autenticado  uuid,
  p_user_id              uuid,
  p_metodo_pago          text,
  p_referencia_pago      text,
  p_direccion_envio_id   uuid    default null,
  p_email_cliente        text    default null,
  p_documento_cliente    text    default null,
  p_envio                jsonb   default null
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_pedido_id    uuid;
  v_carrito_id   uuid;
  v_total        numeric(10,2);
  v_envio        jsonb := p_envio;
  v_producto_ids uuid[];
begin
  if p_referencia_pago is null or p_referencia_pago = '' then
    raise exception 'La referencia de pago es obligatoria';
  end if;

  perform pg_advisory_xact_lock(hashtext('confirmar_venta:' || p_referencia_pago));

  select id into v_pedido_id
  from pedidos
  where referencia_pago = p_referencia_pago;

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
    raise exception 'Carrito no encontrado al confirmar el pago (sesion %)', p_session_id;
  end if;

  select sum(ci.precio_unitario * ci.cantidad), array_agg(ci.producto_id)
  into v_total, v_producto_ids
  from carrito_items ci
  where ci.carrito_id = v_carrito_id;

  if v_total is null then
    raise exception 'Carrito vacio al confirmar el pago (carrito %)', v_carrito_id;
  end if;

  if v_envio is null and p_direccion_envio_id is not null then
    select to_jsonb(d) into v_envio
    from (
      select nombre_destinatario, linea1, linea2, ciudad, codigo_postal, provincia, pais
      from direcciones_envio
      where id = p_direccion_envio_id
    ) d;
  end if;

  insert into pedidos (
    numero_pedido, user_id, estado, total, metodo_pago, referencia_pago,
    direccion_envio_id, email_cliente, documento_cliente,
    envio_nombre, envio_linea1, envio_linea2, envio_ciudad,
    envio_codigo_postal, envio_provincia, envio_pais
  )
  values (
    generar_numero_pedido(p_metodo_pago),
    p_user_id,
    'PROCESANDO',
    v_total,
    p_metodo_pago,
    p_referencia_pago,
    p_direccion_envio_id,
    lower(nullif(p_email_cliente, '')),
    nullif(p_documento_cliente, ''),
    v_envio->>'nombre_destinatario',
    v_envio->>'linea1',
    v_envio->>'linea2',
    v_envio->>'ciudad',
    v_envio->>'codigo_postal',
    v_envio->>'provincia',
    v_envio->>'pais'
  )
  returning id into v_pedido_id;

  insert into pedido_items (pedido_id, producto_id, nombre_producto, cantidad, precio_unitario)
  select v_pedido_id, ci.producto_id, p.nombre, ci.cantidad, ci.precio_unitario
  from carrito_items ci
  join productos p on p.id = ci.producto_id
  where ci.carrito_id = v_carrito_id;

  -- ANTES de consumir las reservas: si este mismo checkout habia pedido los
  -- datos de una transferencia y el cliente acabo pagando por otra via, ese
  -- pedido se cancela. Las unidades no vuelven a la venta, se las lleva este.
  perform cancelar_transferencia_reemplazada(
    p_session_id, p_usuario_autenticado, v_producto_ids
  );

  update productos p
  set stock_reservado = greatest(0, p.stock_reservado - sr.cantidad),
      updated_at      = now()
  from stock_reservas sr
  where sr.producto_id = p.id
    and sr.producto_id = any (v_producto_ids)
    and (
      (p_usuario_autenticado is not null and sr.user_id = p_usuario_autenticado)
      or sr.session_id = p_session_id
    );

  delete from stock_reservas sr
  where sr.producto_id = any (v_producto_ids)
    and (
      (p_usuario_autenticado is not null and sr.user_id = p_usuario_autenticado)
      or sr.session_id = p_session_id
    );

  delete from carrito_items where carrito_id = v_carrito_id;

  return v_pedido_id;
end;
$$;

revoke execute on function public.confirmar_venta(uuid, uuid, uuid, text, text, uuid, text, text, jsonb)
  from public, anon, authenticated;
