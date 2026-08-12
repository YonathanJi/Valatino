-- 063: los ajustes de stock dejan apunte, y el stock pasa a ser reconstruible.
--
-- EL PROBLEMA, medido y no supuesto. Se comprobó contra el remoto si el stock
-- se puede deducir de lo que sobreviviría a una limpieza:
--
--   stock = compras − ventas + reposiciones de reembolso
--            ± desempaquetados
--
-- **19 de 20 productos cuadraban exactamente.** El único que no era «Quipitos
-- Pops Caja 24»: 1 unidad en stock y 0 compradas. Esa unidad entró por un
-- `ajustar_stock` a mano y NO HAY RASTRO DE ELLA EN NINGUNA PARTE.
--
-- Ese es el único agujero, y por eso esta migración solo tapa ese. Las demás
-- entradas y salidas ya tienen su fuente de verdad (`factura_compra_items`,
-- `pedido_items`, `reembolso_lineas`, `desempaquetados`) y duplicarlas en un
-- libro sería crear un segundo sitio que puede divergir del primero — y además
-- obligaría a tocar `confirmar_venta`, que es la ruta por la que pasa el dinero.
--
-- Con esto el stock queda 100 % reconstruible, que es lo que hace falta para
-- poder limpiar la base de pruebas y dejarla cuadrada (ver la 064).

-- ── 1. El libro ────────────────────────────────────────────────────────────
create table if not exists public.ajustes_stock (
  id               uuid primary key default gen_random_uuid(),
  producto_id      uuid not null references public.productos(id) on delete restrict,
  -- Snapshot del nombre, como en `pedido_items`: el apunte tiene que seguir
  -- siendo legible aunque el producto se renombre.
  nombre_producto  text not null,
  -- Con signo: positivo entra, negativo sale. Cero no es un ajuste.
  cantidad         integer not null check (cantidad <> 0),
  stock_resultante integer not null check (stock_resultante >= 0),
  motivo           text not null default 'sin_indicar'
    check (motivo in (
      'rotura', 'merma', 'caducidad', 'recuento',
      'devolucion_proveedor', 'correccion', 'sin_indicar'
    )),
  nota             text,
  actor_id         uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now()
);

comment on table public.ajustes_stock is
  'Apunte de cada ajuste manual de inventario: qué, cuánto, quién y por qué. '
  'Es la única entrada/salida de stock que no tiene otra fuente de verdad, y sin '
  'este libro el stock no se puede reconstruir.';

comment on column public.ajustes_stock.motivo is
  '`sin_indicar` existe para los ajustes hechos antes de que el panel preguntase '
  'el motivo. No se usa para ajustes nuevos.';

-- RLS activa y CERO policies: solo la API con service_role, igual que
-- pedido_eventos, reembolso_lineas y pedido_iva.
alter table public.ajustes_stock enable row level security;

create index if not exists idx_ajustes_stock_producto
  on public.ajustes_stock (producto_id, created_at desc);

-- ── 2. `ajustar_stock` deja apunte ─────────────────────────────────────────
--
-- ⚠️ SE BORRA LA VIEJA ANTES DE CREAR LA NUEVA, y no es opcional. Con
-- `create or replace` quedarían las DOS vivas (distinta identidad de
-- argumentos) y una llamada de dos argumentos sería **ambigua** — es
-- exactamente la trampa que documenta la 039.
--
-- El `drop` no abre ventana de despliegue: Supabase llama la RPC con argumentos
-- CON NOMBRE, así que la API ya desplegada —que manda solo `p_producto_id` y
-- `p_cantidad`— entra igual por los `default` de los dos nuevos.
drop function if exists public.ajustar_stock(uuid, integer);

create or replace function public.ajustar_stock(
  p_producto_id uuid,
  p_cantidad    integer,
  p_motivo      text default 'sin_indicar',
  p_nota        text default null,
  p_actor_id    uuid default null
)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_stock_actual integer;
  v_nuevo_stock  integer;
  v_nombre       text;
begin
  if p_cantidad is null or p_cantidad = 0 then
    raise exception 'La cantidad de ajuste no puede ser cero';
  end if;

  select stock_disponible, nombre into v_stock_actual, v_nombre
  from productos where id = p_producto_id
  for update;

  if not found then
    raise exception 'Producto % no encontrado', p_producto_id;
  end if;

  if v_stock_actual + p_cantidad < 0 then
    raise exception 'El ajuste dejaría el stock en negativo (actual: %, ajuste: %)',
      v_stock_actual, p_cantidad;
  end if;

  update productos
  set stock_disponible = stock_disponible + p_cantidad,
      updated_at       = now()
  where id = p_producto_id
  returning stock_disponible into v_nuevo_stock;

  -- El apunte va en la MISMA transacción que el movimiento, no después: un
  -- libro que se escribe aparte se queda a medias en cuanto algo falle, y un
  -- libro con huecos es peor que no tenerlo porque parece completo.
  insert into ajustes_stock (
    producto_id, nombre_producto, cantidad, stock_resultante, motivo, nota, actor_id
  ) values (
    p_producto_id, v_nombre, p_cantidad, v_nuevo_stock,
    coalesce(nullif(p_motivo, ''), 'sin_indicar'), nullif(p_nota, ''), p_actor_id
  );

  return v_nuevo_stock;
