-- ============================================================
-- 053 — `confirmar_venta` vuelve a copiar el teléfono al pedido
--
-- Encontrado el 2026-08-05 al verificar una compra de prueba: el pedido
-- `260805010148` se hizo con una dirección guardada que TIENE teléfono
-- (`direcciones_envio.telefono = 658498020`) y salió con
-- `pedidos.envio_telefono = NULL`.
--
-- QUÉ PASÓ: la **040** añadió el teléfono a `confirmar_venta` —lo leía de
-- `direcciones_envio` cuando el snapshot venía vacío y lo insertaba en
-- `envio_telefono`—. La **047** volvió a redefinir la función para lo del
-- carrito, pero **partiendo de la versión 033**, que es anterior a la 040, y se
-- llevó el teléfono por delante: desapareció de la lista de columnas del
-- insert, de los `values` y del `select` de la dirección. Nadie lo notó porque
-- la función siguió funcionando: un pedido sin teléfono no falla, solo pierde
-- el dato.
--
-- El alcance real no era «las direcciones guardadas»: `confirmar_venta` dejó de
-- copiarlo **siempre**, así que desde el 2026-08-02 TODO pedido con tarjeta o
-- Bizum perdió el teléfono. La misma 047 sí lo conservó en
-- `crear_pedido_transferencia` (están en el mismo fichero, a 280 líneas de
-- distancia), y por eso los pedidos por transferencia sí lo tienen. Eso es lo
-- que hacía que el patrón pareciera ser el tipo de dirección.
--
-- POR QUÉ IMPORTA aunque el panel siga mostrando un teléfono: `listar_clientes`
-- (043) coge el más reciente entre `profiles` y `direcciones_envio` y deja el
-- snapshot como último recurso, así que hoy no se ve roto. Pero el snapshot
-- existe para que el pedido conserve SU copia: si el cliente edita o borra esa
-- dirección, el pedido se queda sin el teléfono con el que se hizo — y el
-- teléfono es cómo se localiza a alguien por una entrega. Es el mismo criterio
-- por el que el histórico de direcciones vive en `pedidos.envio_*` y no en
-- `direcciones_envio`.
--
-- ⚠️ LA LECCIÓN, que es lo que hay que recordar: un `create or replace` de una
-- función grande **reescribe el cuerpo entero**. Reconstruirla copiando de una
-- migración anterior revierte en silencio todo lo que se añadió en medio, y no
-- falla nada, así que no salta ningún test ni ningún error. Esta migración se
-- ha escrito partiendo de `pg_get_functiondef()` **de la función viva en el
-- remoto**, no del fichero de la 047 — porque la **052** también la tocó (las
-- reservas de checkout, `cancelar_transferencia_reemplazada`) y partir del
-- fichero habría repetido el mismo error al revés, esta vez tirando la 052.
-- Todo lo de abajo es idéntico a lo que ya estaba vivo salvo las tres líneas
-- del teléfono, marcadas con «← 053».
-- ============================================================

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

  select id into v_pedido_id from pedidos where referencia_pago = p_referencia_pago;
  if v_pedido_id is not null then
    return v_pedido_id;
  end if;

  if p_usuario_autenticado is not null then
    select id into v_carrito_id from carritos where user_id = p_usuario_autenticado;
  else
    select id into v_carrito_id from carritos
    where session_id = p_session_id and user_id is null;
  end if;

  if v_carrito_id is null then
    raise exception 'Carrito no encontrado al confirmar el pago (sesion %)', p_session_id;
  end if;

  select sum(ci.precio_unitario * ci.cantidad), array_agg(ci.producto_id)
  into v_total, v_producto_ids
  from carrito_items ci where ci.carrito_id = v_carrito_id;

  if v_total is null then
    raise exception 'Carrito vacio al confirmar el pago (carrito %)', v_carrito_id;
  end if;

  -- El snapshot manda; si no viene, se arma desde la dirección guardada.
  -- `telefono` en este select es lo que la 047 perdió.                ← 053
  if v_envio is null and p_direccion_envio_id is not null then
    select to_jsonb(d) into v_envio
    from (select nombre_destinatario, linea1, linea2, ciudad, codigo_postal, provincia, pais,
                 telefono                                            -- ← 053
          from direcciones_envio where id = p_direccion_envio_id) d;
  end if;

  insert into pedidos (
    numero_pedido, user_id, estado, total, metodo_pago, referencia_pago,
    direccion_envio_id, email_cliente, documento_cliente,
    envio_nombre, envio_linea1, envio_linea2, envio_ciudad,
    envio_codigo_postal, envio_provincia, envio_pais,
    envio_telefono                                                   -- ← 053
  ) values (
    generar_numero_pedido(p_metodo_pago), p_user_id, 'PROCESANDO', v_total,
    p_metodo_pago, p_referencia_pago, p_direccion_envio_id,
    lower(nullif(p_email_cliente, '')), nullif(p_documento_cliente, ''),
    v_envio->>'nombre_destinatario', v_envio->>'linea1', v_envio->>'linea2',
    v_envio->>'ciudad', v_envio->>'codigo_postal', v_envio->>'provincia', v_envio->>'pais',
    nullif(v_envio->>'telefono', '')                                 -- ← 053
  )
  returning id into v_pedido_id;

  insert into pedido_items (pedido_id, producto_id, nombre_producto, cantidad, precio_unitario)
  select v_pedido_id, ci.producto_id, p.nombre, ci.cantidad, ci.precio_unitario
  from carrito_items ci join productos p on p.id = ci.producto_id
  where ci.carrito_id = v_carrito_id;

  -- ANTES de consumir: son las reservas las que identifican al pedido a
  -- cancelar. Suelta ademas las que aquel retenia, que son distintas de estas.
  perform cancelar_transferencia_reemplazada(
    p_session_id, p_usuario_autenticado, v_producto_ids, v_pedido_id
  );

  -- Solo las de checkout, y agrupadas por producto.
  update productos p
  set stock_reservado = greatest(0, p.stock_reservado - a.cantidad), updated_at = now()
  from (
    select sr.producto_id, sum(sr.cantidad) as cantidad
    from stock_reservas sr
    where sr.producto_id = any (v_producto_ids)
      and sr.pedido_id is null
      and ((p_usuario_autenticado is not null and sr.user_id = p_usuario_autenticado)
           or sr.session_id = p_session_id)
    group by sr.producto_id
  ) a
  where p.id = a.producto_id;

  delete from stock_reservas sr
  where sr.producto_id = any (v_producto_ids)
    and sr.pedido_id is null
    and ((p_usuario_autenticado is not null and sr.user_id = p_usuario_autenticado)
         or sr.session_id = p_session_id);

  delete from carrito_items where carrito_id = v_carrito_id;

  return v_pedido_id;
end;
$function$;

-- ── Recuperar el dato de los pedidos ya afectados ───────────────────────────
-- Solo donde se puede AFIRMAR que el teléfono es el que había al hacer el
-- pedido: hay dirección guardada, tiene teléfono, y esa dirección **no se ha
-- tocado después** del pedido (`updated_at <= created_at`). Si se hubiera
-- editado luego, copiarlo sería inventarse el histórico, que es justo lo que el
-- snapshot está ahí para evitar.
--
-- Los pedidos sin dirección guardada y sin teléfono en el snapshot no se pueden
-- recuperar: ese dato no quedó registrado en ningún sitio.
update pedidos p
set envio_telefono = d.telefono
from direcciones_envio d
where d.id = p.direccion_envio_id
  and p.envio_telefono is null
  and d.telefono is not null
  and d.updated_at <= p.created_at;
