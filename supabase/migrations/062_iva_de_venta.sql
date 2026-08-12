-- 062: el IVA de venta — Capa 0 y 1 del módulo de contabilidad.
--
-- EL PROBLEMA: hoy el IVA repercutido de un pedido NO es calculable. No es que
-- sea difícil, es que no está el dato. `productos.precio` es un número sin tipo
-- asociado, `pedido_items` guarda `precio_unitario` y nada más, y el catálogo
-- mezcla los tres tipos (queso al 4, galletas al 10, refrescos al 21). Sin esto
-- no se puede presentar el modelo 303, porque la mitad de la resta —el IVA
-- repercutido— no existe. La otra mitad, el soportado, sí: la puso la 029.
--
-- Y tiene prisa por un motivo concreto: cada venta que entre sin el dato es una
-- venta cuyo IVA hay que reconstruir a mano. Hoy hay 3 pedidos de prueba.
--
-- ⚠️⚠️ AQUÍ NO SE TOCAN `confirmar_venta` NI `crear_pedido_transferencia`, Y ES
-- DELIBERADO. Son la ruta por la que pasa el dinero y ya se han reescrito
-- cuatro veces (033 → 040 → 045 → 053); cada reescritura ha costado un susto.
-- Se comprobó contra las definiciones VIVAS en el remoto que las dos insertan
-- el pedido con su total primero y las líneas después, con la misma forma, así
-- que todo lo de aquí entra por TRIGGERS y su diff es cero.
--
-- El trigger no es solo comodidad: garantiza lo que una llamada explícita no
-- puede, que ningún camino futuro cree un pedido sin su desglose. Es el mismo
-- razonamiento de la 039 con el historial de estados.

-- ── 1. El tipo de IVA del producto ─────────────────────────────────────────
--
-- Mismo dominio que las compras (029) a propósito: el tipo va con la MERCANCÍA,
-- no con la operación, así que un producto que se compra al 10 se vende al 10.
-- Tener dos listas distintas es pedir que se separen.
--
-- El 0 (exento) NO entra. Una operación exenta no es «IVA al cero»: va a otra
-- casilla del 303 y necesita más que un tipo distinto. El día que haga falta,
-- se habla; meterlo hoy sería fingir que está resuelto.
alter table public.productos
  add column if not exists iva_pct numeric(4,2)
  check (iva_pct in (4, 10, 21));

comment on column public.productos.iva_pct is
  'Tipo de IVA con el que se vende (4, 10 o 21). Se copia a pedido_items al vender: '
  'ver la 062. Cambiarlo aquí NO reescribe pedidos ya hechos, y así debe ser.';

-- ── 2. Relleno: de lo que ya se sabe, no a mano ────────────────────────────

-- ⚠️ Antes de nada, el guardia: si un producto se compró con DOS tipos
-- distintos, elegir uno sería adivinar cuál era el bueno. Se aborta, como hace
-- la 058 con los roles duplicados.
do $guardia$
declare
  v_conflictivos text;
begin
  select string_agg(p.nombre, ', ')
  into v_conflictivos
  from productos p
  where p.id in (
    select fci.producto_id
    from factura_compra_items fci
    where fci.iva_pct is not null
    group by fci.producto_id
    having count(distinct fci.iva_pct) > 1
  );

  if v_conflictivos is not null then
    raise exception
      'Estos productos se han comprado con dos tipos de IVA distintos: %. '
      'Elegir uno sería adivinar: revísalos a mano antes de aplicar esta migración',
      v_conflictivos;
  end if;
end
$guardia$;

-- a) De sus propias líneas de compra. Es lo que el proveedor cobró, que es la
--    fuente más fiable que hay: él lo declaró así.
update public.productos p
set iva_pct = f.iva
from (
  select fci.producto_id, min(fci.iva_pct) as iva
  from factura_compra_items fci
  where fci.iva_pct is not null
  group by fci.producto_id
) f
where f.producto_id = p.id
  and p.iva_pct is null;

-- b) De su familia, para lo que nunca se ha comprado con ese id.
--
--    Los sabores de un mismo producto llevan el mismo tipo, y la CAJA y la
--    UNIDAD son la misma mercancía física — es literalmente lo que dice el
--    modelo de desempaquetar de la 056.
--
--    La columna `familia` la puso la 057 para el selector de sabores de la
--    tienda. Resulta que es justo lo que cierra este relleno: sin ella, tres
--    productos (Galleta Festival Fresa y Vainilla, y Quipitos Pops Caja 24)
--    se quedaban sin fuente y habría que haberlos puesto a dedo.
update public.productos p
set iva_pct = f.iva
from (
  select p2.familia, min(p2.iva_pct) as iva
  from productos p2
  where p2.familia is not null
    and p2.iva_pct is not null
  group by p2.familia
  having count(distinct p2.iva_pct) = 1
) f
where p.familia = f.familia
  and p.iva_pct is null;

