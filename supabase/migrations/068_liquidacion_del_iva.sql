-- ============================================================
-- 068 — La liquidación del IVA (modelo 303)
--
-- La 062 dejó el IVA de cada venta calculable y cuadrado al céntimo. La 029
-- había dejado el soportado de las compras. Parecía, entonces, que el 303 era
-- solo una pantalla que resta una cosa de la otra.
--
-- No lo era. Al ir a escribir la resta aparecieron CUATRO agujeros en el dato,
-- y ninguno se ve leyendo `pedido_iva`:
--
--   1. `pedido_iva` existe para TODOS los pedidos con líneas, incluidos los
--      PENDIENTE_PAGO y los CANCELADO. Declararlos sería declarar IVA de ventas
--      que no han ocurrido: una transferencia sin pagar no ha devengado nada.
--
--   2. No hay FECHA DE DEVENGO. Solo `pedidos.created_at`, que en tarjeta y
--      Bizum coincide con el cobro porque el pedido nace ya pagado, pero en
--      TRANSFERENCIA no: el pedido nace pendiente y se cobra días después. El
--      pedido puede caer en un trimestre y el cobro en el siguiente.
--
--   3. `reembolsar_pedido_total` NO apunta líneas en `reembolso_lineas`. Un
--      reembolso hecho desde el panel de Stripe llega por el webhook
--      `charge.refunded`, devuelve el dinero y no deja rastro de qué artículos:
--      sin el artículo no hay tipo de IVA, y sin tipo no se puede rectificar.
--
--   4. `facturas_compra` no tiene la fecha de la factura del proveedor, solo la
--      de registro. El libro registro de facturas recibidas exige la primera.
--
-- Así que esta migración es, sobre todo, el dato que faltaba. La resta —la RPC
-- del apartado 6— es la parte fácil.
--
-- ⚠️⚠️ Y LO QUE ESTA MIGRACIÓN **NO** ES: un libro de facturas expedidas.
-- Un 303 se soporta con las facturas emitidas, y esas son la Capa 2 (todavía
-- sin escribir, pendiente de confirmar Verifactu con la gestoría). Lo que hay
-- aquí liquida desde los PEDIDOS. Es el mismo importe y el mismo IVA, pero el
-- informe lo dice en un aviso en vez de dejarlo suponer: quien lo presente
-- tiene que saber sobre qué está firmando.
--
-- ⚠️ NO SE CREA NINGÚN LIBRO DE IVA NUEVO, y es deliberado. Las tres fuentes
-- —`pedido_iva`, `reembolso_lineas` y `factura_compra_items`— ya son la verdad
-- de sus hechos. Una cuarta tabla que las copie es un segundo sitio que puede
-- divergir del primero: exactamente lo que la 063 se negó a hacer con el libro
-- de movimientos de stock. El informe se calcula, no se acumula.
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. El módulo `contabilidad`, y que sea la ÚLTIMA vez que se toca esta lista
-- ---------------------------------------------------------------------------
--
-- El CHECK de `modulo` está copiado en `staff_modulos` y en `cargo_modulos`, y
-- lleva reescrito CINCO veces (023, 030, 032, 036 y ahora). La 038 ya diagnosticó
-- el problema —creó el dominio `nivel_permiso` justo por eso— pero dejó `modulo`
-- como estaba. Se cierra aquí: un dominio, un sitio.
do $dominio$
begin
  if not exists (select 1 from pg_type where typname = 'staff_modulo') then
    create domain public.staff_modulo as text
      check (value in (
        'pedidos', 'catalogo', 'inventario', 'dashboard',
        'compras', 'clientes', 'gestion_humana', 'ti',
        -- El nuevo. Vive aparte de `compras` y de `dashboard` por dos razones:
        -- el 303 cruza ventas Y compras, así que ninguno de los dos es su dueño;
        -- y quien lo presenta no es necesariamente quien registra facturas de
        -- proveedor ni quien mira métricas. Además es la casa de las facturas a
        -- clientes cuando lleguen.
        'contabilidad'
      ));
  end if;
end
$dominio$;

comment on domain public.staff_modulo is
  'Módulos del backoffice. Fuente única del CHECK: estaba copiado en staff_modulos y '
  'cargo_modulos y había que acordarse de tocar los dos. Añadir uno = tocar solo esto.';

alter table public.staff_modulos drop constraint if exists staff_modulos_modulo_check;
alter table public.staff_modulos alter column modulo type public.staff_modulo;

alter table public.cargo_modulos drop constraint if exists cargo_modulos_modulo_check;
alter table public.cargo_modulos alter column modulo type public.staff_modulo;

-- La plantilla del cargo que lo va a usar. `contabilidad` es un módulo de
-- CONSULTA por ahora (el informe no escribe nada), así que `lectura` alcanza
-- para todo lo que hay; se otorga a quien administra, no a quien vende.
--
-- Se siembra solo en DIRADM y GER, y con `on conflict do nothing`: si alguien ya
-- lo ha retocado a mano desde TI → Cargos, esa decisión gana. Las plantillas son
-- DATOS, no doctrina (lección de la 038).
insert into public.cargo_modulos (cargo_id, modulo, nivel)
select c.id, 'contabilidad', 'lectura'
from public.cargos c
where c.codigo in ('DIRADM', 'GER')
on conflict (cargo_id, modulo) do nothing;

-- ---------------------------------------------------------------------------
-- 2. La fecha de devengo de la venta
-- ---------------------------------------------------------------------------
--
-- El agujero 2. Y no se arregla con una vista sobre `pedido_eventos`: el dato
-- se necesita en el WHERE de un informe trimestral y —más importante— la
-- factura de la Capa 2 lo llevará impreso. Derivarlo cada vez desde el
-- historial es frágil y no se puede indexar.
alter table public.pedidos
  add column if not exists devengado_el timestamptz;

comment on column public.pedidos.devengado_el is
  'Cuándo la venta pasó a existir fiscalmente (el cobro). NULL = todavía no ha '
  'devengado: pendiente de pago, o cancelada antes de pagar. Se escribe UNA vez '
  'y no se mueve: la primera fecha es la que vale. Ver la 068.';