end;
$$;

-- ── 3. Comprobar el descuadre deja de ser un trabajo a mano ────────────────
--
-- Devuelve una fila por producto cuyo stock NO coincida con lo que dicen sus
-- movimientos. Vacío = inventario cuadrado.
--
-- Hasta hoy esto se hacía a ojo tras cada limpieza («stock 164 = la factura,
-- descuadre 0», sesión del 2026-08-06). Un descuadre no da error por sí solo:
-- hay que ir a buscarlo, y por eso conviene que sea una consulta.
create or replace function public.comprobar_stock()
returns table (
  producto_id uuid,
  nombre      text,
  stock_hoy   integer,
  deducido    integer,
  descuadre   integer
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  with comprado as (
    select fci.producto_id, sum(fci.cantidad)::int uds
    from factura_compra_items fci group by 1
  ),
  vendido as (
    select pi.producto_id, sum(pi.cantidad)::int uds
    from pedido_items pi join pedidos p on p.id = pi.pedido_id
    -- Un pedido sin pagar o cancelado no consume stock: lo retiene en
    -- `stock_reservado`, que es otro cubo.
    where p.estado not in ('PENDIENTE_PAGO', 'CANCELADO')
    group by 1
  ),
  repuesto as (
    select pi.producto_id, sum(rl.cantidad)::int uds
    from reembolso_lineas rl join pedido_items pi on pi.id = rl.pedido_item_id
    where rl.repuesto_al_stock group by 1
  ),
  abierto as (
    select d.origen_id producto_id, sum(d.bultos)::int uds
    from desempaquetados d group by 1
  ),
  generado as (
    select d.destino_id producto_id, sum(d.bultos * d.unidades_por_bulto)::int uds
    from desempaquetados d group by 1
  ),
  ajustado as (
    select a.producto_id, sum(a.cantidad)::int uds
    from ajustes_stock a group by 1
  )
  select pr.id, pr.nombre, pr.stock_disponible,
         (coalesce(c.uds,0) - coalesce(v.uds,0) + coalesce(r.uds,0)
          - coalesce(ab.uds,0) + coalesce(g.uds,0) + coalesce(aj.uds,0))::int,
         (pr.stock_disponible
          - (coalesce(c.uds,0) - coalesce(v.uds,0) + coalesce(r.uds,0)
             - coalesce(ab.uds,0) + coalesce(g.uds,0) + coalesce(aj.uds,0)))::int
  from productos pr
  left join comprado c on c.producto_id = pr.id
  left join vendido  v on v.producto_id = pr.id
  left join repuesto r on r.producto_id = pr.id
  left join abierto ab on ab.producto_id = pr.id
  left join generado g on g.producto_id = pr.id
  left join ajustado aj on aj.producto_id = pr.id
  where pr.stock_disponible <>
        (coalesce(c.uds,0) - coalesce(v.uds,0) + coalesce(r.uds,0)
         - coalesce(ab.uds,0) + coalesce(g.uds,0) + coalesce(aj.uds,0))
  order by pr.nombre;
$$;

-- ── 4. Fuera del alcance de la clave pública ───────────────────────────────
--
-- A los TRES destinos: `PUBLIC` (herencia de Postgres) y `anon`/`authenticated`
-- (grant propio que pone Supabase con `alter default privileges`). Quitar solo
-- uno no cierra nada y el REVOKE no protesta — ver la corrección en ESTADO.md.
revoke execute on function
  public.ajustar_stock(uuid, integer, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.comprobar_stock() from public, anon, authenticated;

do $comprobar$
declare v_abiertas text;
begin
  select string_agg(f.nombre, ', ') into v_abiertas
  from (values
    ('public.ajustar_stock(uuid, integer, text, text, uuid)'),
    ('public.comprobar_stock()')
  ) as f(nombre)
  where has_function_privilege('anon', f.nombre, 'EXECUTE')
     or has_function_privilege('authenticated', f.nombre, 'EXECUTE');

  if v_abiertas is not null then
    raise exception 'Estas funciones siguen siendo ejecutables desde internet: %', v_abiertas;
  end if;
end
$comprobar$;
