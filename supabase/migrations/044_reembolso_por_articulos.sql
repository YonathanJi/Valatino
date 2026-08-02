-- ============================================================
-- 044 — Devolver artículos concretos, no solo un importe
--
-- Pedido por Jonathan: al reembolsar, ver los artículos del pedido y elegir
-- cuáles se devuelven, «así será más fácil ordenar el reembolso y que no queden
-- colas».
--
-- La cola que quita es la que dejó escrita la 037 en su propio comentario:
--
--   «Solo repone el reembolso TOTAL: en uno parcial el importe no dice qué
--    unidades vuelven (¿2 de un producto de 5 € o 1 de uno de 10 €?), así que
--    el ajuste se hace a mano desde Inventario cuando la mercancía llega.»
--
-- Eso era cierto mientras un reembolso parcial fuera solo una cifra. En cuanto
-- se eligen las líneas, el reembolso SÍ dice qué unidades vuelven, y el ajuste
-- a mano —que es justamente lo que se olvida— deja de hacer falta.
--
-- Lo que se guarda es QUÉ se devolvió, no solo cuánto. De ahí salen las tres
-- cosas que antes no se podían saber:
--   · Qué le queda a este pedido por devolver, línea a línea (sin esto, la
--     segunda devolución parcial vuelve a ofrecer lo ya devuelto).
--   · Si esas unidades volvieron al inventario o no.
--   · Qué artículos figuran en cada devolución, en la ficha del pedido.
--
-- ⚠️ EL PELIGRO DE ESTA MIGRACIÓN ES LA DOBLE REPOSICIÓN DE STOCK.
-- `reembolsar_pedido_total` (037/039) repone TODAS las unidades del pedido. Si
-- antes hubo un parcial por artículos que ya devolvió 1 unidad al inventario,
-- completar después el reembolso la repondría otra vez y el stock quedaría por
-- encima de lo real. Por eso aquí se reescribe para reponer solo lo que NO
-- figure ya en `reembolso_lineas`. Ver el apartado 3.
-- ============================================================

-- ── 1. Qué se devolvió de cada pedido ──────────────────────────────────────

create table if not exists public.reembolso_lineas (
  id                uuid primary key default gen_random_uuid(),
  pedido_id         uuid not null references public.pedidos (id) on delete cascade,
  pedido_item_id    uuid not null references public.pedido_items (id) on delete cascade,

  cantidad          integer not null check (cantidad > 0),
  -- Copia del dinero de esta línea (cantidad × precio_unitario) en el momento
  -- de devolverla. Mismo criterio que `pedidos.envio_*`: el histórico no puede
  -- depender de que el precio del catálogo siga siendo el de entonces.
  importe           numeric(10,2) not null check (importe > 0),

  -- Si estas unidades volvieron a la venta. `false` es una decisión tomada
  -- (mercancía defectuosa o perdida), NO un «todavía no»: por eso el reembolso
  -- total de más abajo tampoco las repone después.
  repuesto_al_stock boolean not null default false,

  -- El reembolso de Stripe que pagó esta línea. Es lo que hace idempotente el
  -- registro: el mismo refund no puede apuntarse dos veces sobre la misma
  -- línea, así que un reintento no duplica ni el importe ni el stock.
  refund_id         text not null,

  actor_user_id     uuid references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),

  constraint reembolso_lineas_refund_item_unico unique (refund_id, pedido_item_id)
);

create index if not exists idx_reembolso_lineas_pedido on public.reembolso_lineas (pedido_id);
create index if not exists idx_reembolso_lineas_item on public.reembolso_lineas (pedido_item_id);

comment on table public.reembolso_lineas is
  'Qué artículos se devolvieron en cada reembolso. Sin esto un parcial es solo una cifra y no se sabe qué unidades vuelven al inventario ni qué queda por devolver.';
comment on column public.reembolso_lineas.repuesto_al_stock is
  'Decisión tomada al devolver, no un pendiente: si es false, esas unidades no vuelven al inventario tampoco en un reembolso total posterior.';

-- Escritura y lectura solo por la API con service_role, como el resto del
-- dinero. Sin policies: RLS activa y nadie más entra.
alter table public.reembolso_lineas enable row level security;