create index if not exists idx_pedidos_devengado_el
  on public.pedidos (devengado_el)
  where devengado_el is not null;

-- Los estados en los que el cobro ya ocurrió. REEMBOLSADO está DENTRO a
-- propósito: la venta existió y después se devolvió, y esas son dos anotaciones
-- distintas —el devengo y su rectificación—, no una que se borra. Borrar la
-- primera sería falsear el trimestre en que se vendió.
create or replace function public.pedido_estado_devenga(p_estado public.pedido_estado)
returns boolean
language sql
immutable
set search_path to 'public', 'pg_temp'
as $$
  select p_estado in ('PROCESANDO', 'ENVIADO', 'ENTREGADO', 'REEMBOLSADO');
$$;

comment on function public.pedido_estado_devenga(public.pedido_estado) is
  'Si un pedido en ese estado tiene el cobro hecho. CANCELADO no está: se puede '
  'llegar a él desde PROCESANDO (ya cobrado), y en ese caso el devengo ya está '
  'escrito y no se borra — el informe lo señala como anomalía.';

-- ⚠️ SECURITY DEFINER aunque no toque ninguna tabla, y el motivo es indirecto:
-- llama a `pedido_estado_devenga`, a la que se le revoca el EXECUTE más abajo.
-- Un trigger normal corre con los permisos de quien provoca el INSERT, así que
-- sin esto un camino que insertara pedidos con otro rol se encontraría un
-- «permission denied for function» en la ruta del dinero. Mismo criterio que
-- `registrar_cambio_estado_pedido` (039).
create or replace function public.pedido_marca_devengo()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  -- ⚠️ Escritura ÚNICA. Que la fecha no se mueva no es purismo: si un pedido
  -- entregado se reabriera y volviera a PROCESANDO, mover el devengo lo pasaría
  -- a otro trimestre y descuadraría un 303 YA PRESENTADO. Es la misma disciplina
  -- que `marcar_arranque_fiscal` (064): la primera fecha es la que vale.
  --
  -- Y el guardia va contra OLD, no contra NEW: sin él, un UPDATE que mande
  -- `devengado_el = null` lo borraría y el siguiente cambio de estado lo
  -- reescribiría con la fecha de hoy.
  if tg_op = 'UPDATE' and old.devengado_el is not null then
    new.devengado_el := old.devengado_el;
    return new;
  end if;

  if new.devengado_el is null and public.pedido_estado_devenga(new.estado) then
    -- `now()` y no `clock_timestamp()`: aquí no se ordena nada, se fecha un
    -- hecho económico. Y así, en el pedido que nace ya PROCESANDO (el checkout
    -- de tarjeta), `devengado_el` sale EXACTAMENTE igual que `created_at`, que
    -- es comprobable de un vistazo.
    new.devengado_el := now();
  end if;

  return new;
end;
$$;

-- BEFORE, y de INSERT además de UPDATE: `confirmar_venta` (033) no actualiza el
-- estado, inserta el pedido ya en PROCESANDO. Sin el INSERT, la venta de tarjeta
-- —que es la mayoría— nunca tendría fecha de devengo.
drop trigger if exists trg_pedido_devengo on public.pedidos;
create trigger trg_pedido_devengo
  before insert or update of estado, devengado_el on public.pedidos
  for each row execute function public.pedido_marca_devengo();

-- Los pedidos que ya existen. La fecha no se inventa: sale del primer evento del
-- historial en que el pedido entró en un estado con cobro (la 039 registra
-- también el alta, así que el pedido nacido PROCESANDO tiene su evento).
--
-- ⚠️ `min(created_at)`, no el último: si un pedido pasó por PROCESANDO y luego a
-- ENVIADO y a REEMBOLSADO, el devengo es el primero de los tres.
update public.pedidos p
set devengado_el = e.primero
from (
  select ev.pedido_id, min(ev.created_at) as primero
  from public.pedido_eventos ev
  where ev.tipo = 'estado'
    and public.pedido_estado_devenga(ev.estado_nuevo)
  group by ev.pedido_id
) e
where e.pedido_id = p.id
  and p.devengado_el is null;

-- Red de seguridad para lo que el historial no alcance: los pedidos anteriores a
-- la 039 no tienen eventos. Si alguno está en un estado con cobro y se ha
-- quedado sin fecha, se le pone su `created_at` — es lo más cercano que hay— y
-- se AVISA por pantalla en el `raise notice`, para que no pase inadvertido.
do $sin_historial$
declare
  v_cuantos integer;
begin
  update public.pedidos
  set devengado_el = created_at
  where devengado_el is null
    and public.pedido_estado_devenga(estado);

  get diagnostics v_cuantos = row_count;

  if v_cuantos > 0 then
    raise notice
      '% pedido(s) cobrados no tenían evento de estado en el historial: se les ha '
      'puesto su fecha de creación como devengo. Revísalos si son de antes de la 039.',
      v_cuantos;
  end if;
end
$sin_historial$;

-- ---------------------------------------------------------------------------
-- 3. La fecha de la factura del proveedor
-- ---------------------------------------------------------------------------
--
-- El agujero 4. Son DOS fechas distintas y hacen falta las dos:
--
--   · `fecha_factura`  — cuándo la EXPIDIÓ el proveedor. Es un dato obligatorio
--                        del libro registro de facturas recibidas.
--   · `created_at`     — cuándo la registramos nosotros. Es la que decide en qué
--                        trimestre se deduce (ver el apartado 6).
--
-- ⚠️ Se queda NULLABLE, y esto es una decisión de ventana de despliegue, no un
-- olvido: la API que hay ahora mismo en producción llama a
-- `registrar_factura_compra` SIN este parámetro. Si la base la exigiera hoy,
-- registrar una compra devolvería error hasta que el despliegue de la web
-- llegue. Se hace en dos pasos, que es la regla escrita en ESTADO.md:
--   068 (hoy)  la base la ACEPTA y no la exige · la web pasa a pedirla
--   069        la base la EXIGE, una vez comprobado que llega siempre
alter table public.facturas_compra
  add column if not exists fecha_factura date;

