-- 033: La confirmación de una venta pasa a ser atómica e idempotente.
--
-- Antes, tras el webhook de pago, la API hacía 6 llamadas sueltas (crear pedido
-- → crear items → confirmar_stock → vaciar carrito). Si una fallaba a mitad
-- quedaba un pedido cobrado sin líneas, o `stock_reservado` inflado para
-- siempre (el error de confirmar_stock solo se logueaba). Y la idempotencia se
-- apoyaba solo en transacciones_pago.evento_id, que se LEÍA antes de crear el
-- pedido y se ESCRIBÍA después: dos reintentos concurrentes del mismo webhook
-- creaban dos pedidos y descontaban stock dos veces.
--
-- Aquí:
--   1. UNIQUE en pedidos.referencia_pago — un pago = un pedido, garantizado en
--      BD. Además .maybeSingle() de la API (reembolsos, consulta por
--      referencia) fallaba con PGRST116 si había duplicados.
--   2. RPC confirmar_venta: todo en una transacción, con lock por referencia de
--      pago e idempotencia real (si el pedido ya existe, devuelve su id sin
--      duplicar nada).

-- ============================================================
-- 1. Un pago, un pedido
-- ============================================================

-- Diagnóstico previo: si hay duplicados históricos el índice no se creará y
-- este RAISE los deja a la vista en lugar de fallar con un mensaje opaco.
do $$
declare
  v_dups text;
begin
  select string_agg(referencia_pago || ' (' || n || ')', ', ')
  into v_dups
  from (
    select referencia_pago, count(*) as n
    from pedidos
    where referencia_pago is not null
    group by referencia_pago
    having count(*) > 1
  ) d;

  if v_dups is not null then
    raise exception
      'Hay pedidos que comparten referencia_pago y hay que consolidarlos a mano antes de aplicar esta migración: %',
      v_dups;
  end if;
end $$;

create unique index if not exists pedidos_referencia_pago_key
  on public.pedidos (referencia_pago)
  where referencia_pago is not null;

-- ============================================================
-- 2. Número de pedido: AAMMDD + código de método + 4 dígitos
--    Misma forma que generaba la API, con la zona horaria del negocio
--    (Europe/Madrid), igual que el backfill de la migración 021.
-- ============================================================

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
         else '00'
       end;

  for _ in 1..25 loop
    v_candidato := v_prefijo || lpad(floor(random() * 10000)::text, 4, '0');
    if not exists (select 1 from pedidos where numero_pedido = v_candidato) then
      return v_candidato;
    end if;
  end loop;

  raise exception 'No se pudo generar un numero_pedido único para el prefijo %', v_prefijo;
end;
$$;

revoke execute on function public.generar_numero_pedido(text) from public, anon, authenticated;

-- ============================================================
-- 3. confirmar_venta: pedido + líneas + stock + carrito, todo o nada
-- ============================================================

create or replace function public.confirmar_venta(
  p_session_id           uuid,
  -- Usuario autenticado DURANTE el checkout: determina dónde viven el carrito y
  -- las reservas. NULL = compró como invitado (carrito de sesión).
  p_usuario_autenticado  uuid,
  -- Dueño final del pedido: puede venir de un lookup por email (invitado cuyo
  -- correo pertenece a una cuenta registrada). NO sirve para hallar el carrito.
  p_user_id              uuid,
  p_metodo_pago          text,
  p_referencia_pago      text,
  p_direccion_envio_id   uuid    default null,
  p_email_cliente        text    default null,
  p_documento_cliente    text    default null,
  -- Snapshot de dirección para invitados (sin fila en direcciones_envio)
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

  -- Serializa los reintentos concurrentes del mismo webhook. Se libera al
  -- terminar la transacción.
  perform pg_advisory_xact_lock(hashtext('confirmar_venta:' || p_referencia_pago));

  -- Idempotencia: el pago ya se confirmó → devolver el pedido existente.
  select id into v_pedido_id
  from pedidos
  where referencia_pago = p_referencia_pago;

  if v_pedido_id is not null then
    return v_pedido_id;
  end if;

  -- Carrito: por usuario autenticado, o el de la sesión de invitado. El filtro
  -- user_id IS NULL importa: la misma sesión puede arrastrar un carrito de
  -- usuario de un login anterior.
  if p_usuario_autenticado is not null then
    select id into v_carrito_id from carritos where user_id = p_usuario_autenticado;
  else
    select id into v_carrito_id
    from carritos
    where session_id = p_session_id and user_id is null;
  end if;

  if v_carrito_id is null then
    raise exception 'Carrito no encontrado al confirmar el pago (sesión %)', p_session_id;
  end if;

  select sum(ci.precio_unitario * ci.cantidad), array_agg(ci.producto_id)
  into v_total, v_producto_ids
  from carrito_items ci
  where ci.carrito_id = v_carrito_id;

  if v_total is null then
    raise exception 'Carrito vacío al confirmar el pago (carrito %)', v_carrito_id;
  end if;

  -- Snapshot de la dirección guardada: protege el histórico de ediciones o
  -- borrados posteriores de direcciones_envio.
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

  -- Líneas del pedido: snapshot del nombre para que el histórico sobreviva a
  -- renombrados del catálogo.
  insert into pedido_items (pedido_id, producto_id, nombre_producto, cantidad, precio_unitario)
  select v_pedido_id, ci.producto_id, p.nombre, ci.cantidad, ci.precio_unitario
  from carrito_items ci
  join productos p on p.id = ci.producto_id
  where ci.carrito_id = v_carrito_id;

  -- Confirmar stock: stock_disponible ya se descontó al reservar; aquí solo se
  -- libera el reservado. Acotado a los productos de ESTE pedido para no barrer
  -- reservas vivas de otros intentos de checkout de la misma sesión.
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
