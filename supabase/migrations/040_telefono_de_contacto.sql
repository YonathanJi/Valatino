-- ============================================================
-- 040 — Teléfono de contacto del cliente
--
-- El teléfono no se pedía en ningún sitio del storefront: `profiles.telefono`
-- existía y `listar_clientes` lo leía, pero solo podía rellenarlo el personal
-- a mano desde el panel. Para un invitado era imposible: no había dónde
-- guardarlo, porque `pedidos` no tenía columna. La ficha del pedido llegaba
-- incluso a etiquetar la referencia de pago como «Teléfono».
--
-- Se sigue el mismo criterio que el resto de `pedidos.envio_*`: el dato viaja
-- al pedido como COPIA. Si el cliente cambia luego de número, el pedido antiguo
-- sigue diciendo a qué teléfono se avisó para aquella entrega.
--
-- Ambas columnas son nullable: las filas anteriores no lo tienen y no hay
-- ningún valor honesto que inventarles. Lo exige el formulario, no la tabla.
--
-- Compatible con la API anterior a propósito: la firma de `confirmar_venta` no
-- cambia, así que una versión vieja que llame sin `telefono` en el jsonb sigue
-- funcionando y deja la columna a NULL.
-- ============================================================

alter table direcciones_envio add column if not exists telefono varchar(30);
alter table pedidos          add column if not exists envio_telefono varchar(30);

comment on column direcciones_envio.telefono is
  'Teléfono de contacto para la entrega, 9 dígitos normalizados (ES).';
comment on column pedidos.envio_telefono is
  'Copia del teléfono de contacto en el momento del pedido (snapshot, como el resto de envio_*).';

-- ── confirmar_venta: arrastrar el teléfono al pedido ────────────────────────
-- Se toca solo el bloque de la dirección; el resto es idéntico a la 033.
create or replace function public.confirmar_venta(
  p_session_id uuid,
  p_usuario_autenticado uuid,
  p_user_id uuid,
  p_metodo_pago text,
  p_referencia_pago text,
  p_direccion_envio_id uuid default null,
  p_email_cliente text default null,
  p_documento_cliente text default null,
  p_envio jsonb default null
)
returns uuid
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
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
    raise exception 'Carrito no encontrado al confirmar el pago (sesión %)', p_session_id;
  end if;

  select sum(ci.precio_unitario * ci.cantidad), array_agg(ci.producto_id)
  into v_total, v_producto_ids
  from carrito_items ci
  where ci.carrito_id = v_carrito_id;

  if v_total is null then
    raise exception 'Carrito vacío al confirmar el pago (carrito %)', v_carrito_id;
  end if;

  if v_envio is null and p_direccion_envio_id is not null then
    select to_jsonb(d) into v_envio
    from (
      select nombre_destinatario, linea1, linea2, ciudad, codigo_postal, provincia, pais, telefono
      from direcciones_envio
      where id = p_direccion_envio_id
    ) d;
  end if;

  insert into pedidos (
    numero_pedido, user_id, estado, total, metodo_pago, referencia_pago,
    direccion_envio_id, email_cliente, documento_cliente,
    envio_nombre, envio_linea1, envio_linea2, envio_ciudad,
    envio_codigo_postal, envio_provincia, envio_pais, envio_telefono
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
    v_envio->>'pais',
    nullif(v_envio->>'telefono', '')
  )
  returning id into v_pedido_id;

  insert into pedido_items (pedido_id, producto_id, nombre_producto, cantidad, precio_unitario)
  select v_pedido_id, ci.producto_id, p.nombre, ci.cantidad, ci.precio_unitario
  from carrito_items ci
  join productos p on p.id = ci.producto_id
  where ci.carrito_id = v_carrito_id;

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
$function$;

-- ── listar_clientes: el teléfono también se deriva del pedido ───────────────
-- Mismo criterio que ya se aplicaba a `nombre` y `documento`: el registro es
-- por OTP y solo captura el email, así que el dato real del cliente vive en el
-- pedido. Sin esto, el invitado seguiría saliendo con teléfono vacío para
-- siempre aunque lo acabe de teclear al comprar (la rama `sin_cuenta` lo tenía
-- cableado a NULL).
create or replace function public.listar_clientes()
returns table(
  user_id uuid,
  email text,
  nombre text,
  telefono text,
  documento text,
  tiene_cuenta boolean,
  cliente_desde timestamptz,
  pedidos integer,
  total_gastado numeric,
  ultimo_pedido timestamptz
)
language sql
security definer
set search_path to 'public', 'pg_temp'
as $function$
  with
  por_cuenta as (
    select
      p.user_id,
      count(*)::int as pedidos,
      coalesce(sum(p.total) filter (
        where p.estado in ('PROCESANDO', 'ENVIADO', 'ENTREGADO')
      ), 0) as total_gastado,
      max(p.created_at) as ultimo_pedido,
      (array_agg(p.envio_nombre order by p.created_at desc)
        filter (where p.envio_nombre is not null))[1] as nombre_pedido,
      (array_agg(p.documento_cliente order by p.created_at desc)
        filter (where p.documento_cliente is not null))[1] as documento_pedido,
      (array_agg(p.envio_telefono order by p.created_at desc)
        filter (where p.envio_telefono is not null))[1] as telefono_pedido
    from pedidos p
    where p.user_id is not null
    group by p.user_id
  ),
  con_cuenta as (
    select
      u.id as user_id,
      lower(coalesce(pr.email, u.email))::text as email,
      coalesce(pr.nombre, pc.nombre_pedido)::text as nombre,
      coalesce(pr.telefono, pc.telefono_pedido)::text as telefono,
      coalesce(pr.documento, pc.documento_pedido)::text as documento,
      true as tiene_cuenta,
      u.created_at as cliente_desde,
      coalesce(pc.pedidos, 0) as pedidos,
      coalesce(pc.total_gastado, 0) as total_gastado,
      pc.ultimo_pedido
    from auth.users u
    join user_roles ur on ur.user_id = u.id
    join roles r on r.id = ur.role_id and r.nombre = 'cliente'
    left join profiles pr on pr.id = u.id
    left join por_cuenta pc on pc.user_id = u.id
  ),
  sin_cuenta as (
    select
      null::uuid as user_id,
      lower(p.email_cliente)::text as email,
      (array_agg(p.envio_nombre order by p.created_at desc)
        filter (where p.envio_nombre is not null))[1]::text as nombre,
      (array_agg(p.envio_telefono order by p.created_at desc)
        filter (where p.envio_telefono is not null))[1]::text as telefono,
      (array_agg(p.documento_cliente order by p.created_at desc)
        filter (where p.documento_cliente is not null))[1]::text as documento,
      false as tiene_cuenta,
      min(p.created_at) as cliente_desde,
      count(*)::int as pedidos,
      coalesce(sum(p.total) filter (
        where p.estado in ('PROCESANDO', 'ENVIADO', 'ENTREGADO')
      ), 0) as total_gastado,
      max(p.created_at) as ultimo_pedido
    from pedidos p
    where p.user_id is null
      and p.email_cliente is not null
    group by lower(p.email_cliente)
  )
  select * from con_cuenta
  union all
  select * from sin_cuenta
  order by ultimo_pedido desc nulls last, cliente_desde desc;
$function$;