-- ── 2. Registrar la devolución de unas líneas ──────────────────────────────
--
-- Se llama DESPUÉS de cobrar en Stripe (esa es la regla del servicio: el dinero
-- primero, la base después, para no marcar como devuelto lo que Stripe rechazó).
-- Por eso esta función NO lanza por cantidades: el dinero ya salió, y abortar
-- aquí dejaría la devolución cobrada y sin rastro. Lo que hace es recortar a lo
-- que de verdad queda por devolver y contarlo en el resultado, para que la API
-- lo registre en el log.
--
-- Marcar el pedido como REEMBOLSADO se hace aquí dentro, en la MISMA
-- transacción y siempre después de insertar las líneas. No es un detalle de
-- estilo: al revés, `reembolsar_pedido_total` no vería las líneas recién
-- devueltas y repondría su stock por segunda vez. Dejarlo en dos llamadas desde
-- la API haría que el orden dependiera de que alguien lo recuerde.
create or replace function public.registrar_reembolso_lineas(
  p_pedido_id      uuid,
  p_lineas         jsonb,    -- [{"pedido_item_id": "…", "cantidad": 2}, …]
  p_reponer_stock  boolean,
  p_refund_id      text,
  p_marcar_total   boolean default false,
  p_actor_id       uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pedidas     integer := 0;
  v_registradas integer := 0;
  v_unidades    integer := 0;
  v_importe     numeric(10,2) := 0;
  v_repuestas   integer := 0;
  v_pendientes  integer := 0;
  v_total       boolean := false;
begin
  -- El mismo cerrojo que usa reembolsar_pedido_total: si el panel y el webhook
  -- entran a la vez sobre este pedido, se ponen en fila en vez de leer los dos
  -- el mismo «ya devuelto» y pasarse de unidades.
  perform pg_advisory_xact_lock(hashtext('reembolsar_pedido:' || p_pedido_id::text));

  with entrada as (
    select
      (l->>'pedido_item_id')::uuid as pedido_item_id,
      (l->>'cantidad')::integer    as cantidad
    from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) l
  ),
  -- El join contra pedido_items acotado por p_pedido_id es lo que impide
  -- devolver la línea de OTRO pedido: una línea ajena no aparece y se ignora.
  -- Y el precio sale de aquí, nunca de lo que mande el navegador.
  disponible as (
    select
      i.id,
      i.producto_id,
      i.precio_unitario,
      least(e.cantidad, i.cantidad - coalesce(y.devuelto, 0)) as cantidad
    from entrada e
    join public.pedido_items i
      on i.id = e.pedido_item_id
     and i.pedido_id = p_pedido_id
    left join (
      select pedido_item_id, sum(cantidad) as devuelto
      from public.reembolso_lineas
      group by pedido_item_id
    ) y on y.pedido_item_id = i.id
  ),
  insertada as (
    insert into public.reembolso_lineas (
      pedido_id, pedido_item_id, cantidad, importe,
      repuesto_al_stock, refund_id, actor_user_id
    )
    select
      p_pedido_id, d.id, d.cantidad, round(d.cantidad * d.precio_unitario, 2),
      coalesce(p_reponer_stock, false), p_refund_id, p_actor_id
    from disponible d
    where d.cantidad > 0
    -- Reintento del mismo reembolso: ya está apuntado. No se duplica la línea
    -- y, al no salir por el returning, tampoco se repone su stock otra vez.
    on conflict (refund_id, pedido_item_id) do nothing
    returning pedido_item_id, cantidad, importe
  ),
  -- Agrupado por producto ANTES de tocar el stock. `update … from` con dos
  -- filas que casan con el mismo producto aplica una sola y descarta la otra
  -- en silencio, así que un pedido con dos líneas del mismo artículo repondría
  -- de menos. Sumar aquí lo hace imposible.
  a_reponer as (
    select i.producto_id, sum(ins.cantidad) as unidades
    from insertada ins
    join public.pedido_items i on i.id = ins.pedido_item_id
    group by i.producto_id
  ),
  repuesta as (
    update public.productos p
    -- Las unidades devueltas, no las compradas.
    set stock_disponible = p.stock_disponible + ar.unidades,
        updated_at = now()
    from a_reponer ar
    where p.id = ar.producto_id
      and coalesce(p_reponer_stock, false)
    returning p.id
  )
  select
    (select count(*) from entrada),
    (select count(*) from insertada),
    (select coalesce(sum(cantidad), 0) from insertada),
    (select coalesce(sum(importe), 0) from insertada)
  into v_pedidas, v_registradas, v_unidades, v_importe;

  if coalesce(p_reponer_stock, false) then
    v_repuestas := v_unidades;
  end if;

  if p_marcar_total then
    -- Lo que reembolsar_pedido_total va a reponer, contado ANTES de llamarla:
    -- después ya no se distingue de lo que devolvió esta misma operación. Sin
    -- esto habría que suponer que un reembolso total siempre repone algo, y con
    -- todas las líneas ya devueltas como no revendibles no repone nada.
    select coalesce(sum(i.cantidad - coalesce(r.devuelto, 0)), 0)
    into v_pendientes
    from public.pedido_items i
    left join (
      select pedido_item_id, sum(cantidad) as devuelto
      from public.reembolso_lineas
      group by pedido_item_id
    ) r on r.pedido_item_id = i.id
    where i.pedido_id = p_pedido_id
      and i.cantidad - coalesce(r.devuelto, 0) > 0;

    v_total := public.reembolsar_pedido_total(p_pedido_id, p_actor_id);
    if v_total then
      v_repuestas := v_repuestas + v_pendientes;
    end if;
  end if;

  return jsonb_build_object(
    'registradas', v_registradas,
    -- Menos que las pedidas = alguien devolvió esas unidades mientras esta
    -- petición iba a Stripe, o es un reintento. La API lo escribe en el log:
    -- significa que se ha cobrado más de lo que consta devuelto en artículos.
    'pedidas',     v_pedidas,
    'unidades',    v_unidades,
    'importe',     v_importe,
    'unidades_repuestas', v_repuestas,
    'repuesto',    v_repuestas > 0,
    'marcado_total', v_total
  );
