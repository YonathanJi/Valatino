-- 064: el arranque fiscal, y la limpieza de pruebas como función.
--
-- EL PROBLEMA: hoy se prueba creando ventas, borrándolas a mano con SQL y
-- volviendo a empezar. Funciona, pero:
--
--   1. El procedimiento vive en un texto (sesión del 2026-08-06) y se ejecuta a
--      pelo. Cada tabla nueva hay que acordarse de añadirla a la lista — y
--      desde la 062 hay una más (`pedido_iva`), que es justo el tipo de cosa
--      que se olvida.
--   2. Deja el stock descuadrado si no se repone a mano.
--   3. ⚠️⚠️ Y lo importante: **ese hábito se vuelve ilegal en cuanto se emita
--      la primera factura.** Una serie de facturación tiene que ser correlativa
--      y sin huecos; borrarla para empezar de nuevo es destruir registros
--      contables. Hace falta un antes y un después, explícito.
--
-- Por eso esto NO es solo una limpieza: es un interruptor de un solo sentido.

-- ── 1. El interruptor ──────────────────────────────────────────────────────
alter table public.ajustes_tienda
  add column if not exists arranque_fiscal_el  timestamptz,
  add column if not exists arranque_fiscal_por uuid references auth.users(id) on delete set null;

comment on column public.ajustes_tienda.arranque_fiscal_el is
  'NULL = la tienda está en pruebas y sus datos se pueden borrar. Con fecha = '
  'las ventas cuentan de verdad y la limpieza se niega a ejecutarse, para siempre. '
  'El momento natural para pulsarlo es al pasar Stripe a `live`.';

-- ── 2. Arrancar de verdad ──────────────────────────────────────────────────
--
-- Se separa de `guardarAjustes` a propósito: es una decisión de otra naturaleza
-- que cambiar un IBAN, y meterla en el mismo formulario invita a pulsarla sin
-- querer. Aquí es una llamada aparte, con su confirmación en el panel.
create or replace function public.marcar_arranque_fiscal(p_actor_id uuid default null)
returns timestamptz
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_ya timestamptz;
  v_ahora timestamptz;
begin
  select arranque_fiscal_el into v_ya from ajustes_tienda where id;

  -- Idempotente, y sin sobrescribir la fecha: la primera es la que vale, y
  -- volver a pulsar no debe mover el momento en que las ventas empezaron a
  -- contar.
  if v_ya is not null then
    return v_ya;
  end if;

  v_ahora := now();
  update ajustes_tienda
  set arranque_fiscal_el = v_ahora,
      arranque_fiscal_por = p_actor_id,
      actualizado_por = coalesce(p_actor_id, actualizado_por)
  where id;

  return v_ahora;
end;
$$;

