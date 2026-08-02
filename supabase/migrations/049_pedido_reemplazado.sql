-- ============================================================
-- 049 — Qué pedido sustituyó a cuál
--
-- Preguntado por Jonathan al ver en el panel dos pedidos del mismo carrito: el
-- de transferencia que se canceló y el que pagó con Bizum. «¿No debería ser un
-- solo pedido con el historial?»
--
-- NO se fusionan, y conviene dejar escrito el porqué: el pedido por
-- transferencia **no es un carrito abandonado**. Tuvo número propio, retuvo
-- stock, y ese número se le dio al cliente como concepto de la transferencia.
-- Si hubiera llegado a ingresar el dinero justo antes de pagar por otra vía,
-- habría un apunte en el banco con ese número. Fusionarlos sería reescribir un
-- documento comercial y dejar `transacciones_pago` apuntando a un pedido que ya
-- no es el que fue.
--
-- Lo que sí se arregla es la vista: los dos quedan enlazados, y el panel deja
-- de listar por defecto los intentos que nunca se pagaron. Un solo pedido a la
-- vista, la traza entera si alguien pregunta por un ingreso.
-- ============================================================

alter table public.pedidos
  add column if not exists reemplazado_por uuid references public.pedidos (id) on delete set null;

create index if not exists idx_pedidos_reemplazado_por on public.pedidos (reemplazado_por);

comment on column public.pedidos.reemplazado_por is
  'Pedido que sustituyo a este cuando el cliente cambio de forma de pago. Solo en los cancelados sin cobrar.';

-- Misma función que la 047, ahora dejando constancia de quién ocupó su lugar.
create or replace function public.cancelar_transferencia_reemplazada(
  p_session_id          uuid,
  p_usuario_autenticado uuid,
  p_producto_ids        uuid[],
  -- El pedido que sí se ha pagado. Va con default para que una llamada de tres
  -- argumentos —la de la 047, mientras Render termina de desplegar— siga
  -- resolviendo en vez de romper un cobro.
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
      -- Un pedido no puede sustituirse a si mismo.
      and p.id is distinct from p_reemplazado_por
    returning 1
  )
  select count(*) into v_cancelados from cancelados;

  return v_cancelados;
end;
$$;

revoke execute on function public.cancelar_transferencia_reemplazada(uuid, uuid, uuid[], uuid)
  from public, anon, authenticated;