end;
$$;

comment on function public.registrar_reembolso_lineas(uuid, jsonb, boolean, text, boolean, uuid) is
  'Apunta qué artículos se devolvieron, repone su stock si procede y cierra el pedido si el reembolso lo completa. Idempotente por refund_id.';

revoke execute on function public.registrar_reembolso_lineas(uuid, jsonb, boolean, text, boolean, uuid)
  from public, anon, authenticated;

-- ── 3. El reembolso total ya no repone lo que ya se devolvió ───────────────
--
-- Único cambio respecto a la 039: el stock que repone descuenta lo que figure
-- en `reembolso_lineas`. Sin esto, el escenario normal de esta funcionalidad
-- —devolver un artículo hoy y el resto del pedido mañana— dejaría el inventario
-- inflado en las unidades del primer parcial.
--
-- Se descuentan TODAS las líneas registradas, repuestas o no. Que una línea
-- tenga `repuesto_al_stock = false` no es un pendiente: es que se decidió que
-- esa mercancía no vuelve a la venta, y completar el reembolso después no
-- cambia el estado de una caja rota.
create or replace function public.reembolsar_pedido_total(
  p_pedido_id uuid,
  p_actor_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_estado public.pedido_estado;
begin
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

  -- Quién pidió la devolución, para el historial. Cuando llega por el webhook
  -- de Stripe no hay actor y queda como 'webhook', que es lo que ocurrió.
  perform set_config('app.actor_id', coalesce(p_actor_id::text, ''), true);
  perform set_config('app.origen', case when p_actor_id is null then 'webhook' else 'panel' end, true);

  update public.pedidos
  set estado = 'REEMBOLSADO',
      updated_at = now()
  where id = p_pedido_id;

  -- Ver el porqué en cambiar_estado_pedido: la variable dura toda la
  -- transacción y arrastraría el autor a lo que venga después.
  perform set_config('app.actor_id', '', true);
  perform set_config('app.origen', '', true);

  -- Devuelve a la venta las unidades que no se hayan devuelto ya por artículo.
  -- `stock_reservado` no se toca: la reserva del checkout ya se consumió al
  -- confirmar la venta.
  --
  -- Agrupado por producto por lo mismo que en registrar_reembolso_lineas: con
  -- dos líneas del mismo artículo, `update … from` aplicaría solo una.
  update public.productos p
  set stock_disponible = p.stock_disponible + pendiente.unidades,
      updated_at = now()
  from (
    select i.producto_id, sum(i.cantidad - coalesce(r.devuelto, 0)) as unidades
    from public.pedido_items i
    left join (
      select pedido_item_id, sum(cantidad) as devuelto
      from public.reembolso_lineas
      group by pedido_item_id
    ) r on r.pedido_item_id = i.id
    where i.pedido_id = p_pedido_id
    group by i.producto_id
    having sum(i.cantidad - coalesce(r.devuelto, 0)) > 0
  ) pendiente
  where p.id = pendiente.producto_id;

  return true;
end;
$$;

revoke execute on function public.reembolsar_pedido_total(uuid, uuid)
  from public, anon, authenticated;
