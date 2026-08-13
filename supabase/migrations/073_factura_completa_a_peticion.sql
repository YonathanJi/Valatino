-- ============================================================
-- 073 — La factura completa a petición (el canje), y la mina que dejó la 072
--
-- Lo que Jonathan pidió: «emitir la factura del pedido del cliente si lo
-- solicita». La simplificada ya se emite sola (072); esto es la completa con los
-- datos fiscales del cliente, que la SUSTITUYE.
--
-- ⚠️⚠️ Y ARREGLA UNA MINA QUE PUSO LA 072: `facturas_emitidas.pedido_id`
-- referencia `pedidos` con ON DELETE RESTRICT, así que `limpiar_datos_de_prueba`
-- —que borra todos los pedidos— HABRÍA FALLADO en cuanto existiera una factura.
-- Confirmado en el ensayo, con el error literal del RESTRICT. Hoy no falla
-- porque hay cero facturas. Se arregla antes de que haya una.
--
-- ⭐⭐ Y UN FALLO QUE SOLO APARECE AL CRUZAR LAS DOS PIEZAS, no dentro de
-- ninguna: si una venta se factura como COMPLETA sin haber tenido simplificada
-- —pasa con las ventas anteriores a que el emisor esté configurado—, entonces
-- `emitir_facturas_pendientes` la vería «sin simplificada» y le emitiría una.
-- Dos documentos completos de la misma venta, y el IVA contado dos veces en el
-- libro. El guardia se pone DENTRO del motor, no en cada llamador, para que
-- ninguna llamada futura pueda equivocarse.
-- ============================================================

-- ── §1 · Una sola definición de la forma de un NIF ────────────────────────────
-- La 071 la escribió como una expresión dentro de un CHECK. Ahora la necesita
-- también el receptor de la factura, y tener la misma expresión en dos sitios es
-- garantizar que algún día difieran.
create or replace function public.nif_forma_valida(p_nif text)
returns boolean
language sql
immutable
as $$
  -- DNI · NIE · CIF. Exige MAYÚSCULAS: la normalización es parte de la regla.
  -- El dígito de control se comprueba en la API, donde el mensaje puede explicar
  -- qué falla y donde se puede probar en TypeScript.
  select p_nif ~ '^([0-9]{8}[A-Z]|[XYZ][0-9]{7}[A-Z]|[A-HJNP-SUVW][0-9]{7}[0-9A-J])$';
$$;

alter table public.ajustes_tienda drop constraint if exists ajustes_emisor_nif_forma;
alter table public.ajustes_tienda add constraint ajustes_emisor_nif_forma check (
  emisor_nif is null or public.nif_forma_valida(emisor_nif)
);

-- ── §2 · De dónde sale una rectificativa, para no perder el hilo ─────────────
-- La rectificativa por devolución llega en su propia migración: necesita usar
-- EXACTAMENTE la misma aritmética que el bloque `rectificado` de la 068, o el
-- documento y el 303 dirían cosas distintas del mismo dinero. La columna se crea
-- aquí porque es donde se decide la idempotencia por reembolso.
alter table public.facturas_emitidas
  add column if not exists refund_id text;

comment on column public.facturas_emitidas.refund_id is
  'Reembolso que originó una rectificativa. NULL en los demás tipos. No entra en la huella: es procedencia, no contenido del documento.';

-- Una rectificativa por reembolso, no una por línea devuelta.
create unique index if not exists idx_factura_una_por_reembolso
  on public.facturas_emitidas (pedido_id, refund_id)
  where tipo = 'rectificativa' and refund_id is not null;

-- Solo las rectificativas llevan reembolso de origen.
alter table public.facturas_emitidas drop constraint if exists facturas_refund_coherente;
alter table public.facturas_emitidas add constraint facturas_refund_coherente check (
  refund_id is null or tipo = 'rectificativa'
);