comment on column public.facturas_compra.fecha_factura is
  'Fecha de EXPEDICIÓN de la factura del proveedor, la que exige el libro registro '
  'de facturas recibidas. NO decide el trimestre en que se deduce: eso lo hace '
  'created_at (la fecha de registro). Ver la 068.';

-- ⚠️ Las dos facturas que ya existen se quedan a NULL A PROPÓSITO. Rellenarlas
-- con `created_at::date` sería inventar una fecha que va a un libro oficial, y
-- lo peor de un dato inventado es que parece puesto (la lección textual de la
-- 062 con `iva_pct`). El informe las nombra en un aviso para que se corrijan
-- mirando el PDF, que está en el bucket.

-- El parámetro nuevo va AL FINAL y con `default null`: Supabase llama con
-- argumentos con nombre, así que la API ya desplegada entra por el default sin
-- ventana ciega. Es lo que se comprobó en el ensayo de la 063.
create or replace function public.registrar_factura_compra(
  p_pdf_path       text,
  p_items          jsonb,
  p_numero_factura text default null,
  p_proveedor_id   uuid default null,
  p_notas          text default null,
  p_creado_por     uuid default null,
  p_fecha_factura  date default null
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_factura_id       uuid;
  v_proveedor_nombre varchar(200);
  v_item             jsonb;
  v_producto_id      uuid;
  v_cantidad         integer;
  v_costo            numeric(10,4);
  v_iva_pct          numeric(4,2);
  v_nombre           varchar(200);
  v_total_unidades   integer := 0;
  -- acumuladores sin redondear; se redondean a 2 decimales al final
  v_base             numeric := 0;
  v_iva              numeric := 0;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La compra debe tener al menos una línea';
  end if;

  -- Una factura del futuro es un error de tecleo, no un caso de negocio. Se
  -- rechaza aquí y no solo en el formulario porque una fecha mal puesta imputa
  -- el IVA soportado a otro trimestre.
  if p_fecha_factura is not null
     and p_fecha_factura > (now() at time zone 'Europe/Madrid')::date then
    raise exception 'La fecha de la factura no puede ser futura';
  end if;

  if p_proveedor_id is not null then
    select nombre into v_proveedor_nombre from proveedores where id = p_proveedor_id;
    if not found then
      raise exception 'Proveedor no encontrado';
    end if;
  end if;

  insert into facturas_compra (
    numero_factura, proveedor, proveedor_id, notas, pdf_path, creado_por, fecha_factura
  )
  values (
    p_numero_factura, v_proveedor_nombre, p_proveedor_id, p_notas, p_pdf_path,
    p_creado_por, p_fecha_factura
  )
  returning id into v_factura_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_producto_id := (v_item->>'producto_id')::uuid;
    v_cantidad    := (v_item->>'cantidad')::integer;
    v_costo       := (v_item->>'costo_unitario')::numeric;
    v_iva_pct     := (v_item->>'iva_pct')::numeric;

    if v_cantidad is null or v_cantidad <= 0 then
      raise exception 'Cantidad inválida en una línea de la compra';
    end if;
    if v_costo is null or v_costo < 0 then
      raise exception 'Costo unitario inválido en una línea de la compra';
    end if;
    if v_iva_pct is null or v_iva_pct not in (4, 10, 21) then
      raise exception 'El IVA de cada línea debe ser 4, 10 o 21';
    end if;

    update productos
    set stock_disponible = stock_disponible + v_cantidad,
        updated_at       = now()
    where id = v_producto_id
    returning nombre into v_nombre;

    if not found then
      raise exception 'Producto % no encontrado', v_producto_id;
    end if;

    insert into factura_compra_items (factura_id, producto_id, nombre_producto, cantidad, costo_unitario, iva_pct)
    values (v_factura_id, v_producto_id, v_nombre, v_cantidad, v_costo, v_iva_pct);

    v_total_unidades := v_total_unidades + v_cantidad;
    v_base           := v_base + (v_cantidad * v_costo);
    v_iva            := v_iva + (v_cantidad * v_costo * v_iva_pct / 100);
  end loop;

  update facturas_compra
  set total_unidades = v_total_unidades,
      total          = round(v_base, 2),
      total_iva      = round(v_iva, 2),
      total_con_iva  = round(v_base + v_iva, 2)
  where id = v_factura_id;

  return v_factura_id;
end;
$$;

revoke execute on function public.registrar_factura_compra(text, jsonb, text, uuid, text, uuid, date)
  from public, anon, authenticated;

-- La firma vieja de 6 parámetros queda VIVA y hay que matarla: con las dos
-- presentes, una llamada de 6 argumentos con nombre sería ambigua y Postgres la
-- rechazaría — la trampa que documentó la 039 y que volvió a salir en la 063.
drop function if exists public.registrar_factura_compra(text, jsonb, text, uuid, text, uuid);

-- Poder corregir la fecha de una factura ya registrada. Es un dato de
-- transcripción del PDF, no un hecho económico que la aplicación haya
-- presenciado: equivocarse al teclearlo tiene que ser corregible, y las dos
-- facturas que ya existen nacieron sin él.
--
-- No se toca nada más de la factura: el número es único (054), el total sale de
-- las líneas y las líneas movieron stock. Eso sí sería reescribir la historia.
create or replace function public.fijar_fecha_factura_compra(
  p_factura_id    uuid,
  p_fecha_factura date
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_fecha_factura is null then
    raise exception 'La fecha de la factura es obligatoria';
  end if;

  if p_fecha_factura > (now() at time zone 'Europe/Madrid')::date then
    raise exception 'La fecha de la factura no puede ser futura';
  end if;

  update public.facturas_compra
  set fecha_factura = p_fecha_factura
  where id = p_factura_id;

  if not found then
    raise exception 'Factura % no existe', p_factura_id using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.fijar_fecha_factura_compra(uuid, date)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. El reembolso total apunta lo que devuelve
-- ---------------------------------------------------------------------------
--
-- El agujero 3, y el que más importa de los cuatro, porque no se puede arreglar
-- después: si el dinero salió sin dejar dicho QUÉ artículos volvieron, el tipo
-- de IVA de esa devolución no está en ninguna parte y no hay de dónde sacarlo.
--
-- Hoy hay dos caminos y solo uno apunta:
--   · Panel, eligiendo artículos → `registrar_reembolso_lineas` → apunta. ✅
--   · Panel por importe, o reembolso hecho en el panel de STRIPE que llega por
--     el webhook `charge.refunded` → `reembolsar_pedido_total` → no apunta. ❌
--
-- Es literalmente lo que dijo la 063 del libro de stock: «un libro con huecos es
-- peor que no tenerlo, porque parece completo». Y el apunte va en la MISMA
-- transacción que el movimiento, por lo mismo.
--
-- ⚠️⚠️ LA TRAMPA DE ESTE CAMBIO, Y ES SUTIL: las unidades a reponer se calculan
-- restando lo que ya figura en `reembolso_lineas`. Si se insertan las líneas
-- ANTES de reponer, la consulta de reposición las ve como «ya devueltas» y no
-- repone NADA — un reembolso que devuelve el dinero y no devuelve el stock. Y al
-- revés (reponer y luego insertar leyendo otra vez la tabla) tampoco vale, porque
-- son dos lecturas que pueden diferir. La única forma correcta es calcular el
-- conjunto UNA vez y usar el mismo para las dos cosas, que es lo que hace el CTE
-- `pendiente_por_item`. Se probó en transacción revertida antes de aplicar: sin
-- el CTE el stock subía 0 en vez de 5.
create or replace function public.reembolsar_pedido_total(
  p_pedido_id uuid,
  p_actor_id uuid default null,
  -- El reembolso de Stripe que lo pagó, cuando se conoce. Va al final y con
  -- default para que la API ya desplegada (que llama con dos) no se rompa.
  p_refund_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_estado public.pedido_estado;
  -- Cuando no llega un refund de Stripe, la referencia es el propio cierre del
  -- pedido. Determinista a propósito: el único (refund_id, pedido_item_id) de la
  -- 044 convierte un reintento del webhook en un `do nothing`.
  v_refund text := coalesce(nullif(p_refund_id, ''), 'total:' || p_pedido_id::text);
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

  -- Devuelve a la venta las unidades que no se hayan devuelto ya por artículo, y
  -- —lo nuevo— las apunta. `stock_disponible` sube; `stock_reservado` no se toca:
  -- la reserva del checkout ya se consumió al confirmar la venta.
  with pendiente_por_item as (
    -- ⚠️ ESTE es el conjunto, y se lee UNA sola vez. Todo lo de abajo sale de
    -- aquí; nadie vuelve a consultar `reembolso_lineas`.
    select
      i.id as pedido_item_id,
      i.producto_id,
      i.cantidad - coalesce(r.devuelto, 0) as cantidad,
      round((i.cantidad - coalesce(r.devuelto, 0)) * i.precio_unitario, 2) as importe
    from public.pedido_items i
    left join (
      select pedido_item_id, sum(cantidad) as devuelto
      from public.reembolso_lineas
      group by pedido_item_id
    ) r on r.pedido_item_id = i.id
    where i.pedido_id = p_pedido_id
      and i.cantidad - coalesce(r.devuelto, 0) > 0
  ),
  -- Agrupado por producto ANTES de tocar el stock: `update … from` con dos filas
  -- que casan con el mismo producto aplica una sola y descarta la otra en
  -- silencio. Un pedido con dos líneas del mismo artículo repondría de menos.
  a_reponer as (
    select producto_id, sum(cantidad) as unidades
    from pendiente_por_item
    group by producto_id
  ),
  repuesta as (
    update public.productos p
    set stock_disponible = p.stock_disponible + ar.unidades,
        updated_at = now()
    from a_reponer ar
    where p.id = ar.producto_id
    returning p.id
  )
  insert into public.reembolso_lineas (
    pedido_id, pedido_item_id, cantidad, importe,
    -- `true` porque es la verdad: esta función SÍ repone lo que devuelve, sin
    -- preguntar. No es un default optimista.
    repuesto_al_stock, refund_id, actor_user_id
  )
  select p_pedido_id, pendiente_por_item.pedido_item_id, pendiente_por_item.cantidad,
         pendiente_por_item.importe, true, v_refund, p_actor_id
  from pendiente_por_item
  -- El CHECK de la tabla exige importe > 0. Una línea a precio 0 no existe hoy
  -- en el catálogo, pero si existiera preferimos reponer su stock sin apuntarla
  -- a que reventara el reembolso entero: el dinero ya salió.
  where pendiente_por_item.importe > 0
  on conflict (refund_id, pedido_item_id) do nothing;

  return true;
end;
$$;

comment on function public.reembolsar_pedido_total(uuid, uuid, text) is
  'Cierra el pedido como REEMBOLSADO, repone las unidades que no constaran ya '
  'devueltas y LAS APUNTA en reembolso_lineas. Desde la 068 no hay devolución sin '
  'desglose: sin el artículo no hay tipo de IVA que rectificar.';

revoke execute on function public.reembolsar_pedido_total(uuid, uuid, text)
  from public, anon, authenticated;

-- La firma de 2 parámetros sigue viva y haría ambigua cualquier llamada de dos
-- argumentos. Fuera, igual que arriba.
drop function if exists public.reembolsar_pedido_total(uuid, uuid);

-- `registrar_reembolso_lineas` la llama por dentro. Se reescribe SOLO esa línea
-- para pasarle el refund de Stripe, y así las unidades que cierran el pedido
-- quedan atribuidas al mismo reembolso que las pagó en vez de a un id sintético.
-- Se comprobó en el ensayo: un parcial y su cierre salen como UN documento
-- rectificativo, no como dos, que es lo correcto.
--
-- Lo demás es idéntico a la 044. Ojo a que `v_pendientes` se sigue contando
-- ANTES de la llamada: después ya no se distingue lo que repuso esta operación
-- de lo que repuso la otra.
create or replace function public.registrar_reembolso_lineas(
  p_pedido_id      uuid,
  p_lineas         jsonb,
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
  perform pg_advisory_xact_lock(hashtext('reembolsar_pedido:' || p_pedido_id::text));

  with entrada as (
    select
      (l->>'pedido_item_id')::uuid as pedido_item_id,
      (l->>'cantidad')::integer    as cantidad
    from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) l
  ),
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
    on conflict (refund_id, pedido_item_id) do nothing
    returning pedido_item_id, cantidad, importe
  ),
  a_reponer as (
    select i.producto_id, sum(ins.cantidad) as unidades
    from insertada ins
    join public.pedido_items i on i.id = ins.pedido_item_id
    group by i.producto_id
  ),
  repuesta as (
    update public.productos p
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

    -- El tercer argumento es lo único que cambia respecto a la 044.
    v_total := public.reembolsar_pedido_total(p_pedido_id, p_actor_id, p_refund_id);
    if v_total then
      v_repuestas := v_repuestas + v_pendientes;
    end if;
  end if;

  return jsonb_build_object(
    'registradas', v_registradas,
    'pedidas',     v_pedidas,
    'unidades',    v_unidades,
    'importe',     v_importe,
    'unidades_repuestas', v_repuestas,
    'repuesto',    v_repuestas > 0,
    'marcado_total', v_total
  );
end;
$$;

revoke execute on function public.registrar_reembolso_lineas(uuid, jsonb, boolean, text, boolean, uuid)
  from public, anon, authenticated;

-- Lo que quedó sin apuntar ANTES de este cambio. Un pedido REEMBOLSADO cuyas
-- líneas no cubren todas sus unidades es una devolución de la que solo se sabe
-- el importe. Se completa aquí, con el mismo criterio: cantidad × precio de la
-- línea, y `repuesto_al_stock = true` porque `reembolsar_pedido_total` las
-- repuso en su momento.
--
-- ⚠️ Se marca con un refund_id propio, `retro:<pedido>`, y NO con `total:<pedido>`:
-- así se distingue en la base lo que se reconstruyó de lo que se presenció. Un
-- apunte reconstruido no debe parecer un apunte original, y el informe lo avisa.
insert into public.reembolso_lineas (
  pedido_id, pedido_item_id, cantidad, importe, repuesto_al_stock, refund_id
)
select
  i.pedido_id,
  i.id,
  i.cantidad - coalesce(r.devuelto, 0),
  round((i.cantidad - coalesce(r.devuelto, 0)) * i.precio_unitario, 2),
  true,
  'retro:' || i.pedido_id::text
from public.pedido_items i
join public.pedidos p on p.id = i.pedido_id
left join (
  select pedido_item_id, sum(cantidad) as devuelto
  from public.reembolso_lineas
  group by pedido_item_id
) r on r.pedido_item_id = i.id
where p.estado = 'REEMBOLSADO'
  and i.cantidad - coalesce(r.devuelto, 0) > 0
  and round((i.cantidad - coalesce(r.devuelto, 0)) * i.precio_unitario, 2) > 0
on conflict (refund_id, pedido_item_id) do nothing;

-- ---------------------------------------------------------------------------
-- 5. Un criterio de fecha, escrito una sola vez
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ ESTO CAMBIA TRIMESTRES ENTEROS Y ES EL FALLO MÁS FÁCIL DE TODA LA
-- MIGRACIÓN. Las fechas se guardan en `timestamptz` y la sesión de Supabase va
-- en UTC. Comparar un timestamptz con una fecha suelta usa la zona de la sesión,
-- así que una venta del **1 de abril a las 00:30 de Madrid** son las 22:30 UTC
-- del 31 de marzo: caería en el PRIMER trimestre en vez del segundo.
--
-- Y al revés, el 31 de marzo a las 23:30 de Madrid también son las 21:30 UTC del
-- 31, que sí es correcto — así que el error solo aparece en las ventas de las
-- primeras horas del primer día del trimestre. Es decir: no se nota nunca hasta
-- que se nota, y entonces ya está presentado.
--
-- El trimestre es el del calendario ESPAÑOL, así que la conversión es explícita
-- y vive aquí. Cualquier consulta del informe pasa por esta función.
create or replace function public.dia_fiscal(p_momento timestamptz)
returns date
language sql
immutable
set search_path to 'public', 'pg_temp'
as $$
  select (p_momento at time zone 'Europe/Madrid')::date;
$$;

comment on function public.dia_fiscal(timestamptz) is
  'El día del calendario español al que pertenece un instante. Explícito porque la '
  'sesión va en UTC y una venta de las 00:30 del día 1 caería en el trimestre '
  'anterior. Ver la 068.';

-- ---------------------------------------------------------------------------
-- 6. La liquidación
-- ---------------------------------------------------------------------------
--
-- Devengado (lo repercutido en ventas) − rectificado (las devoluciones)
--   − deducible (lo soportado en compras) = resultado.
--
-- ⚠️ REGLA DE REDONDEO, y es la misma discusión de la 062 subida un nivel: la
-- base del periodo es la SUMA DE LAS BASES DE LOS DOCUMENTOS, no una base
-- derivada del bruto del periodo. Cada factura declara su propia base y su
-- propia cuota; el 303 suma documentos. Derivar del bruto agregado daría otra
-- base —hasta unos céntimos— y no cuadraría con la suma de las facturas, que es
-- justo la comprobación que hace un inspector.
--
-- Por eso `pedido_iva` se SUMA tal cual (ya viene redondeado por pedido y por
-- tipo, hecho por la 062) y las devoluciones se agrupan por (reembolso, tipo)
-- antes de derivar, porque cada reembolso será una rectificativa.
create or replace function public.liquidacion_iva(
  p_desde date,
  p_hasta date
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_devengado    jsonb;
  v_rectificado  jsonb;
  v_deducible    jsonb;
  v_avisos       jsonb := '[]'::jsonb;
  v_arranque     timestamptz;
  v_d_base       numeric(12,2) := 0;
  v_d_cuota      numeric(12,2) := 0;
  v_r_base       numeric(12,2) := 0;
  v_r_cuota      numeric(12,2) := 0;
  v_c_base       numeric(12,2) := 0;
  v_c_cuota      numeric(12,2) := 0;
  v_cuantos      integer;
  v_refs         text;
begin
  if p_desde is null or p_hasta is null then
    raise exception 'El periodo necesita fecha de inicio y de fin';
  end if;
  if p_hasta < p_desde then
    raise exception 'La fecha de fin no puede ser anterior a la de inicio';
  end if;

  select arranque_fiscal_el into v_arranque from public.ajustes_tienda where id;

  -- ── Devengado: lo repercutido en las ventas del periodo ──────────────────
  --
  -- El filtro es `devengado_el`, NO `created_at`. Y no hace falta filtrar por
  -- estado: un pedido tiene fecha de devengo si y solo si el cobro ocurrió, así
  -- que los PENDIENTE_PAGO y los cancelados antes de cobrar quedan fuera solos.
  -- Eso es lo que arregla el agujero 1.
  with venta as (
    select pv.iva_pct, pv.base, pv.cuota, pv.pedido_id
    from public.pedido_iva pv
    join public.pedidos p on p.id = pv.pedido_id
    where p.devengado_el is not null
      and public.dia_fiscal(p.devengado_el) between p_desde and p_hasta
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'iva_pct', t.iva_pct, 'base', t.base, 'cuota', t.cuota, 'documentos', t.documentos
    ) order by t.iva_pct), '[]'::jsonb),
    coalesce(sum(t.base), 0),
    coalesce(sum(t.cuota), 0)
  into v_devengado, v_d_base, v_d_cuota
  from (
    select iva_pct, sum(base) as base, sum(cuota) as cuota,
           count(distinct pedido_id) as documentos
    from venta group by iva_pct
  ) t;

  -- ── Rectificado: las devoluciones del periodo ───────────────────────────
  --
  -- Por la fecha en que se DEVOLVIÓ, no la de la venta. Es lo correcto y además
  -- lo único posible: una devolución de enero sobre una venta de diciembre no
  -- puede reabrir un trimestre ya presentado; se rectifica en el trimestre en
  -- que ocurre.
  --
  -- El tipo sale de `pedido_items.iva_pct`, que es el snapshot de lo que se
  -- aplicó al vender (062). Nunca del catálogo: si Hacienda cambia un tipo, la
  -- devolución tiene que rectificar al tipo con el que se cobró.
  --
  -- `importe` es CON IVA (copia de cantidad × precio_unitario), así que la base
  -- se deriva dividiendo, y la cuota se saca RESTANDO para que base + cuota sea
  -- exactamente lo devuelto. Idéntico a `recalcular_iva_pedido`.
  with devolucion as (
    select rl.refund_id, i.iva_pct, sum(rl.importe) as con_iva, count(*) as lineas
    from public.reembolso_lineas rl
    join public.pedido_items i on i.id = rl.pedido_item_id
    where public.dia_fiscal(rl.created_at) between p_desde and p_hasta
    group by rl.refund_id, i.iva_pct
  ),
  por_documento as (
    select
      refund_id,
      iva_pct,
      round(con_iva / (1 + iva_pct / 100), 2) as base,
      con_iva - round(con_iva / (1 + iva_pct / 100), 2) as cuota
    from devolucion
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'iva_pct', t.iva_pct, 'base', t.base, 'cuota', t.cuota, 'documentos', t.documentos
    ) order by t.iva_pct), '[]'::jsonb),
    coalesce(sum(t.base), 0),
    coalesce(sum(t.cuota), 0)
  into v_rectificado, v_r_base, v_r_cuota
  from (
    select iva_pct, sum(base) as base, sum(cuota) as cuota,
           count(distinct refund_id) as documentos
    from por_documento group by iva_pct
  ) t;

  -- ── Deducible: lo soportado en las compras del periodo ──────────────────
  --
  -- ⚠️ POR `created_at`, LA FECHA DE REGISTRO, NO POR LA DE LA FACTURA. Y es una
  -- decisión, no un descuido de no tener el otro dato: el IVA soportado se
  -- deduce en el periodo en que la factura queda ANOTADA en el libro registro.
  -- Una factura de diciembre que llega y se anota en enero se deduce en enero.
  -- Usar la fecha de expedición reabriría trimestres ya presentados cada vez que
  -- llega una factura con retraso.
  --
  -- ⚠️ Y hay que preguntárselo a la gestoría, que es quien lo presenta. Está
  -- apuntado en ESTADO.md junto a Verifactu.
  --
  -- Aquí los costes son SIN IVA (la 029 guarda `costo_unitario` neto), al
  -- contrario que los precios de venta. Así que la cuota se MULTIPLICA, no se
  -- deriva. Agrupando por (factura, tipo) antes de redondear, igual que hizo la
  -- propia 029 al calcular `total_iva`.
  with compra as (
    select fci.factura_id, fci.iva_pct,
           sum(fci.cantidad * fci.costo_unitario) as base_bruta
    from public.factura_compra_items fci
    join public.facturas_compra f on f.id = fci.factura_id
    where fci.iva_pct is not null
      and fci.costo_unitario is not null
      and public.dia_fiscal(f.created_at) between p_desde and p_hasta
    group by fci.factura_id, fci.iva_pct
  ),
  por_documento as (
    select factura_id, iva_pct,
           round(base_bruta, 2) as base,
           round(base_bruta * iva_pct / 100, 2) as cuota
    from compra
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'iva_pct', t.iva_pct, 'base', t.base, 'cuota', t.cuota, 'documentos', t.documentos
    ) order by t.iva_pct), '[]'::jsonb),
    coalesce(sum(t.base), 0),
    coalesce(sum(t.cuota), 0)
  into v_deducible, v_c_base, v_c_cuota
  from (
    select iva_pct, sum(base) as base, sum(cuota) as cuota,
           count(distinct factura_id) as documentos
    from por_documento group by iva_pct
  ) t;

  -- ── Los avisos ─────────────────────────────────────────────────────────
  --
  -- ⚠️⚠️ ESTA PARTE NO ES DECORACIÓN, es la mitad del valor del informe. Un
  -- número solo sirve si se sabe qué NO está contando. Un informe que sale
  -- limpio escondiendo lo que no sabe es peor que uno que no sale.

  -- 1. El aviso de fondo: esto no se soporta con facturas expedidas.
  v_avisos := v_avisos || jsonb_build_object(
    'clase', 'sin_facturas_emitidas',
    'gravedad', 'aviso',
    'titulo', 'Liquidado desde los pedidos, no desde facturas emitidas',
    'detalle', 'Todavía no existe la serie de facturas a clientes (Capa 2, pendiente de '
               'confirmar Verifactu). El IVA y los importes son los mismos, pero un 303 se '
               'soporta con el libro de facturas expedidas. Consúltalo con la gestoría antes '
               'de presentar.',
    'cuantos', 0,
    'referencias', '[]'::jsonb
  );

  -- 2. Periodo anterior al arranque fiscal: son datos de prueba.
  if v_arranque is null then
    v_avisos := v_avisos || jsonb_build_object(
      'clase', 'sin_arranque_fiscal',
      'gravedad', 'grave',
      'titulo', 'La tienda sigue en modo pruebas',
      'detalle', 'No se ha marcado el arranque fiscal (TI → Ajustes), así que estas ventas '
                 'son de prueba y pueden borrarse. Nada de esto se presenta.',
      'cuantos', 0, 'referencias', '[]'::jsonb
    );
  elsif public.dia_fiscal(v_arranque) > p_desde then
    v_avisos := v_avisos || jsonb_build_object(
      'clase', 'periodo_antes_del_arranque',
      'gravedad', 'grave',
      'titulo', 'El periodo empieza antes del arranque fiscal',
      'detalle', 'El arranque fiscal es el ' || to_char(public.dia_fiscal(v_arranque), 'DD/MM/YYYY') ||
                 '. Lo anterior a esa fecha son datos de prueba y no debería declararse.',
      'cuantos', 0, 'referencias', '[]'::jsonb
    );
  end if;

  -- 3. Facturas de compra del periodo sin fecha de expedición.
  select count(*), string_agg(numero_factura, ', ' order by numero_factura)
  into v_cuantos, v_refs
  from public.facturas_compra
  where fecha_factura is null
    and public.dia_fiscal(created_at) between p_desde and p_hasta;

  if v_cuantos > 0 then
    v_avisos := v_avisos || jsonb_build_object(
      'clase', 'compra_sin_fecha_factura',
      'gravedad', 'aviso',
      'titulo', v_cuantos || ' factura(s) de compra sin fecha de expedición',
      'detalle', 'El libro registro de facturas recibidas exige la fecha que puso el '
                 'proveedor. Su IVA SÍ se está deduciendo (el periodo lo decide la fecha de '
                 'registro), pero falta el dato: cógelo del PDF y complétalo en Compras.',
      'cuantos', v_cuantos,
      'referencias', to_jsonb(string_to_array(coalesce(v_refs, ''), ', '))
    );
  end if;

  -- 4. Líneas de compra sin tipo de IVA: son de antes de la 029 y su IVA NO se
  --    está deduciendo. Este aviso vale dinero de verdad.
  select count(distinct f.id), string_agg(distinct f.numero_factura, ', ')
  into v_cuantos, v_refs
  from public.facturas_compra f
  join public.factura_compra_items fci on fci.factura_id = f.id
  where (fci.iva_pct is null or fci.costo_unitario is null)
    and public.dia_fiscal(f.created_at) between p_desde and p_hasta;

  if v_cuantos > 0 then
    v_avisos := v_avisos || jsonb_build_object(
      'clase', 'compra_sin_iva_por_linea',
      'gravedad', 'grave',
      'titulo', v_cuantos || ' factura(s) de compra con líneas sin tipo de IVA',
      'detalle', 'Son anteriores a que las compras guardaran el IVA por línea. Ese IVA '
                 'soportado NO se está deduciendo, así que el resultado sale más alto de lo '
                 'que debería.',
      'cuantos', v_cuantos,
      'referencias', to_jsonb(string_to_array(coalesce(v_refs, ''), ', '))
    );
  end if;

  -- 5. El desglose por tipo de una compra no cuadra con el total que guardó su
  --    factura. La 029 redondeó el IVA una vez sobre la factura entera; esto lo
  --    redondea por tipo, y con varios tipos pueden diferir en céntimos. Mismo
  --    espíritu que el guardia de `recalcular_iva_pedido`, pero como AVISO: el
  --    informe tiene que seguir saliendo para poder ver el descuadre.
  select count(*), string_agg(numero_factura, ', ' order by numero_factura)
  into v_cuantos, v_refs
  from (
    select f.id, f.numero_factura, f.total_iva,
           sum(round(g.base_bruta * g.iva_pct / 100, 2)) as por_tipo
    from public.facturas_compra f
    join (
      select factura_id, iva_pct, sum(cantidad * costo_unitario) as base_bruta
      from public.factura_compra_items
      where iva_pct is not null and costo_unitario is not null
      group by factura_id, iva_pct
    ) g on g.factura_id = f.id
    where public.dia_fiscal(f.created_at) between p_desde and p_hasta
      and f.total_iva is not null
    group by f.id, f.numero_factura, f.total_iva
  ) d
  where abs(d.por_tipo - d.total_iva) > 0.005;

  if v_cuantos > 0 then
    v_avisos := v_avisos || jsonb_build_object(
      'clase', 'compra_descuadre_por_tipo',
      'gravedad', 'aviso',
      'titulo', v_cuantos || ' factura(s) con céntimos de diferencia al desglosar por tipo',
      'detalle', 'El IVA total de la factura se redondeó de una vez y aquí se redondea por '
                 'tipo, que es como se declara. La diferencia es de céntimos y el desglose '
                 'por tipo es el bueno, pero conviene mirarlo.',
      'cuantos', v_cuantos,
      'referencias', to_jsonb(string_to_array(coalesce(v_refs, ''), ', '))
    );
  end if;

  -- 6. La anomalía de negocio: pedidos CANCELADOS que ya habían devengado y de
  --    los que no consta devolución. Cancelar desde PROCESANDO está permitido y
  --    NO devuelve el dinero, así que su IVA sigue declarado sin rectificativa.
  select count(*), string_agg(numero_pedido, ', ' order by numero_pedido)
  into v_cuantos, v_refs
  from public.pedidos p
  where p.estado = 'CANCELADO'
    and p.devengado_el is not null
    and public.dia_fiscal(p.devengado_el) between p_desde and p_hasta
    and not exists (select 1 from public.reembolso_lineas rl where rl.pedido_id = p.id);

  if v_cuantos > 0 then
    v_avisos := v_avisos || jsonb_build_object(
      'clase', 'cancelado_ya_cobrado_sin_devolucion',
      'gravedad', 'grave',
      'titulo', v_cuantos || ' pedido(s) cancelados después de cobrar, sin devolución',
      'detalle', 'Su IVA está declarado como devengado —la venta ocurrió— y no consta que se '
                 'haya devuelto el dinero. O se devuelve (y rectifica), o alguien tiene que '
                 'explicar por qué se cobró y se canceló.',
      'cuantos', v_cuantos,
      'referencias', to_jsonb(string_to_array(coalesce(v_refs, ''), ', '))
    );
  end if;

  -- 7. Devoluciones reconstruidas por esta migración. No se presenciaron: se
  --    dedujeron del estado del pedido, así que quien firme debe saberlo.
  select count(distinct rl.pedido_id), string_agg(distinct p.numero_pedido, ', ')
  into v_cuantos, v_refs
  from public.reembolso_lineas rl
  join public.pedidos p on p.id = rl.pedido_id
  where rl.refund_id like 'retro:%'
    and public.dia_fiscal(rl.created_at) between p_desde and p_hasta;

  if v_cuantos > 0 then
    v_avisos := v_avisos || jsonb_build_object(
      'clase', 'devolucion_reconstruida',
      'gravedad', 'aviso',
      'titulo', v_cuantos || ' devolución(es) reconstruidas, no registradas en su momento',
      'detalle', 'Se devolvió el dinero antes de que la aplicación apuntara qué artículos. El '
                 'desglose se ha deducido de las líneas del pedido y del precio al que se '
                 'vendieron; es correcto salvo que la devolución fuera parcial y solo se '
                 'anotara el importe.',
      'cuantos', v_cuantos,
      'referencias', to_jsonb(string_to_array(coalesce(v_refs, ''), ', '))
    );
  end if;

  return jsonb_build_object(
    'desde', p_desde,
    'hasta', p_hasta,
    'zona', 'Europe/Madrid',
    'arranque_fiscal_el', v_arranque,
    'devengado', v_devengado,
    'rectificado', v_rectificado,
    'deducible', v_deducible,
    'totales', jsonb_build_object(
      'devengado_base', v_d_base,
      'devengado_cuota', v_d_cuota,
      'rectificado_base', v_r_base,
      'rectificado_cuota', v_r_cuota,
      -- Lo repercutido de verdad: las ventas menos lo devuelto.
      'repercutido_base', v_d_base - v_r_base,
      'repercutido_cuota', v_d_cuota - v_r_cuota,
      'deducible_base', v_c_base,
      'deducible_cuota', v_c_cuota,
      -- Positivo = a ingresar. Negativo = a compensar en el periodo siguiente.
      'resultado', (v_d_cuota - v_r_cuota) - v_c_cuota
    ),
    'avisos', v_avisos
  );