-- ⚠️ Y aquí se cierra. Un producto sin tipo de IVA es un producto que no se
-- puede vender legalmente, así que la columna se pone NOT NULL y **sin valor
-- por defecto**: un defecto sería inventarse un número que va a Hacienda, y lo
-- peor de un número inventado es que parece puesto.
--
-- Se avisa con nombres antes de que salte el `set not null` genérico, porque
-- «column contains null values» no dice cuál.
do $sin_tipo$
declare
  v_faltan text;
begin
  select string_agg(nombre, ', ') into v_faltan
  from productos where iva_pct is null;

  if v_faltan is not null then
    raise exception
      'Estos productos se quedan sin tipo de IVA y no se puede deducir de sus compras '
      'ni de su familia: %. Asígnaselo a mano antes de aplicar esta migración',
      v_faltan;
  end if;
end
$sin_tipo$;

alter table public.productos alter column iva_pct set not null;

-- ── 3. El tipo, congelado en la línea del pedido ───────────────────────────
--
-- Snapshot, exactamente igual que `nombre_producto`. Y no es purismo: si
-- Hacienda cambia un tipo —pasó con el aceite, con las mascarillas y con la
-- luz—, un join a `productos` reescribiría facturas YA EMITIDAS. Una factura
-- que cambia sola es lo contrario de una factura.
alter table public.pedido_items
  add column if not exists iva_pct numeric(4,2)
  check (iva_pct in (4, 10, 21));

comment on column public.pedido_items.iva_pct is
  'El tipo que se aplicó AL VENDER. Snapshot: nunca se recalcula desde productos.';

-- Lo rellena un trigger, no las RPC de venta. Así `confirmar_venta` y
-- `crear_pedido_transferencia` se quedan como están, y cualquier camino nuevo
-- que inserte líneas hereda el tipo sin acordarse de nada.
create or replace function public.pedido_item_hereda_iva()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  -- Un valor explícito gana: el día que se facture una línea suelta con su
  -- tipo, esto no estorba.
  if new.iva_pct is null then
    select p.iva_pct into new.iva_pct from productos p where p.id = new.producto_id;
  end if;

  if new.iva_pct is null then
    raise exception 'El producto % no tiene tipo de IVA: no se puede vender', new.producto_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_pedido_item_hereda_iva on public.pedido_items;
create trigger trg_pedido_item_hereda_iva
  before insert on public.pedido_items
  for each row execute function public.pedido_item_hereda_iva();

-- Las líneas que ya existen: su producto no ha cambiado de tipo desde que se
-- vendieron (son de esta misma semana), así que copiarlo es correcto.
update public.pedido_items pi
set iva_pct = p.iva_pct
from public.productos p
where p.id = pi.producto_id
  and pi.iva_pct is null;

alter table public.pedido_items alter column iva_pct set not null;

-- ── 4. El desglose por tipo, que es lo que se declara ──────────────────────
--
-- Por TIPO y no por línea: el 303 pide base y cuota agrupadas por tipo, y —lo
-- importante— agrupar primero es lo que decide el redondeo. Ver la función.
create table if not exists public.pedido_iva (
  pedido_id uuid          not null references public.pedidos(id) on delete cascade,
  iva_pct   numeric(4,2)  not null check (iva_pct in (4, 10, 21)),
  base      numeric(10,2) not null check (base >= 0),
  cuota     numeric(10,2) not null check (cuota >= 0),
  total     numeric(10,2) generated always as (base + cuota) stored,
  primary key (pedido_id, iva_pct)
);

comment on table public.pedido_iva is
  'Base imponible y cuota por tipo de IVA de cada pedido. Es el desglose que se '
  'declara en el 303 y el que heredará la factura. Lo mantiene un trigger.';

-- RLS activa y CERO policies: aquí solo entra la API con service_role, igual
-- que en pedido_eventos y reembolso_lineas.
alter table public.pedido_iva enable row level security;

create index if not exists idx_pedido_iva_pedido on public.pedido_iva (pedido_id);