-- ── §3 · El motor: un pedido no puede tener dos documentos completos ─────────
-- Solo cambia el bloque de idempotencia respecto a la 072. Se reescribe entera
-- porque `create or replace` lo exige, y la firma NO se toca (068).
create or replace function public.emitir_factura(
  p_pedido_id   uuid,
  p_tipo        public.factura_tipo,
  p_receptor    jsonb default null,
  p_lineas      jsonb default null,
  p_desglose    jsonb default null,
  p_rectifica_a uuid  default null,
  p_sustituye_a uuid  default null,
  p_actor_id    uuid  default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_pedido      pedidos;
  v_emisor      jsonb;
  v_lineas      jsonb;
  v_desglose    jsonb;
  v_base        numeric(12, 2);
  v_cuota       numeric(12, 2);
  v_total       numeric(12, 2);
  v_serie       text;
  v_ejercicio   integer;
  v_correlativo integer;
  v_expedicion  date;
  v_operacion   date;
  v_anterior    text;
  v_numero      text;
  v_huella      text;
  v_id          uuid;
  v_ya          uuid;
begin
  select * into v_pedido from pedidos where id = p_pedido_id;
  if not found then
    raise exception 'No existe el pedido %', p_pedido_id using errcode = 'P0001';
  end if;

  if v_pedido.devengado_el is null then
    raise exception
      'El pedido % no ha devengado (estado %): todavía no hay hecho económico que facturar.',
      v_pedido.numero_pedido, v_pedido.estado
      using errcode = 'P0001';
  end if;

  -- El cerrojo de la cadena, arriba y antes de la idempotencia (ver 072 §7).
  perform pg_advisory_xact_lock(10072023);

  -- ⚠️⚠️ IDEMPOTENCIA ASIMÉTRICA, y la asimetría es el arreglo:
  --
  --   · Pedir una SIMPLIFICADA cuando ya hay una completa devuelve la completa.
  --     La venta ya está facturada, y con más detalle. Emitir además una
  --     simplificada duplicaría el IVA en el libro.
  --
  --   · Pedir una COMPLETA cuando hay una simplificada SÍ sigue adelante: ese
  --     es el canje, el caso normal. Lo que se bloquea es una segunda completa.
  if p_tipo = 'simplificada' then
    select id into v_ya from facturas_emitidas
    where pedido_id = p_pedido_id and tipo in ('simplificada', 'completa')
    order by tipo desc  -- 'completa' va después en el enum: desc la pone primero
    limit 1;
    if v_ya is not null then return v_ya; end if;
  elsif p_tipo = 'completa' then
    select id into v_ya from facturas_emitidas
    where pedido_id = p_pedido_id and tipo = 'completa';
    if v_ya is not null then return v_ya; end if;
  end if;

  -- El emisor es el guardia, y NO lanza excepción: esto corre en la ruta del
  -- dinero (trigger diferido de la 072 §8) y una casilla sin rellenar en Ajustes
  -- no puede tumbar una venta. Lo canta el aviso del 303.
  v_emisor := emisor_fiscal();
  if v_emisor is null then
    insert into factura_eventos (evento, detalle, actor_id)
    values ('emision_sin_emisor',
            jsonb_build_object('pedido_id', p_pedido_id, 'tipo', p_tipo),
            p_actor_id);
    return null;
  end if;

  -- ⚠️ Los precios son PVP CON IVA INCLUIDO. El desglose separa base y cuota.
  v_lineas := coalesce(p_lineas, (
    select jsonb_agg(jsonb_build_object(
             'nombre',          pi.nombre_producto,
             'cantidad',        pi.cantidad,
             'precio_unitario', pi.precio_unitario,
             'iva_pct',         pi.iva_pct,
             'importe',         round(pi.cantidad * pi.precio_unitario, 2)
           ) order by pi.nombre_producto)
    from pedido_items pi where pi.pedido_id = p_pedido_id
  ));

  -- ⚠️⚠️ EL DESGLOSE SE COPIA, NO SE CALCULA: la 062 es el único sitio que
  -- redondea, y recalcular daría una factura que no cuadra con el 303.
  v_desglose := coalesce(p_desglose, (
    select jsonb_agg(jsonb_build_object(
             'iva_pct', pv.iva_pct, 'base', pv.base, 'cuota', pv.cuota
           ) order by pv.iva_pct)
    from pedido_iva pv where pv.pedido_id = p_pedido_id
  ));

  if v_desglose is null or jsonb_array_length(v_desglose) = 0
     or v_lineas is null or jsonb_array_length(v_lineas) = 0 then
    insert into factura_eventos (evento, detalle, actor_id)
    values ('emision_sin_desglose',
            jsonb_build_object('pedido_id', p_pedido_id, 'tipo', p_tipo),
            p_actor_id);
    return null;
  end if;

  select round(sum((t->>'base')::numeric), 2),
         round(sum((t->>'cuota')::numeric), 2)
    into v_base, v_cuota
  from jsonb_array_elements(v_desglose) t;

  v_total := v_base + v_cuota;

  if p_tipo <> 'rectificativa' and p_lineas is null
     and v_total <> v_pedido.total then
    raise exception
      'La factura del pedido % sumaría % y se cobraron %. No se emite un documento que no cuadra.',
      v_pedido.numero_pedido, v_total, v_pedido.total
      using errcode = 'P0001';
  end if;

  v_operacion  := dia_fiscal(v_pedido.devengado_el);
  v_expedicion := case
    when p_tipo = 'simplificada' then v_operacion
    else dia_fiscal(now())
  end;

  v_serie     := serie_de_tipo(p_tipo);
  v_ejercicio := extract(year from v_expedicion)::integer;

  insert into factura_contadores (serie, ejercicio, siguiente)
  values (v_serie, v_ejercicio, 1)
  on conflict (serie, ejercicio) do nothing;

  select siguiente into v_correlativo
  from factura_contadores
  where serie = v_serie and ejercicio = v_ejercicio
  for update;

  update factura_contadores set siguiente = siguiente + 1
  where serie = v_serie and ejercicio = v_ejercicio;

  select f.huella into v_anterior
  from facturas_emitidas f
  order by f.orden desc
  limit 1;

  v_numero := v_serie || v_ejercicio::text || '/' || lpad(v_correlativo::text, 5, '0');
  v_huella := factura_huella(
    v_emisor->>'nif', v_numero, v_expedicion, p_tipo, v_cuota, v_total, v_anterior
  );

  insert into facturas_emitidas (
    tipo, serie, ejercicio, correlativo, pedido_id,
    fecha_expedicion, fecha_operacion,
    emisor, receptor, lineas, desglose,
    base_total, cuota_total, total,
    sustituye_a, rectifica_a,
    huella, huella_anterior, emitida_por
  ) values (
    p_tipo, v_serie, v_ejercicio, v_correlativo, p_pedido_id,
    v_expedicion, v_operacion,
    v_emisor, p_receptor, v_lineas, v_desglose,
    v_base, v_cuota, v_total,
    p_sustituye_a, p_rectifica_a,
    v_huella, v_anterior, p_actor_id
  )
  returning id into v_id;

  insert into factura_eventos (factura_id, evento, detalle, actor_id)
  values (v_id, 'emitida',
          jsonb_build_object('numero', v_numero, 'tipo', p_tipo, 'total', v_total),
          p_actor_id);

  return v_id;
end;
$$;

-- Y el mismo criterio en el «ponerse al día»: pendiente = sin NINGÚN documento
-- completo de la venta, no solo sin simplificada.
create or replace function public.emitir_facturas_pendientes(p_actor_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_pedido   record;
  v_emitidas int := 0;
  v_saltadas int := 0;
  v_id       uuid;
begin
  if emisor_fiscal() is null then
    raise exception
      'Faltan los datos fiscales del emisor (TI → Ajustes). Sin NIF, nombre y domicilio no hay factura que emitir.'
      using errcode = 'P0001';
  end if;

  for v_pedido in
    select p.id from pedidos p
    where p.devengado_el is not null
      and not exists (
        select 1 from facturas_emitidas f
        where f.pedido_id = p.id and f.tipo in ('simplificada', 'completa')
      )
    order by p.devengado_el, p.created_at
  loop
    v_id := emitir_factura(v_pedido.id, 'simplificada', p_actor_id => p_actor_id);
    if v_id is null then v_saltadas := v_saltadas + 1;
    else v_emitidas := v_emitidas + 1;
    end if;
  end loop;

  return jsonb_build_object('emitidas', v_emitidas, 'saltadas', v_saltadas);
end;
$$;

-- ── §4 · El canje: la completa a petición ────────────────────────────────────
-- ⚠️ El receptor NO se guarda tal como llega. Se reconstruye clave por clave,
-- porque lo que entra por aquí acaba impreso en un documento contable: si el
-- llamador manda un campo de más, no tiene por qué colarse en la factura.
--
-- ⚠️ Y los datos NO se sacan del pedido. `documento_cliente` es el DNI que se
-- pidió en el checkout —y puede no ser el NIF que va en la factura, p.ej. el CIF
-- de una empresa—, y la dirección guardada es la de ENVÍO, que no tiene que ser
-- el domicilio fiscal. La pantalla prerrellena para ahorrar teclas; la verdad la
-- confirma quien pide la factura.
create or replace function public.emitir_factura_completa(
  p_pedido_id uuid,
  p_receptor  jsonb,
  p_actor_id  uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_receptor      jsonb;
  v_nif           text;
  v_simplificada  uuid;
  v_falta         text[] := '{}';
begin
  if emisor_fiscal() is null then
    raise exception
      'Faltan los datos fiscales del emisor (TI → Ajustes). Sin NIF, nombre y domicilio propios no se puede emitir una factura.'
      using errcode = 'P0001';
  end if;

  -- Nombrar lo que falta, no decir «datos incompletos». Es la lección del
  -- guardia de la 069, que nombra las facturas sin fecha.
  --
  -- ⚠️ El `::text` NO es adorno: sin él, `text[] || 'NIF'` hace que Postgres
  -- resuelva el operador como `anyarray || anyarray` e intente convertir la
  -- cadena a un array, y esto revienta con «malformed array literal: NIF». Lo
  -- cazó el ensayo — y de paso enseñó que un test que solo comprueba «rechaza»
  -- sin mirar POR QUÉ habría dado esto por bueno.
  if coalesce(trim(p_receptor->>'nif'), '')           = '' then v_falta := v_falta || 'NIF'::text; end if;
  if coalesce(trim(p_receptor->>'nombre'), '')        = '' then v_falta := v_falta || 'nombre o razón social'::text; end if;
  if coalesce(trim(p_receptor->>'direccion'), '')     = '' then v_falta := v_falta || 'dirección'::text; end if;
  if coalesce(trim(p_receptor->>'codigo_postal'), '') = '' then v_falta := v_falta || 'código postal'::text; end if;
  if coalesce(trim(p_receptor->>'ciudad'), '')        = '' then v_falta := v_falta || 'población'::text; end if;

  if cardinality(v_falta) > 0 then
    raise exception
      'Una factura completa necesita los datos fiscales del cliente. Falta: %.',
      array_to_string(v_falta, ', ')
      using errcode = 'P0001';
  end if;

  v_nif := upper(trim(p_receptor->>'nif'));
  if not nif_forma_valida(v_nif) then
    raise exception
      'El NIF «%» no tiene una forma válida (8 cifras y letra, NIE, o CIF).', v_nif
      using errcode = 'P0001';
  end if;

  v_receptor := jsonb_build_object(
    'nif',           v_nif,
    'nombre',        trim(p_receptor->>'nombre'),
    'direccion',     trim(p_receptor->>'direccion'),
    'codigo_postal', trim(p_receptor->>'codigo_postal'),
    'ciudad',        trim(p_receptor->>'ciudad'),
    'provincia',     nullif(trim(coalesce(p_receptor->>'provincia', '')), ''),
    'pais',          coalesce(nullif(trim(coalesce(p_receptor->>'pais', '')), ''), 'ES')
  );

  -- La simplificada a la que sustituye, si la hubo. Puede no haberla: una venta
  -- anterior a que el emisor estuviera configurado no llegó a tener ninguna, y
  -- entonces la completa no sustituye a nada — no es un error.
  select id into v_simplificada
  from facturas_emitidas
  where pedido_id = p_pedido_id and tipo = 'simplificada';

  return emitir_factura(
    p_pedido_id   => p_pedido_id,
    p_tipo        => 'completa',
    p_receptor    => v_receptor,
    p_sustituye_a => v_simplificada,
    p_actor_id    => p_actor_id
  );
end;
$$;

comment on function public.emitir_factura_completa is
  'La factura completa a petición del cliente. Sustituye a la simplificada de esa venta si existía. Idempotente: dos clics devuelven la misma.';

-- ── §5 · El libro, y por qué una sustituida no cuenta ────────────────────────
-- ⚠️⚠️ SI LAS DOS CONTARAN, EL IVA DE ESA VENTA ESTARÍA DOS VECES en el libro de
-- facturas expedidas. La simplificada no se puede anular —es inmutable, y lo es
-- a propósito—, así que la sustitución NO se marca en ella: se deduce de que
-- otra factura la señala con `sustituye_a`.
--
-- Así la inmutabilidad se mantiene entera y el libro sale bien, sin un campo
-- mutable «anulada» que alguien tendría que acordarse de poner.
create or replace view public.libro_facturas_expedidas as
select
  f.*,
  not exists (
    select 1 from public.facturas_emitidas s where s.sustituye_a = f.id
  ) as vigente,
  (select s.numero from public.facturas_emitidas s where s.sustituye_a = f.id) as sustituida_por
from public.facturas_emitidas f;

comment on view public.libro_facturas_expedidas is
  'Las facturas con `vigente`: una simplificada canjeada por una completa NO es vigente y no cuenta en el libro, o el IVA saldría dos veces.';

revoke all on public.libro_facturas_expedidas from anon;
revoke all on public.libro_facturas_expedidas from authenticated;

-- ── §6 · La limpieza: quitar la mina ─────────────────────────────────────────
-- Se reescribe entera porque `create or replace function` lo exige. Respecto a
-- la 067 cambian TRES COSAS y nada más:
--
--   1. borra `factura_eventos`, `facturas_emitidas` y `factura_contadores`
--      ANTES de los pedidos — sin eso el DELETE de pedidos falla por el RESTRICT
--   2. cuenta las facturas borradas en el informe
--   3. REINICIA LOS CONTADORES, que es lo que de verdad importa
--
-- ⭐ Sobre el punto 3: la tienda está en pruebas, y cada venta de prueba se come
-- un número de la serie. Sin reiniciar, la primera factura real sería la
-- S2026/00043 y la serie empezaría con cuarenta y dos huecos que no existieron.
-- Borrando el contador, la siguiente vuelve a ser la 00001.
--
-- ⚠️ Y nada de esto añade riesgo: el trigger `trg_factura_inmutable` (072 §6) ya
-- se niega a borrar cualquier factura después del arranque fiscal, y esta función
-- ya se niega a ejecutarse entera. Son dos cerrojos independientes sobre la
-- misma puerta.
create or replace function public.limpiar_datos_de_prueba(p_actor_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_arranque timestamptz; v_borrados jsonb; v_pedidos int; v_empleados int;
  v_cuentas int; v_sin_rol int; v_stock jsonb; v_descuadres int; v_facturas int;
begin
  select arranque_fiscal_el into v_arranque from ajustes_tienda where id;

  if v_arranque is not null then
    raise exception
      'La tienda arrancó de verdad el % y sus datos ya no son de prueba. '
      'Borrar ventas reales destruye registros contables, así que esta función '
      'no vuelve a ejecutarse.', v_arranque;
  end if;

  select count(*) into v_pedidos from pedidos;
  select count(*) into v_facturas from facturas_emitidas;

  -- Las facturas PRIMERO. El orden entre las tres no es opcional:
  -- `factura_eventos.factura_id` y `facturas_emitidas.pedido_id` son los dos
  -- RESTRICT, así que se va de la hoja a la raíz.
  delete from factura_eventos    where id is not null;
  delete from facturas_emitidas  where id is not null;
  delete from factura_contadores where serie is not null;

  delete from stock_reservas    where id is not null;
  delete from carrito_items     where id is not null;
  delete from carritos          where id is not null;
  delete from checkout_datos    where session_id is not null;
  delete from pedidos           where id is not null;
  delete from direcciones_envio where id is not null;

  -- `empleado_historial_mensual` cae en cascada con el empleado.
  with fuera as (delete from empleados where id is not null returning id)
  select count(*) into v_empleados from fuera;

  -- Todo lo que no sea `admin`. DESPUES de pedidos y empleados: pedidos.user_id
  -- cascadea desde auth.users y al reves se llevaria pedidos por la puerta de
  -- atras. Y en UNA sola sentencia porque user_roles.asignado_por es NO ACTION:
  -- si un asesor asigno el rol de otro, borrarlos por separado fallaria.
  -- profiles, user_roles y staff_modulos caen en cascada con la cuenta.
  with fuera as (
    delete from auth.users u
    where u.id in (
      select ur.user_id from user_roles ur
      join roles r on r.id = ur.role_id
      where r.nombre <> 'admin'
    )
    returning u.id
  )
  select count(*) into v_cuentas from fuera;

  -- Sin rol: anomalo. Se cuenta y NO se borra.
  select count(*) into v_sin_rol
  from auth.users u
  where not exists (select 1 from user_roles ur where ur.user_id = u.id);

  select jsonb_object_agg(t, n) into v_borrados from (
    select 'pedidos' t, count(*) n from pedidos
    union all select 'pedido_items', count(*) from pedido_items
    union all select 'pedido_iva', count(*) from pedido_iva
    union all select 'pedido_eventos', count(*) from pedido_eventos
    union all select 'pedido_calificaciones', count(*) from pedido_calificaciones
    union all select 'transacciones_pago', count(*) from transacciones_pago
    union all select 'reembolso_lineas', count(*) from reembolso_lineas
    union all select 'facturas_emitidas', count(*) from facturas_emitidas
    union all select 'factura_eventos', count(*) from factura_eventos
    union all select 'factura_contadores', count(*) from factura_contadores
    union all select 'carritos', count(*) from carritos
    union all select 'stock_reservas', count(*) from stock_reservas
    union all select 'direcciones_envio', count(*) from direcciones_envio
    union all select 'empleados', count(*) from empleados
    union all select 'empleado_historial_mensual', count(*) from empleado_historial_mensual
    union all select 'staff_modulos', count(*) from staff_modulos
    union all select 'cuentas_no_admin', count(*) from auth.users u
      join user_roles ur on ur.user_id = u.id
      join roles r on r.id = ur.role_id where r.nombre <> 'admin'
  ) x;

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
    select pr.id, greatest(0, coalesce(c.uds,0) - coalesce(ab.uds,0)
                              + coalesce(g.uds,0) + coalesce(aj.uds,0)) as stock
    from productos pr
    left join comprado c on c.producto_id = pr.id
    left join abierto ab on ab.producto_id = pr.id
    left join generado g on g.producto_id = pr.id
    left join ajustado aj on aj.producto_id = pr.id
  ),
  movidos as (
    update productos pr
    set stock_disponible = o.stock, stock_reservado = 0, updated_at = now()
    from objetivo o
    where o.id = pr.id and (pr.stock_disponible <> o.stock or pr.stock_reservado <> 0)
    returning pr.nombre, o.stock
  )
  select coalesce(jsonb_object_agg(nombre, stock), '{}'::jsonb) into v_stock from movidos;

  select count(*) into v_descuadres from comprobar_stock();

  return jsonb_build_object(
    'pedidos_borrados', v_pedidos,
    'facturas_borradas', v_facturas,
    'empleados_borrados', v_empleados,
    'cuentas_borradas', v_cuentas,
    'cuentas_sin_rol_sin_tocar', v_sin_rol,
    'quedan', v_borrados,
    'stock_recalculado', v_stock,
    'descuadres_tras_limpiar', v_descuadres,
    'actor', p_actor_id,
    'cuando', now()
  );
end;
$$;

-- ── §7 · Permisos ────────────────────────────────────────────────────────────
-- Las DOS fuentes (059/060). `limpiar_datos_de_prueba` ya los tenía; se repiten
-- porque `create or replace` NO conserva los grants de la versión anterior en
-- todos los casos, y aquí prefiero repetir que suponer.
do $$
declare
  v_fn text;
  v_fns text[] := array[
    'public.nif_forma_valida(text)',
    'public.emitir_factura(uuid,public.factura_tipo,jsonb,jsonb,jsonb,uuid,uuid,uuid)',
    'public.emitir_factura_completa(uuid,jsonb,uuid)',
    'public.emitir_facturas_pendientes(uuid)',
    'public.limpiar_datos_de_prueba(uuid)'
  ];
begin
  foreach v_fn in array v_fns loop
    execute format('revoke all on function %s from public', v_fn);
    execute format('revoke all on function %s from anon', v_fn);
    execute format('revoke all on function %s from authenticated', v_fn);
  end loop;
end $$;

do $$
declare v_mal text;
begin
  select string_agg(f || ' → ' || r, E'\n') into v_mal
  from (
    select unnest(array[
      'public.nif_forma_valida(text)',
      'public.emitir_factura(uuid,public.factura_tipo,jsonb,jsonb,jsonb,uuid,uuid,uuid)',
      'public.emitir_factura_completa(uuid,jsonb,uuid)',
      'public.emitir_facturas_pendientes(uuid)',
      'public.limpiar_datos_de_prueba(uuid)'
    ]) f
  ) fns
  cross join (select unnest(array['anon', 'authenticated']) r) roles
  where has_function_privilege(roles.r, fns.f, 'execute');

  if v_mal is not null then
    raise exception E'Funciones ejecutables por anon/authenticated:\n%', v_mal;
  end if;
end $$;