end;
$$;

comment on function public.liquidacion_iva(date, date) is
  'Modelo 303 de un periodo: devengado por tipo, rectificado por devoluciones, '
  'deducible de compras, el resultado y los avisos de lo que NO está contando. '
  'Solo lee; no acumula en ninguna tabla. Ver la 068.';

-- ---------------------------------------------------------------------------
-- 7. Fuera del alcance de la clave pública
-- ---------------------------------------------------------------------------
--
-- La regla de la 062: revocar a los TRES (`public` por la herencia de Postgres,
-- `anon` y `authenticated` por el grant que pone Supabase con
-- `alter default privileges`) y COMPROBARLO, sin dar por hecho que el REVOKE
-- hizo algo — un REVOKE que no quita nada no protesta.
revoke execute on function public.liquidacion_iva(date, date) from public, anon, authenticated;
revoke execute on function public.dia_fiscal(timestamptz) from public, anon, authenticated;
revoke execute on function public.pedido_estado_devenga(public.pedido_estado) from public, anon, authenticated;
revoke execute on function public.pedido_marca_devengo() from public, anon, authenticated;

do $comprobar$
declare
  v_abiertas text;
begin
  select string_agg(f.nombre, ', ')
  into v_abiertas
  from (values
    ('public.liquidacion_iva(date, date)'),
    ('public.dia_fiscal(timestamptz)'),
    ('public.pedido_estado_devenga(public.pedido_estado)'),
    ('public.pedido_marca_devengo()'),
    ('public.fijar_fecha_factura_compra(uuid, date)'),
    ('public.reembolsar_pedido_total(uuid, uuid, text)'),
    ('public.registrar_factura_compra(text, jsonb, text, uuid, text, uuid, date)')
  ) as f(nombre)
  where has_function_privilege('anon', f.nombre, 'EXECUTE')
     or has_function_privilege('authenticated', f.nombre, 'EXECUTE');

  if v_abiertas is not null then
    raise exception 'Estas funciones siguen siendo ejecutables desde internet: %', v_abiertas;
  end if;
end
$comprobar$;