create or replace function public.recalcular_iva_pedido(p_pedido_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_total_pedido numeric(10,2);
  v_suma         numeric(10,2);
begin
  -- Recálculo completo, nunca incremental: el trigger puede dispararse más de
  -- una vez si las líneas entran en varias sentencias, y sumar dos veces el
  -- mismo grupo daría un desglose inflado que cuadra consigo mismo.
  delete from pedido_iva where pedido_id = p_pedido_id;

  -- ⚠️⚠️ LA REGLA DE REDONDEO, Y VIVE SOLO AQUÍ. Que esté en un único sitio es
  -- medio propósito de esta función.
  --
  -- Los precios son PVP CON IVA incluido (es lo que ve y paga el cliente), así
  -- que la base se deriva dividiendo. Y el orden importa: se agrupa por tipo,
  -- se suma el importe con IVA del grupo y se deriva la base UNA sola vez.
  --
  -- Línea a línea y sumando después sale otra base. 7 uds a 0,95 € al 21 %:
  --   por líneas  → base 5,53 + cuota 1,12 = 6,65
  --   agregando   → base 5,50 + cuota 1,15 = 6,65
  -- El total cuadra en los dos y la base difiere en 3 céntimos. La que se
  -- declara es la segunda.
  --
  -- Y la cuota se saca RESTANDO, no multiplicando la base por el tipo: así
  -- base + cuota es EXACTAMENTE el importe cobrado, sin céntimos sueltos.
  insert into pedido_iva (pedido_id, iva_pct, base, cuota)
  select
    p_pedido_id,
    g.iva_pct,
    round(g.con_iva / (1 + g.iva_pct / 100), 2),
    g.con_iva - round(g.con_iva / (1 + g.iva_pct / 100), 2)
  from (
    select pi.iva_pct, sum(pi.precio_unitario * pi.cantidad) as con_iva
    from pedido_items pi
    where pi.pedido_id = p_pedido_id
    group by pi.iva_pct
  ) g;

  -- El desglose tiene que sumar EXACTAMENTE lo cobrado. Si algún día cambia
  -- cómo se calcula el total del pedido —unos gastos de envío, un descuento—,
  -- esto salta aquí, en el momento de la venta, y no en el modelo 303 tres
  -- meses después con el trimestre ya cerrado.
  select total into v_total_pedido from pedidos where id = p_pedido_id;
  select coalesce(sum(base + cuota), 0) into v_suma
  from pedido_iva where pedido_id = p_pedido_id;

  if v_total_pedido is not null and v_suma <> v_total_pedido then
    raise exception
      'El desglose de IVA suma % y el pedido cobró %. No se declara un desglose que no cuadra',
      v_suma, v_total_pedido;
  end if;
end;
$$;

create or replace function public.trg_pedido_items_desglosa_iva()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  r record;
begin
  for r in select distinct pedido_id from nuevas loop
    perform recalcular_iva_pedido(r.pedido_id);
  end loop;
  return null;
end;
$$;

-- A nivel de SENTENCIA, no de fila: el desglose se calcula sobre el pedido
-- entero, así que hacerlo por fila lo recalcularía N veces y —peor— la primera
-- vez con el pedido a medias, que es cuando no cuadra con el total.
drop trigger if exists trg_pedido_items_desglosa_iva on public.pedido_items;
create trigger trg_pedido_items_desglosa_iva
  after insert on public.pedido_items
  referencing new table as nuevas
  for each statement execute function public.trg_pedido_items_desglosa_iva();

-- Los pedidos que ya existen.
do $historico$
declare
  r record;
begin
  for r in select distinct pedido_id from pedido_items loop
    perform recalcular_iva_pedido(r.pedido_id);
  end loop;
end
$historico$;

-- ── 5. Fuera del alcance de la clave pública ───────────────────────────────
--
-- ⚠️⚠️ HAY QUE REVOCAR A LOS TRES, Y ESTO CORRIGE LO QUE DECÍA ESTADO.md.
--
-- Una función del esquema `public` nace con DOS fuentes de permiso, no una:
--
--   1. La herencia de PUBLIC, que es de Postgres (toda función nace con
--      `EXECUTE` para PUBLIC). Es lo que descubrió la 060.
--   2. Un grant PROPIO a `anon` y `authenticated`, que lo pone Supabase con
--      `alter default privileges` — se ve en pg_default_acl:
--        anon=X/postgres | authenticated=X/postgres | service_role=X/postgres
--
-- Quitar solo una de las dos no cierra nada, y encima el REVOKE no protesta.
-- Se probó: revocando únicamente a PUBLIC, `has_function_privilege('anon', …)`
-- seguía diciendo `true` en las tres funciones de esta migración.
--
-- Así que la 059 (revocar a anon/authenticated) NO fue inútil como quedó
-- escrito: quitó la fuente 2. Y la 060 quitó la fuente 1. Hicieron falta las
-- dos, y se comprueba mirando el ACL de una de aquellas:
--   desempaquetar_producto -> postgres=X/postgres | service_role=X/postgres
--   (sin "=X" suelto = sin PUBLIC, y sin anon ni authenticated)
--
-- LA REGLA BUENA para la próxima RPC que no llame el navegador: revocar a
-- `public, anon, authenticated` y **comprobarlo** con has_function_privilege,
-- sin dar por hecho que el REVOKE hizo algo.
revoke execute on function public.recalcular_iva_pedido(uuid) from public, anon, authenticated;
revoke execute on function public.pedido_item_hereda_iva() from public, anon, authenticated;
revoke execute on function public.trg_pedido_items_desglosa_iva() from public, anon, authenticated;

do $comprobar$
declare
  v_abiertas text;
begin
  select string_agg(f.nombre, ', ')
  into v_abiertas
  from (values
    ('public.recalcular_iva_pedido(uuid)'),
    ('public.pedido_item_hereda_iva()'),
    ('public.trg_pedido_items_desglosa_iva()')
  ) as f(nombre)
  where has_function_privilege('anon', f.nombre, 'EXECUTE')
     or has_function_privilege('authenticated', f.nombre, 'EXECUTE');

  if v_abiertas is not null then
    raise exception 'Estas funciones siguen siendo ejecutables desde internet: %', v_abiertas;
  end if;
end
$comprobar$;
