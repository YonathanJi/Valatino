-- ============================================================
-- 056 — Desempaquetar: convertir bultos en unidades sueltas
--
-- Petición de Jonathan: compra la CAJA de Quipitos pero quiere vender también
-- la unidad; lo mismo con los bombones (paquete y unidad).
--
-- ⚠️ EL PROBLEMA DE FONDO, que es lo que descarta la solución fácil: caja y
-- unidad **comparten la misma mercancía física**. Con dos productos sueltos y
-- stock independiente, vender una unidad no descuenta nada de la caja, así que
-- se venden unidades que están dentro de una caja que también se ha vendido.
--
-- LO QUE SE DESCARTÓ, y por qué: el modelo «correcto» sería un solo stock con
-- factores de conversión por formato. Eso mete la conversión dentro de
-- `reservar_carrito`, `confirmar_venta`, `stock_reservas` y los reembolsos con
-- reposición — la ruta por la que pasa el dinero, y justo los invariantes que
-- costó dos migraciones (052) dejar bien. Es la misma razón por la que los
-- sabores tampoco son variantes en BD: no se toca la ruta crítica por una
-- comodidad de catálogo.
--
-- LO QUE SE HACE: caja y unidad siguen siendo productos independientes, y se
-- añade la operación que en la tienda ocurre de verdad — **abrir una caja**:
--   −1 caja  →  +N unidades,  en una sola transacción.
-- Copia la realidad física, no toca el checkout, y falla del lado seguro: no se
-- pueden vender unidades de una caja que nadie ha abierto.
--
-- ⚠️ CLAVE DEL MODELO DE STOCK, que decide la comprobación: `stock_disponible`
-- **ya es el stock LIBRE**. `reservar_carrito` hace `stock_disponible − cantidad`
-- **y** `stock_reservado + cantidad`: reservar MUEVE unidades de un cubo al otro,
-- no marca un subconjunto. Por eso comprobar `stock_disponible >= bultos` es
-- suficiente para no desempaquetar cajas que alguien tiene reservadas en su
-- checkout. Si algún día eso cambia, esta comprobación hay que revisarla.
-- ============================================================

create table if not exists public.desempaquetados (
  id uuid primary key default gen_random_uuid(),
  -- SET NULL y no CASCADE: si se borra el producto, el apunte sigue explicando
  -- por qué el stock se movió. Los nombres van en snapshot por lo mismo, igual
  -- que `pedido_items.nombre_producto`.
  origen_id uuid references public.productos(id) on delete set null,
  destino_id uuid references public.productos(id) on delete set null,
  origen_nombre varchar(200) not null,
  destino_nombre varchar(200) not null,
  bultos int not null check (bultos > 0),
  unidades_por_bulto int not null check (unidades_por_bulto > 0),
  unidades_generadas int not null check (unidades_generadas > 0),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_email text,
  created_at timestamptz not null default now()
);

comment on table public.desempaquetados is
  'Cada vez que se abre un bulto para vender sus unidades. Sin esto, el stock de la caja baja y el de la unidad sube sin que nadie pueda explicar por qué.';

create index if not exists desempaquetados_created_at_idx
  on public.desempaquetados (created_at desc);

-- RLS sin policies: solo service_role, como el resto de tablas de operación.
alter table public.desempaquetados enable row level security;

-- ── La operación, atómica ───────────────────────────────────────────────────
create or replace function public.desempaquetar_producto(
  p_origen_id uuid,
  p_destino_id uuid,
  p_bultos int,
  p_unidades_por_bulto int,
  p_actor uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_origen   productos;
  v_destino  productos;
  v_unidades int;
  v_email    text;
begin
  if p_origen_id is null or p_destino_id is null then
    raise exception 'Hay que indicar el producto de origen y el de destino';
  end if;
  if p_origen_id = p_destino_id then
    raise exception 'El origen y el destino no pueden ser el mismo producto';
  end if;
  if p_bultos is null or p_bultos <= 0 then
    raise exception 'Hay que desempaquetar al menos un bulto';
  end if;
  if p_unidades_por_bulto is null or p_unidades_por_bulto <= 0 then
    raise exception 'Las unidades por bulto tienen que ser mayor que cero';
  end if;

  v_unidades := p_bultos * p_unidades_por_bulto;

  -- Las dos filas se bloquean en orden determinista (por id): dos
  -- desempaquetados cruzados que las tomaran en orden distinto se bloquearían
  -- entre sí.
  if p_origen_id < p_destino_id then
    select * into v_origen  from productos where id = p_origen_id  for update;
    select * into v_destino from productos where id = p_destino_id for update;
  else
    select * into v_destino from productos where id = p_destino_id for update;
    select * into v_origen  from productos where id = p_origen_id  for update;
  end if;

  if v_origen.id is null then
    raise exception 'El producto que se desempaqueta no existe';
  end if;
  if v_destino.id is null then
    raise exception 'El producto de destino no existe';
  end if;

  -- Ver la nota de la cabecera: `stock_disponible` ya excluye lo reservado.
  if v_origen.stock_disponible < p_bultos then
    raise exception 'Solo hay % de «%» sin reservar, y se piden %',
      v_origen.stock_disponible, v_origen.nombre, p_bultos;
  end if;

  update productos
  set stock_disponible = stock_disponible - p_bultos, updated_at = now()
  where id = p_origen_id;

  update productos
  set stock_disponible = stock_disponible + v_unidades, updated_at = now()
  where id = p_destino_id;

  select email into v_email from auth.users where id = p_actor;

  insert into desempaquetados (
    origen_id, destino_id, origen_nombre, destino_nombre,
    bultos, unidades_por_bulto, unidades_generadas, actor_user_id, actor_email
  ) values (
    p_origen_id, p_destino_id, v_origen.nombre, v_destino.nombre,
    p_bultos, p_unidades_por_bulto, v_unidades, p_actor, v_email
  );

  return jsonb_build_object(
    'origen_nombre',      v_origen.nombre,
    'destino_nombre',     v_destino.nombre,
    'bultos',             p_bultos,
    'unidades_generadas', v_unidades,
    'origen_stock',       v_origen.stock_disponible - p_bultos,
    'destino_stock',      v_destino.stock_disponible + v_unidades
  );
end;
$$;

-- Solo la API (service_role). Nadie con la clave pública puede mover inventario.
revoke all on function public.desempaquetar_producto(uuid, uuid, int, int, uuid)
  from anon, authenticated;
