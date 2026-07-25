-- 037: Marcar un pedido REEMBOLSADO y devolver sus unidades al inventario,
-- en una sola transacción y una sola vez.
--
-- El reembolso total puede llegar por dos caminos distintos:
--   1. POST /admin/pedidos/:id/reembolso  (el admin lo lanza desde el panel)
--   2. El webhook charge.refunded         (alguien lo hizo en el panel de Stripe)
-- y el camino 1 provoca el 2: Stripe notifica el reembolso que acabamos de
-- pedirle. Si la reposición de stock viviera en la API, esas dos entradas
-- sumarían el stock dos veces por el mismo dinero devuelto.
--
-- Aquí el cambio de estado es el que da permiso a reponer: se hace bajo lock de
-- fila y solo si el pedido no estaba ya REEMBOLSADO. El segundo aviso encuentra
-- el estado ya puesto, devuelve false y no toca el inventario. Idempotente por
-- construcción, sin necesidad de recordar comprobarlo en cada llamada.
--
-- Solo repone el reembolso TOTAL: en uno parcial el importe no dice qué
-- unidades vuelven (¿2 de un producto de 5 € o 1 de uno de 10 €?), así que el
-- ajuste se hace a mano desde Inventario cuando la mercancía llega.

create or replace function public.reembolsar_pedido_total(
  p_pedido_id uuid
)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_estado public.pedido_estado;
begin
  -- Serializa los dos caminos si entran a la vez (panel y webhook). El lock de
  -- transacción se libera solo al terminar, sin necesidad de desbloquear.
  perform pg_advisory_xact_lock(hashtext('reembolsar_pedido:' || p_pedido_id::text));

  select estado into v_estado
  from public.pedidos
  where id = p_pedido_id
  for update;

  if not found then
    raise exception 'Pedido % no existe', p_pedido_id using errcode = 'P0002';
  end if;

  -- Ya reembolsado: el otro camino llegó primero. No es un error.
  if v_estado = 'REEMBOLSADO' then
    return false;
  end if;

  update public.pedidos
  set estado = 'REEMBOLSADO',
      updated_at = now()
  where id = p_pedido_id;

  -- Devuelve las unidades a la venta. `stock_reservado` no se toca: la reserva
  -- del checkout ya se consumió al confirmar la venta.
  update public.productos p
  set stock_disponible = p.stock_disponible + i.cantidad,
      updated_at = now()
  from public.pedido_items i
  where i.pedido_id = p_pedido_id
    and p.id = i.producto_id;

  return true;
end;
$$;

comment on function public.reembolsar_pedido_total(uuid) is
  'Marca el pedido REEMBOLSADO y repone su stock. Devuelve false si ya lo estaba (idempotente).';

-- Escritura de negocio: solo la API con service_role.
revoke execute on function public.reembolsar_pedido_total(uuid) from public, anon, authenticated;