-- ── 3. La limpieza ─────────────────────────────────────────────────────────
--
-- Borra lo TRANSACCIONAL y deja el negocio en pie. Qué se va y qué se queda no
-- es una lista arbitraria:
--
--   SE VA   todo lo que nace de un cliente comprando (pedidos y su rastro,
--           carritos, reservas, direcciones de envío).
--   SE QUEDA todo lo que existía antes de vender: el catálogo con su stock, las
--           FACTURAS DE COMPRA —que son documentos contables reales, con
--           mercancía y dinero de verdad, y no se borran nunca—, los
--           proveedores, los cargos con sus plantillas, los empleados, los
--           desempaquetados y el libro de ajustes de stock (las dos últimas son
--           realidad física del almacén, igual que una compra).
--
-- ⚠️ NO toca cuentas de usuario. Borrar una cuenta es irreversible de otra
-- manera y además vive en `auth`, así que se limita a CONTARLAS en el resumen
-- para que quien limpia decida.
create or replace function public.limpiar_datos_de_prueba(p_actor_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_arranque   timestamptz;
  v_borrados   jsonb;
  v_pedidos    int;
  v_stock      jsonb;
  v_clientes   int;
  v_descuadres int;
begin
  select arranque_fiscal_el into v_arranque from ajustes_tienda where id;

  -- ⚠️⚠️ EL GUARDIA. No es una advertencia: es la frontera del módulo.
  if v_arranque is not null then
    raise exception
      'La tienda arrancó de verdad el % y sus datos ya no son de prueba. '
      'Borrar ventas reales destruye registros contables, así que esta función '
      'no vuelve a ejecutarse.', v_arranque;
  end if;

  select count(*) into v_pedidos from pedidos;

  -- Los pedidos arrastran en cascada sus líneas, eventos, calificaciones,
  -- desglose de IVA, transacciones y reembolsos. Se borran igualmente a mano
  -- las tablas que no cuelgan de `pedidos`.
  delete from stock_reservas;
  delete from carrito_items;
  delete from carritos;
  delete from checkout_datos;
  delete from pedidos;
  delete from direcciones_envio;

  -- Lo que queda vivo después del borrado, para poder afirmarlo y no suponerlo.
  select jsonb_object_agg(t, n) into v_borrados from (
    select 'pedidos' t, count(*) n from pedidos
    union all select 'pedido_items', count(*) from pedido_items
    union all select 'pedido_iva', count(*) from pedido_iva
    union all select 'pedido_eventos', count(*) from pedido_eventos
    union all select 'pedido_calificaciones', count(*) from pedido_calificaciones
    union all select 'transacciones_pago', count(*) from transacciones_pago
    union all select 'reembolso_lineas', count(*) from reembolso_lineas
    union all select 'carritos', count(*) from carritos
    union all select 'stock_reservas', count(*) from stock_reservas
    union all select 'direcciones_envio', count(*) from direcciones_envio
  ) x;

  -- El stock vuelve a lo que dicen los movimientos que SÍ sobreviven: compras,
  -- desempaquetados y ajustes. Sin esto el inventario queda descontado por unas
  -- ventas que ya no existen, y el descuadre no se nota hasta que falta
  -- mercancía para servir un pedido de verdad.
  with comprado as (
    select fci.producto_id, sum(fci.cantidad)::int uds from factura_compra_items fci group by 1
  ),
  abierto as (
    select d.origen_id producto_id, sum(d.bultos)::int uds from desempaquetados d group by 1
  ),
  generado as (
    select d.destino_id producto_id, sum(d.bultos * d.unidades_por_bulto)::int uds
    from desempaquetados d group by 1
  ),
  ajustado as (
    select a.producto_id, sum(a.cantidad)::int uds from ajustes_stock a group by 1
  ),
  objetivo as (
    select pr.id,
           greatest(0, coalesce(c.uds,0) - coalesce(ab.uds,0)
                       + coalesce(g.uds,0) + coalesce(aj.uds,0)) as stock
    from productos pr
    left join comprado c on c.producto_id = pr.id
    left join abierto ab on ab.producto_id = pr.id
    left join generado g on g.producto_id = pr.id
    left join ajustado aj on aj.producto_id = pr.id
  ),
  movidos as (
    update productos pr
    set stock_disponible = o.stock,
        stock_reservado  = 0,
        updated_at       = now()
    from objetivo o
    where o.id = pr.id
      and (pr.stock_disponible <> o.stock or pr.stock_reservado <> 0)
    returning pr.nombre, o.stock
  )
  select coalesce(jsonb_object_agg(nombre, stock), '{}'::jsonb) into v_stock from movidos;

  -- Cuentas que NO se han tocado: las de cliente son las que no tienen rol de
  -- staff. Se informa para que se decida a mano.
  select count(*) into v_clientes
  from auth.users u
  where not exists (
    select 1 from user_roles ur join roles r on r.id = ur.role_id
    where ur.user_id = u.id and r.nombre <> 'cliente'
  );

  select count(*) into v_descuadres from comprobar_stock();

  return jsonb_build_object(
    'pedidos_borrados', v_pedidos,
    'quedan', v_borrados,
    'stock_recalculado', v_stock,
    'descuadres_tras_limpiar', v_descuadres,
    'cuentas_de_cliente_sin_tocar', v_clientes,
    'actor', p_actor_id,
    'cuando', now()
  );
end;
$$;

comment on function public.limpiar_datos_de_prueba(uuid) is
  'Deja la tienda como recién montada, conservando catálogo, compras y '
  'configuración. Se niega a ejecutarse tras el arranque fiscal.';

-- ── 4. Fuera del alcance de la clave pública ───────────────────────────────
--
-- Aquí importa más que en ninguna otra: una de estas dos BORRA TODAS LAS
-- VENTAS. A los tres destinos, y comprobado.
revoke execute on function public.limpiar_datos_de_prueba(uuid) from public, anon, authenticated;
revoke execute on function public.marcar_arranque_fiscal(uuid) from public, anon, authenticated;

do $comprobar$
declare v_abiertas text;
begin
  select string_agg(f.nombre, ', ') into v_abiertas
  from (values
    ('public.limpiar_datos_de_prueba(uuid)'),
    ('public.marcar_arranque_fiscal(uuid)')
  ) as f(nombre)
  where has_function_privilege('anon', f.nombre, 'EXECUTE')
     or has_function_privilege('authenticated', f.nombre, 'EXECUTE');

  if v_abiertas is not null then
    raise exception 'PELIGRO: estas funciones son ejecutables desde internet: %', v_abiertas;
  end if;
end
$comprobar$;
