-- ============================================================
-- 080 — El coste del envío
--
-- ⚠️⚠️ HASTA HOY LA TIENDA ENVIABA GRATIS A TODA ESPAÑA, Y NO POR UNA DECISIÓN
-- COMERCIAL: no existía el concepto. Ni columna, ni campo en el checkout, ni
-- línea en la factura. `pedidos` solo tenía una columna de dinero —`total`— y
-- valía la suma de los artículos. Se vendían Quipitos de 0,62 € con el porte
-- pagado por la casa.
--
-- ── Por qué esto NO es trabajo de pantalla ───────────────────────────────────
--
-- El dinero cobrado entra en la base imponible del IVA, así que tocar el envío
-- es tocar `pedido_iva`, las líneas de la factura, el 303 y las rectificativas.
-- Y hay una ventana: `ajustes_tienda.arranque_fiscal_el` sigue NULL, así que la
-- cadena de huellas todavía se puede recalcular. Después, no.
--
-- ── §0 · LAS TRES DECISIONES, Y POR QUÉ ──────────────────────────────────────
--
-- 1. **TARIFA PLANA CON UMBRAL DE GRATUIDAD**, dos números en `ajustes_tienda`.
--    Es dato de negocio editable desde el panel, no un secreto de entorno — la
--    razón de ser de la 046. No hay tabla de zonas: el catálogo de municipios es
--    español y una tarifa por zonas arrastra la decisión del IVA de Canarias,
--    que es otra avería (ver el aviso del final).
--
-- 2. **EL ENVÍO SIGUE EL TIPO DE LA MERCANCÍA, REPARTIDO A PRORRATA.** Es el
--    art. 78.Dos.1º LIVA: los portes forman parte de la base imponible de la
--    entrega, no son una prestación de servicios aparte. Con tres tipos vivos en
--    el catálogo (4 %, 10 %, 21 %) un carrito mixto es lo normal, así que el
--    reparto no es un caso raro: es el caso.
--
--    ⚠️ Cobrarlo todo al 21 % —que es lo que hacen muchas tiendas— le cobraría
--    al cliente 21 % sobre el porte de unas galletas al 10 %.
--
-- 3. **EL ENVÍO SE DEVUELVE SOLO EN LA DEVOLUCIÓN ÍNTEGRA.** Lo exige el art.
--    107 RDL 1/2007 en el desistimiento: se devuelven todos los pagos recibidos,
--    portes incluidos. En una devolución PARCIAL no se devuelve, porque el
--    transporte se prestó. Ver §6.
--
-- ── §0.1 · ⚠️⚠️ LA CUENTA PENDIENTE QUE ESTO SALDA ───────────────────────────
--
-- La 078 lo dejó escrito, con estas palabras: «No hay coste de envío ni ningún
-- otro concepto fuera de los artículos […] Si algún día se cobra el envío
-- aparte, esta proporción hay que revisarla: sería dinero declarado que no se
-- puede devolver».
--
-- Era literal. `reembolso_lineas.pedido_item_id` es `not null`, así que el envío
-- no cabe como línea de devolución: metido en `pedido_iva` sin más, devolver
-- TODOS los artículos dejaría el porte declarado para siempre y el 303 con una
-- venta que no vuelve a cero. §6 es la respuesta, y no pasa por tocar
-- `reembolso_lineas`.
--
-- ── §0.2 · EL REPARTO VIVE EN UN SOLO SITIO, Y ES LO MÁS IMPORTANTE DE AQUÍ ──
--
-- El reparto del envío entre tipos lo necesitan TRES sitios: el desglose (§4),
-- las líneas de la factura (§5) y el desglose de la rectificativa (§6).
--
-- ⚠️⚠️ Escribirlo tres veces es EXACTAMENTE el patrón que costó la 074: «el
-- formato del número vivía en tres sitios y la huella certificaba uno mientras
-- la impresión sacaba otro. Mientras coinciden no pasa nada; el día que
-- difieren, nadie lo ve». Aquí sería peor: el documento diría un reparto y el
-- 303 otro, sobre el mismo dinero.
--
-- Así que el reparto es UNA función —`reparto_envio_pedido`, §3— y los tres la
-- llaman. No hay dos aritméticas que puedan divergir.
--
-- ── §0.3 · POR QUÉ EL REDONDEO ES ACUMULADO ──────────────────────────────────
--
-- Repartir 4,95 € entre tres tipos y redondear cada trozo por separado NO suma
-- 4,95 €. Es el mismo céntimo que costó la 078, y la solución es la misma:
--
--     envio_acum(i) = round(envio × Σ_{j≤i} articulos(j) / articulos_total, 2)
--     envio(i)      = envio_acum(i) − envio_acum(i−1)
--
-- La suma es exacta por construcción, no por suerte: el último acumulado es
-- `round(envio × 1, 2)` = `envio`, y los trozos son sus diferencias. Y ningún
-- trozo sale negativo, porque el acumulado no decrece.
--
-- ── §0.4 · LA MIGRACIÓN NO CAMBIA NADA POR SÍ SOLA ───────────────────────────
--
-- `envio_coste` nace en 0, que significa envío gratis: exactamente lo que la
-- tienda hace hoy. Nada cambia hasta que alguien ponga el número en el panel.
--
-- ⚠️ Y aquí el default SÍ es correcto, al contrario que en la 071 (`emisor_nif`
-- sin default, «un dato que parece puesto es un dato que nadie revisa»). La
-- diferencia: un NIF vacío no tiene lectura válida y hay que cazarlo; un coste
-- de envío de 0 tiene una lectura válida, verdadera y conservadora. Los dos
-- pedidos que ya existen se quedan con `coste_envio = 0`, que es la verdad: se
-- enviaron gratis.
-- ============================================================

-- ── §1 · La tarifa, en el panel ──────────────────────────────────────────────

alter table public.ajustes_tienda
  add column if not exists envio_coste        numeric(10,2) not null default 0,
  add column if not exists envio_gratis_desde numeric(10,2);

comment on column public.ajustes_tienda.envio_coste is
  'Gastos de envío de un pedido, con IVA incluido como todos los precios del catálogo. 0 = envío gratis.';
comment on column public.ajustes_tienda.envio_gratis_desde is
  'Subtotal de artículos desde el que el envío es gratis. NULL = no hay umbral, siempre se cobra envio_coste.';

alter table public.ajustes_tienda drop constraint if exists ajustes_envio_coste_no_negativo;
alter table public.ajustes_tienda add constraint ajustes_envio_coste_no_negativo
  check (envio_coste >= 0);

-- Un umbral de 0 no es «gratis desde 0 €»: es una casilla a medio rellenar que
-- haría el envío gratis siempre, sin que nadie lo haya dicho. Se prohíbe para
-- que la única forma de no cobrar envío sea `envio_coste = 0`, que sí lo dice.
alter table public.ajustes_tienda drop constraint if exists ajustes_envio_gratis_desde_positivo;
alter table public.ajustes_tienda add constraint ajustes_envio_gratis_desde_positivo
  check (envio_gratis_desde is null or envio_gratis_desde > 0);

/**
 * LA TARIFA, Y ES EL ÚNICO SITIO QUE LA DECIDE.
 *
 * ⚠️ La llaman la API (para cobrarle al cliente lo que va a pagar) y las dos
 * funciones que crean pedidos. Si la regla viviera además en TypeScript, un
 * cambio en una mitad cobraría un importe distinto del que factura la otra —y el
 * guardia de §4 abortaría DENTRO del webhook de un pago ya cobrado.
 *
 * `p_subtotal` es el de los ARTÍCULOS, con IVA incluido: es lo que ve el cliente
 * en el carrito y con lo que compara el umbral.
 */
create or replace function public.coste_envio_de(p_subtotal numeric)
returns numeric
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select round(coalesce(
    case
      -- Un carrito vacío no paga porte. No debería llegar aquí (las dos
      -- funciones que crean pedidos abortan antes con «carrito vacío»), pero
      -- cobrar 4,95 € de envío de nada sería el peor fallo posible de esta
      -- función y no cuesta nada cerrarlo.
      when p_subtotal is null or p_subtotal <= 0 then 0
      else (
        select case
                 when a.envio_gratis_desde is not null and p_subtotal >= a.envio_gratis_desde then 0
                 else a.envio_coste
               end
        from public.ajustes_tienda a
        where a.id
      )
    end, 0), 2);
$$;

comment on function public.coste_envio_de(numeric) is
  'Los gastos de envío que corresponden a un subtotal de artículos. EL ÚNICO SITIO que aplica la tarifa: la API lo cobra desde aquí y confirmar_venta lo factura desde aquí.';

revoke execute on function public.coste_envio_de(numeric) from public, anon, authenticated;

-- ── §2 · Dónde se guarda ─────────────────────────────────────────────────────

alter table public.pedidos
  add column if not exists coste_envio numeric(10,2) not null default 0;

comment on column public.pedidos.coste_envio is
  'Gastos de envío cobrados en este pedido, IVA incluido. Está DENTRO de `total`. 0 = se envió gratis.';

alter table public.pedidos drop constraint if exists pedidos_coste_envio_no_negativo;
alter table public.pedidos add constraint pedidos_coste_envio_no_negativo
  check (coste_envio >= 0);

/**
 * ⚠️⚠️ EL SNAPSHOT DEL ENVÍO COBRADO, Y ES UN ARREGLO DE RIESGO REAL.
 *
 * El importe se cobra en un sitio (`create-payment-intent`, con el total del
 * carrito) y el pedido se crea en OTRO (el webhook, minutos después). Y el
 * webhook no compara `intent.amount` con `pedidos.total`: lo recalcula.
 *
 * Con los artículos eso ya está resuelto —`carrito_items.precio_unitario` es una
 * copia del precio del catálogo, no una lectura viva—. Con el envío no lo
 * estaría: una edición de la tarifa en el panel entre el cobro y el webhook
 * dejaría al cliente pagando 4,95 € y al pedido diciendo 6,95 €, en silencio.
 *
 * Así que el envío se congela aquí en el momento de cobrar, igual que el precio.
 * `checkout_datos` es exactamente para esto: «staging de datos de checkout por
 * sesión para webhooks» (019).
 *
 * NULL = no hay snapshot (una sesión anterior a esta migración, o un webhook que
 * llega pasadas las 48 h de la limpieza). Entonces se aplica la tarifa de hoy,
 * que es lo único que se puede hacer.
 */
alter table public.checkout_datos
  add column if not exists coste_envio numeric(10,2);

comment on column public.checkout_datos.coste_envio is
  'Los gastos de envío que se le COBRARON al cliente en esta sesión. Snapshot, igual que carrito_items.precio_unitario: protege de que una edición de la tarifa en el panel desincronice lo cobrado y lo facturado. NULL = sin snapshot, se aplica la tarifa vigente.';

/**
 * A QUÉ REEMBOLSO SE LE FUE EL ENVÍO. Ver §6 para el porqué de que sea esto y no
 * una fila en `reembolso_lineas`.
 *
 * La fecha va aparte porque una devolución que SOLO devuelve el porte no deja
 * ninguna línea en `reembolso_lineas`, y de ahí sacaba la 077 el trimestre en
 * que el 303 netea la rectificativa.
 */
alter table public.pedidos
  add column if not exists envio_devuelto_en_refund text,
  add column if not exists envio_devuelto_el        date;

comment on column public.pedidos.envio_devuelto_en_refund is
  'El refund que devolvió los gastos de envío, o NULL si no se han devuelto. Lo pone reembolsar_pedido_total al cerrar el pedido; es lo que hace que la rectificativa de ese reembolso rectifique también el porte.';

-- ── §3 · ⭐ EL REPARTO, Y VIVE SOLO AQUÍ ─────────────────────────────────────
--
-- Ver §0.2 (por qué una sola función) y §0.3 (por qué el redondeo es acumulado).
--
-- Devuelve una fila por tipo de IVA presente en el pedido, con lo que aporta de
-- artículos y lo que le toca de envío. `articulos + envio` es el importe CON IVA
-- de ese tipo, que es lo que hay que desglosar.
--
-- ⚠️ Sin artículos no devuelve NADA, ni siquiera el envío. Es a propósito: no
-- hay tipo de IVA al que imputar un porte sin mercancía, y un pedido así no debe
-- existir. Si llegara a existir, el guardia de §4 lo canta.

create or replace function public.reparto_envio_pedido(p_pedido_id uuid)
returns table (iva_pct numeric, articulos numeric, envio numeric)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  with g as (
    select pi.iva_pct, sum(pi.precio_unitario * pi.cantidad) as articulos
    from public.pedido_items pi
    where pi.pedido_id = p_pedido_id
    group by pi.iva_pct
  ),
  t as (
    select coalesce(sum(g.articulos), 0) as articulos_total,
           (select coalesce(p.coste_envio, 0)
            from public.pedidos p where p.id = p_pedido_id) as envio
    from g
  ),
  acum as (
    select g.iva_pct,
           g.articulos,
           -- El `case` no es defensivo por si acaso: un catálogo con precio 0
           -- daría articulos_total = 0 y una división por cero. Sin artículos que
           -- ponderen, no hay reparto posible.
           case when t.articulos_total > 0
                then round(
                       t.envio * sum(g.articulos) over (
                         order by g.iva_pct
                         rows between unbounded preceding and current row
                       ) / t.articulos_total, 2)
                else 0
           end as envio_acum
    from g cross join t
  )
  select a.iva_pct,
         a.articulos,
         a.envio_acum - coalesce(lag(a.envio_acum) over (order by a.iva_pct), 0)
  from acum a;
$$;

comment on function public.reparto_envio_pedido(uuid) is
  'Reparte los gastos de envío del pedido entre los tipos de IVA de sus artículos, a prorrata y con redondeo acumulado (la suma es exacta). EL ÚNICO SITIO que lo calcula: lo usan el desglose (062), las líneas de la factura (072) y la rectificativa (078).';

revoke execute on function public.reparto_envio_pedido(uuid) from public, anon, authenticated;

-- ── §4 · El desglose, con el envío dentro ────────────────────────────────────
--
-- Reemplaza a la de la 062. Cambia UNA cosa: de dónde sale `con_iva`. Antes eran
-- los artículos agrupados por tipo; ahora es lo mismo más su parte del envío,
-- que da §3.
--
-- ⚠️⚠️ Y LA REGLA DE REDONDEO NO SE TOCA. Sigue viviendo solo aquí: se agrupa
-- por tipo, se suma el importe CON IVA del grupo y se deriva la base UNA vez; la
-- cuota se saca RESTANDO, nunca multiplicando. Es lo que hace que `base + cuota`
-- sea exactamente lo cobrado.
--
-- ⚠️ EL GUARDIA NO CAMBIA NI UNA LETRA, y eso es la comprobación de que esto
-- está bien: el invariante «el desglose suma exactamente lo cobrado» ahora cubre
-- también el envío, sin haber tenido que relajarlo. Su propio comentario de la
-- 062 ya lo anticipaba: «Si algún día cambia cómo se calcula el total del pedido
-- —unos gastos de envío, un descuento—, esto salta aquí».

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

  -- ⚠️⚠️ LA REGLA DE REDONDEO, Y VIVE SOLO AQUÍ. Ver la cabecera de la 062: los
  -- precios son PVP CON IVA incluido, la base se deriva dividiendo el importe
  -- AGREGADO del grupo (no línea a línea: salen bases distintas) y la cuota se
  -- saca restando para que base + cuota sea exactamente lo cobrado.
  insert into pedido_iva (pedido_id, iva_pct, base, cuota)
  select
    p_pedido_id,
    r.iva_pct,
    round((r.articulos + r.envio) / (1 + r.iva_pct / 100), 2),
    (r.articulos + r.envio) - round((r.articulos + r.envio) / (1 + r.iva_pct / 100), 2)
  from public.reparto_envio_pedido(p_pedido_id) r;

  -- El desglose tiene que sumar EXACTAMENTE lo cobrado. Si algún día cambia
  -- cómo se calcula el total del pedido —otro concepto, un descuento—, esto
  -- salta aquí, en el momento de la venta, y no en el modelo 303 tres meses
  -- después con el trimestre ya cerrado.
  --
  -- ⚠️ Desde la 080 esto cubre también el envío, y es además lo que caza que
  -- alguien edite `pedidos.coste_envio` de un pedido ya creado: el trigger del
  -- desglose escucha a `pedido_items`, no a `pedidos`, así que un cambio a mano
  -- no recalcula nada — pero la siguiente factura de ese pedido no se emite.
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

revoke execute on function public.recalcular_iva_pedido(uuid) from public, anon, authenticated;

-- ── §5 · Cobrarlo, guardarlo y facturarlo ────────────────────────────────────
--
-- Las dos funciones que crean pedidos suman ahora el envío al total, y la
-- factura lo saca como línea.
--
-- ⚠️⚠️ LA LÍNEA DEL ENVÍO VA UNA POR TIPO DE IVA, y no una sola sin tipo. Con un
-- carrito mixto el porte se reparte (§3), así que una línea única no tendría un
-- tipo que declarar: habría que imprimirla sin tipo, o con uno falso.
--
-- Se eligió por tipo por tres razones, en este orden:
--   1. El art. 6.1.f RD 1619/2012 pide que la factura exprese el tipo aplicado.
--      Una línea sin tipo mientras el desglose lleva dos es un documento que no
--      se explica solo — y esto va a la gestoría.
--   2. `factura-pdf.service.ts` imprime `${l.iva_pct} %` de cada línea. Sin tipo
--      saldría «undefined %», y el PDF es el sitio con la trampa del
--      `nest-cli.json` que funciona en local y falla en Render: cuanto menos se
--      toque, mejor.
--   3. El desglose queda atribuible línea a línea.
--
-- Con un carrito de un solo tipo —el caso corriente— sale UNA línea de envío.

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
  v_articulos    numeric(10,2);
  v_coste_envio  numeric(10,2);
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
  into v_articulos, v_producto_ids
  from carrito_items ci where ci.carrito_id = v_carrito_id;

  if v_articulos is null then
    raise exception 'Carrito vacio al confirmar el pago (carrito %)', v_carrito_id;
  end if;

  /**
   * ⭐ EL ENVÍO QUE SE LE COBRÓ, NO EL DE LA TARIFA DE AHORA. Ver §2: entre el
   * cobro y este webhook pueden pasar minutos, y si alguien edita la tarifa en el
   * panel a mitad, recalcularla aquí facturaría un importe distinto del cobrado
   * —y en silencio, porque nadie compara `intent.amount` con `pedidos.total`.
   *
   * Sin snapshot (sesión previa a la 080, o webhook pasadas las 48 h de la
   * limpieza de `checkout_datos`) se aplica la tarifa vigente: es lo único que se
   * puede hacer, y con `envio_coste` en 0 sale 0, que es el comportamiento de
   * siempre.
   */
  select cd.coste_envio into v_coste_envio
  from checkout_datos cd where cd.session_id = p_session_id;

  v_coste_envio := coalesce(v_coste_envio, coste_envio_de(v_articulos));
  v_total       := v_articulos + v_coste_envio;

  -- El snapshot manda; si no viene, se arma desde la dirección guardada.
  if v_envio is null and p_direccion_envio_id is not null then
    select to_jsonb(d) into v_envio
    from (select nombre_destinatario, linea1, linea2, ciudad, codigo_postal, provincia, pais,
                 telefono
          from direcciones_envio where id = p_direccion_envio_id) d;
  end if;

  -- ⚠️ EL ORDEN IMPORTA Y YA ERA EL BUENO: el pedido se inserta ANTES que sus
  -- líneas, y el trigger del desglose (§4) lee `pedidos.coste_envio`. Al revés,
  -- el reparto se haría sobre un envío de 0 y el guardia abortaría la venta.
  insert into pedidos (
    numero_pedido, user_id, estado, total, coste_envio, metodo_pago, referencia_pago,
    direccion_envio_id, email_cliente, documento_cliente,
    envio_nombre, envio_linea1, envio_linea2, envio_ciudad,
    envio_codigo_postal, envio_provincia, envio_pais,
    envio_telefono
  ) values (
    generar_numero_pedido(p_metodo_pago), p_user_id, 'PROCESANDO', v_total, v_coste_envio,
    p_metodo_pago, p_referencia_pago, p_direccion_envio_id,
    lower(nullif(p_email_cliente, '')), nullif(p_documento_cliente, ''),
    v_envio->>'nombre_destinatario', v_envio->>'linea1', v_envio->>'linea2',
    v_envio->>'ciudad', v_envio->>'codigo_postal', v_envio->>'provincia', v_envio->>'pais',
    nullif(v_envio->>'telefono', '')
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

-- ── La transferencia, con el mismo criterio ──────────────────────────────────
-- Aquí el pedido se crea en la misma petición que lo pide, así que no hay
-- ventana entre cobrar y facturar: no hay nada cobrado todavía. Aun así lee el
-- MISMO snapshot, porque el checkout ya lo guardó y usar dos fuentes según el
-- método de pago es la clase de asimetría que nadie recuerda seis meses después.

create or replace function public.crear_pedido_transferencia(
  p_session_id           uuid,
  p_usuario_autenticado  uuid,
  p_user_id              uuid,
  p_clave_idempotencia   text,
  p_dias_plazo           integer default 3,
  p_direccion_envio_id   uuid    default null,
  p_email_cliente        text    default null,
  p_documento_cliente    text    default null,
  p_envio                jsonb   default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pedido_id    uuid;
  v_carrito_id   uuid;
  v_articulos    numeric(10,2);
  v_coste_envio  numeric(10,2);
  v_total        numeric(10,2);
  v_envio        jsonb := p_envio;
  v_producto_ids uuid[];
  v_referencia   text;
  v_vence        timestamptz;
  v_reservadas   integer;
begin
  if p_clave_idempotencia is null or p_clave_idempotencia = '' then
    raise exception 'Falta la clave de idempotencia del checkout';
  end if;

  v_referencia := 'transferencia:' || p_clave_idempotencia;

  perform pg_advisory_xact_lock(hashtext('confirmar_venta:' || v_referencia));

  select id into v_pedido_id from pedidos where referencia_pago = v_referencia;
  if v_pedido_id is not null then
    return v_pedido_id;
  end if;

  if p_usuario_autenticado is not null then
    select id into v_carrito_id from carritos where user_id = p_usuario_autenticado;
  else
    select id into v_carrito_id
    from carritos
    where session_id = p_session_id and user_id is null;
  end if;

  if v_carrito_id is null then
    raise exception 'Carrito no encontrado al iniciar la transferencia (sesion %)', p_session_id;
  end if;

  select sum(ci.precio_unitario * ci.cantidad), array_agg(ci.producto_id)
  into v_articulos, v_producto_ids
  from carrito_items ci
  where ci.carrito_id = v_carrito_id;

  if v_articulos is null then
    raise exception 'Carrito vacio al iniciar la transferencia (carrito %)', v_carrito_id;
  end if;

  select cd.coste_envio into v_coste_envio
  from checkout_datos cd where cd.session_id = p_session_id;

  v_coste_envio := coalesce(v_coste_envio, coste_envio_de(v_articulos));
  v_total       := v_articulos + v_coste_envio;

  select count(*) into v_reservadas
  from stock_reservas sr
  where sr.producto_id = any (v_producto_ids)
    and sr.pedido_id is null
    and (
      (p_usuario_autenticado is not null and sr.user_id = p_usuario_autenticado)
      or sr.session_id = p_session_id
    );

  if v_reservadas = 0 then
    raise exception 'La reserva del carrito ha caducado; vuelve a intentarlo'
      using errcode = 'P0003';
  end if;

  if v_envio is null and p_direccion_envio_id is not null then
    select to_jsonb(d) into v_envio
    from (
      select nombre_destinatario, linea1, linea2, ciudad, codigo_postal, provincia, pais
      from direcciones_envio
      where id = p_direccion_envio_id
    ) d;
  end if;

  v_vence := sumar_dias_laborables(now(), p_dias_plazo);

  insert into pedidos (
    numero_pedido, user_id, estado, total, coste_envio, metodo_pago, referencia_pago,
    direccion_envio_id, email_cliente, documento_cliente, pago_vence_el,
    envio_nombre, envio_linea1, envio_linea2, envio_ciudad,
    envio_codigo_postal, envio_provincia, envio_pais, envio_telefono
  )
  values (
    generar_numero_pedido('transferencia'),
    p_user_id,
    'PENDIENTE_PAGO',
    v_total,
    v_coste_envio,
    'transferencia',
    v_referencia,
    p_direccion_envio_id,
    lower(nullif(p_email_cliente, '')),
    nullif(p_documento_cliente, ''),
    v_vence,
    v_envio->>'nombre_destinatario',
    v_envio->>'linea1',
    v_envio->>'linea2',
    v_envio->>'ciudad',
    v_envio->>'codigo_postal',
    v_envio->>'provincia',
    v_envio->>'pais',
    v_envio->>'telefono'
  )
  returning id into v_pedido_id;

  insert into pedido_items (pedido_id, producto_id, nombre_producto, cantidad, precio_unitario)
  select v_pedido_id, ci.producto_id, p.nombre, ci.cantidad, ci.precio_unitario
  from carrito_items ci
  join productos p on p.id = ci.producto_id
  where ci.carrito_id = v_carrito_id;

  update stock_reservas sr
  set pedido_id  = v_pedido_id,
      expires_at = v_vence
  where sr.producto_id = any (v_producto_ids)
    and sr.pedido_id is null
    and (
      (p_usuario_autenticado is not null and sr.user_id = p_usuario_autenticado)
      or sr.session_id = p_session_id
    );

  -- ⚠️ AQUÍ NO SE VACÍA EL CARRITO. Elegir transferencia no es pagar: quien
  -- cambie de idea y vuelva a la tarjeta tiene que encontrar su compra donde
  -- la dejó. Se vacía al confirmar el ingreso.
  return v_pedido_id;
end;
$$;

revoke execute on function public.crear_pedido_transferencia(uuid, uuid, uuid, text, integer, uuid, text, text, jsonb)
  from public, anon, authenticated;

-- ── La factura, con el envío como línea ──────────────────────────────────────
-- Se reemplaza entera porque `emitir_factura` es una sola función: lo único que
-- cambia es el bloque `v_lineas`. El resto —el cerrojo de la cadena, la
-- idempotencia asimétrica, el guardia del emisor, el desglose que se copia, la
-- numeración con contador y la huella— es de la 072, la 073, la 074 y la 077, y
-- va copiado tal cual.

create or replace function public.emitir_factura(
  p_pedido_id       uuid,
  p_tipo            public.factura_tipo,
  p_receptor        jsonb default null,
  p_lineas          jsonb default null,
  p_desglose        jsonb default null,
  p_rectifica_a     uuid  default null,
  p_sustituye_a     uuid  default null,
  p_actor_id        uuid  default null,
  -- NULL = la fecha de devengo de la venta, que es lo correcto para todo menos
  -- una rectificativa.
  p_fecha_operacion date  default null,
  p_refund_id       text  default null
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

  -- ⚠️⚠️ IDEMPOTENCIA ASIMÉTRICA (072/073):
  --   · Pedir una SIMPLIFICADA cuando ya hay una completa devuelve la completa.
  --   · Pedir una COMPLETA cuando hay una simplificada SÍ sigue: ese es el canje.
  --   · Una RECTIFICATIVA no entra aquí: puede haber varias por pedido, una por
  --     devolución. Su idempotencia es por `refund_id` y la lleva
  --     `emitir_rectificativa` más el índice único de la 073.
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
  -- dinero y una casilla sin rellenar en Ajustes no puede tumbar una venta.
  v_emisor := emisor_fiscal();
  if v_emisor is null then
    insert into factura_eventos (evento, detalle, actor_id)
    values ('emision_sin_emisor',
            jsonb_build_object('pedido_id', p_pedido_id, 'tipo', p_tipo),
            p_actor_id);
    return null;
  end if;

  /**
   * ⚠️ Los precios son PVP CON IVA INCLUIDO. El desglose separa base y cuota.
   *
   * ⬇️ EL CAMBIO DE LA 080: los gastos de envío salen como línea, UNA POR TIPO DE
   * IVA, y el reparto lo da `reparto_envio_pedido` — la MISMA función que usó el
   * desglose al declarar la venta. Ver §5 para por qué una por tipo, y §0.2 para
   * por qué no se recalcula aquí.
   *
   * El `where r.envio > 0` deja fuera tanto los pedidos sin envío (los de antes
   * de la 080 y los que caen bajo el umbral de gratuidad) como los tipos a los
   * que el reparto no asignó nada.
   */
  v_lineas := coalesce(p_lineas, (
    select jsonb_agg(x.linea order by x.orden, x.nombre, x.iva_pct)
    from (
      select 0 as orden, pi.nombre_producto as nombre, pi.iva_pct,
             jsonb_build_object(
               'nombre',          pi.nombre_producto,
               'cantidad',        pi.cantidad,
               'precio_unitario', pi.precio_unitario,
               'iva_pct',         pi.iva_pct,
               'importe',         round(pi.cantidad * pi.precio_unitario, 2)
             ) as linea
      from pedido_items pi where pi.pedido_id = p_pedido_id
      union all
      select 1, 'Gastos de envío', r.iva_pct,
             jsonb_build_object(
               'nombre',          'Gastos de envío',
               'cantidad',        1,
               'precio_unitario', r.envio,
               'iva_pct',         r.iva_pct,
               'importe',         r.envio,
               'concepto',        'envio'
             )
      from public.reparto_envio_pedido(p_pedido_id) r
      where r.envio > 0
    ) x
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

  -- El guardia del invariante. ⚠️ Desde la 080 `v_pedido.total` incluye el
  -- envío, y el desglose también: no hay que relajar nada, y por eso mismo esto
  -- es lo que cazaría un reparto mal hecho antes de que salga un papel.
  if p_tipo <> 'rectificativa' and p_lineas is null
     and v_total <> v_pedido.total then
    raise exception
      'La factura del pedido % sumaría % y se cobraron %. No se emite un documento que no cuadra.',
      v_pedido.numero_pedido, v_total, v_pedido.total
      using errcode = 'P0001';
  end if;

  -- La fecha de operación puede venir dada (077). Una rectificativa declara la
  -- fecha de la DEVOLUCIÓN, que es el trimestre en que el 303 la netea; todo lo
  -- demás sigue usando la de devengo de la venta.
  v_operacion  := coalesce(p_fecha_operacion, dia_fiscal(v_pedido.devengado_el));
  v_expedicion := case
    when p_tipo = 'simplificada' then v_operacion
    else dia_fiscal(now())
  end;

  v_serie     := serie_de_tipo(p_tipo);
  v_ejercicio := extract(year from v_expedicion)::integer;

  -- ── El número: contador con `for update`, no secuencia ──
  insert into factura_contadores (serie, ejercicio, siguiente)
  values (v_serie, v_ejercicio, factura_correlativo_inicial())
  on conflict (serie, ejercicio) do nothing;

  select siguiente into v_correlativo
  from factura_contadores
  where serie = v_serie and ejercicio = v_ejercicio
  for update;

  update factura_contadores set siguiente = siguiente + 1
  where serie = v_serie and ejercicio = v_ejercicio;

  -- ── La cadena ── (el cerrojo ya está tomado arriba)
  select f.huella into v_anterior
  from facturas_emitidas f
  order by f.orden desc
  limit 1;

  -- La MISMA función que usa la columna generada (074): el número que se hashea y
  -- el que se imprime no pueden discrepar ni por un carácter.
  v_numero := factura_numero(v_serie, v_ejercicio, v_correlativo);
  v_huella := factura_huella(
    v_emisor->>'nif', v_numero, v_expedicion, p_tipo, v_cuota, v_total, v_anterior
  );

  insert into facturas_emitidas (
    tipo, serie, ejercicio, correlativo, pedido_id,
    fecha_expedicion, fecha_operacion,
    emisor, receptor, lineas, desglose,
    base_total, cuota_total, total,
    sustituye_a, rectifica_a, refund_id,
    huella, huella_anterior, emitida_por
  ) values (
    p_tipo, v_serie, v_ejercicio, v_correlativo, p_pedido_id,
    v_expedicion, v_operacion,
    v_emisor, p_receptor, v_lineas, v_desglose,
    v_base, v_cuota, v_total,
    p_sustituye_a, p_rectifica_a, p_refund_id,
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

comment on function public.emitir_factura is
  'Emite una factura del pedido y la encadena. Desde la 080 los gastos de envío salen como línea, una por tipo de IVA, con el reparto de reparto_envio_pedido.';

-- ── §6 · ⭐⭐ LA DEVOLUCIÓN DEL PORTE ─────────────────────────────────────────
--
-- Esta es la parte que la 078 dejó pendiente, y la que más se podía torcer.
--
-- ── §6.1 · POR QUÉ NO ES UNA FILA EN `reembolso_lineas` ──────────────────────
--
-- Sería lo primero que uno intenta, y no cabe: `pedido_item_id` es `not null` y
-- referencia a `pedido_items`. Hacerlo nullable arrastra un discriminante, un
-- índice único parcial, y —lo que lo mata— que TODOS los consumidores hacen
-- `join pedido_items on i.id = rl.pedido_item_id`, un join interno que dejaría la
-- fila del porte fuera en silencio. Se cambiaría una columna y habría que revisar
-- el 303, `reembolsos.service.ts`, la línea de tiempo y el panel.
--
-- Así que el porte no es una línea de devolución: es un HECHO DEL PEDIDO. Dos
-- columnas en `pedidos` (§2) que dicen en qué reembolso se fue y qué día.
--
-- ── §6.2 · Y POR QUÉ ESO BASTA PARA QUE EL 303 VUELVA A CERO ─────────────────
--
-- Porque el desglose de la rectificativa (078) no cuenta artículos: reparte a
-- prorrata sobre `pedido_iva`. Y `pedido_iva` ya lleva el porte dentro (§4). Lo
-- único que hace falta es que `esto` —el dinero devuelto en ESTE reembolso, por
-- tipo— incluya la parte del porte cuando este es el reembolso que lo devolvió.
--
-- Con eso, devolver un pedido entero da, por tipo:
--
--     Σ esto = articulos(tipo) + envio(tipo) = pedido_iva(tipo).base + .cuota
--
-- o sea `total_venta`, o sea `objetivo = round(base_venta × 1, 2) = base_venta`.
-- **Converge al céntimo, y por la misma razón que ya convergía en la 078**: no
-- por compensación, sino porque el objetivo es el acumulado.
--
-- ⚠️ Y la parte del porte por tipo la da `reparto_envio_pedido`, la MISMA función
-- que la usó al declarar la venta. Si aquí se recalculara a mano, un día el
-- documento rectificaría un reparto distinto del declarado. Ver §0.2.
--
-- ── §6.3 · ⚠️⚠️ EL HUECO DEL PORTE SOLO, QUE ES REAL Y ALCANZABLE ────────────
--
-- La rectificativa la dispara un trigger `after insert on reembolso_lineas`
-- (077 §3). Y hay un camino que devuelve el porte SIN insertar ninguna línea:
--
--   1. Se devuelven TODOS los artículos en reembolsos parciales. El pedido NO se
--      cierra, porque lo devuelto (artículos) es menor que el total (con porte).
--   2. Queda un último reembolso por el resto — que es exactamente el porte.
--      `reembolsar_pedido_total` no encuentra artículos pendientes y no inserta
--      nada. El trigger no se dispara. Sin la 080, el porte se quedaría
--      declarado para siempre.
--
-- No es teórico: es la secuencia que hace cualquiera que devuelva una compra
-- artículo por artículo desde el panel. Se cierra en dos sitios:
--
--   · `reembolsar_pedido_total` llama a `emitir_rectificativa` ella misma cuando
--     devolvió el porte y no dejó líneas. Con el MISMO `exception when others`
--     del trigger: cuando esto corre el dinero ya salió de Stripe, y un fallo
--     aquí no puede convertir una devolución hecha en un error en pantalla.
--   · `emitir_rectificativas_pendientes` aprende a verlo, para que el botón de
--     ponerse al día lo recupere sin entrar a la base a mano.
--
-- ⚠️ LO QUE ESTO **NO** CUBRE, Y HAY QUE SABERLO: el bloque `sin_doc` del 303 y
-- el aviso `devolucion_sin_rectificativa` (078 §2) miran `reembolso_lineas`, así
-- que un porte-solo cuya rectificativa fallara no lo contarían. La dirección del
-- error es la conservadora —el 303 declararía DE MÁS, no de menos— y se arregla
-- con el botón. Se cierra en §7.

-- ── El cierre del pedido marca el porte como devuelto ────────────────────────
-- Se reemplaza entera porque es una sola función: lo único que cambia son las
-- dos columnas del `update` y el bloque final. El resto —el cerrojo, el
-- `for update`, la reposición agrupada por producto y el apuntado de líneas— es
-- de la 044 y la 068, y va copiado tal cual.

create or replace function public.reembolsar_pedido_total(
  p_pedido_id uuid,
  p_actor_id uuid default null,
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
  v_envio_de_este boolean;
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

  /**
   * ⬇️ EL CAMBIO DE LA 080. Cerrar el pedido ES devolver el porte: lo exige el
   * art. 107 RDL 1/2007 en el desistimiento (se devuelven todos los pagos
   * recibidos, portes incluidos) y además ya está devuelto de hecho, porque el
   * importe que la API manda a Stripe es `pedidos.total − lo ya devuelto`, y
   * `total` lleva el porte dentro.
   *
   * ⚠️ El `coalesce` no es adorno: sin él, un segundo cierre reatribuiría el
   * porte a otro reembolso y la rectificativa lo contaría dos veces. Que arriba
   * se salga si ya está REEMBOLSADO lo hace difícil de alcanzar; esto lo hace
   * imposible.
   */
  update public.pedidos
  set estado = 'REEMBOLSADO',
      envio_devuelto_en_refund = coalesce(
        envio_devuelto_en_refund,
        case when coalesce(coste_envio, 0) > 0 then v_refund end
      ),
      envio_devuelto_el = coalesce(
        envio_devuelto_el,
        case when coalesce(coste_envio, 0) > 0 then public.dia_fiscal(now()) end
      ),
      updated_at = now()
  where id = p_pedido_id;

  -- Ver el porqué en cambiar_estado_pedido: la variable dura toda la
  -- transacción y arrastraría el autor a lo que venga después.
  perform set_config('app.actor_id', '', true);
  perform set_config('app.origen', '', true);

  -- Devuelve a la venta las unidades que no se hayan devuelto ya por artículo, y
  -- las apunta. `stock_disponible` sube; `stock_reservado` no se toca: la reserva
  -- del checkout ya se consumió al confirmar la venta.
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

  /**
   * ⬇️ EL HUECO DEL PORTE SOLO (§6.3). Si este cierre devolvió el porte y NO dejó
   * ninguna línea, el trigger de la 077 no se va a disparar y nadie emitiría la
   * rectificativa. Se emite aquí.
   *
   * ⚠️ Solo en ese caso. En el normal ya hay líneas y el trigger —que es
   * DIFERIDO— corre al final viéndolas todas; llamar también aquí no duplicaría
   * nada (`emitir_rectificativa` es idempotente por refund) pero se adelantaría a
   * líneas que otra sentencia de la misma transacción aún puede estar
   * insertando, y saldría un documento por menos importe del debido.
   *
   * ⚠️⚠️ Y EL `EXCEPTION` ES LA REGLA DE ESTA RUTA, igual que en la 077: cuando
   * esto corre el dinero YA salió de Stripe. Dejar que un fallo aquí aborte la
   * transacción convertiría una devolución hecha en un error en pantalla. No
   * queda en silencio: se anota en `factura_eventos` con el mismo evento que usa
   * el trigger, así que lo recoge la misma revisión.
   */
  select (p.envio_devuelto_en_refund = v_refund) into v_envio_de_este
  from public.pedidos p where p.id = p_pedido_id;

  if coalesce(v_envio_de_este, false)
     and not exists (
       select 1 from public.reembolso_lineas rl
       where rl.pedido_id = p_pedido_id and rl.refund_id = v_refund
     ) then
    begin
      perform public.emitir_rectificativa(p_pedido_id, v_refund, p_actor_id);
    exception
      when others then
        insert into public.factura_eventos (evento, detalle, actor_id)
        values ('rectificativa_fallida',
                jsonb_build_object(
                  'pedido_id', p_pedido_id,
                  'refund_id', v_refund,
                  'motivo',    'devolucion de solo los gastos de envio',
                  'error',     sqlerrm,
                  'sqlstate',  sqlstate),
                p_actor_id);
    end;
  end if;

  return true;
end;
$$;

comment on function public.reembolsar_pedido_total(uuid, uuid, text) is
  'Cierra el pedido como REEMBOLSADO, repone las unidades que no constaran ya devueltas y LAS APUNTA en reembolso_lineas. Desde la 080 marca además el porte como devuelto en ese reembolso, y emite ella misma la rectificativa cuando el cierre devuelve SOLO el porte (el trigger de la 077 no se dispararía).';

revoke execute on function public.reembolsar_pedido_total(uuid, uuid, text)
  from public, anon, authenticated;

-- ── La rectificativa rectifica también el porte ──────────────────────────────
-- Se reemplaza entera (misma firma): cambian el bloque de líneas, el de la fecha
-- y el CTE `esto` del desglose. El redondeo acumulado, la idempotencia por
-- reembolso, a qué factura rectifica y el receptor heredado son de la 077 y la
-- 078, y van igual.

create or replace function public.emitir_rectificativa(
  p_pedido_id uuid,
  p_refund_id text,
  p_actor_id  uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_ya            uuid;
  v_rectifica     uuid;
  v_numero_rect   text;
  v_receptor      jsonb;
  v_emisor_nif    text;
  v_lineas        jsonb;
  v_desglose      jsonb;
  v_devuelto_el   date;
  v_envio_de_este boolean;
  v_envio_el      date;
begin
  -- Idempotencia por reembolso. El índice único de la 073 es el suelo; esto es
  -- para que un reintento devuelva la misma en vez de estrellarse.
  select id into v_ya
  from facturas_emitidas
  where pedido_id = p_pedido_id and tipo = 'rectificativa' and refund_id = p_refund_id;
  if v_ya is not null then return v_ya; end if;

  /**
   * ⬇️ 080 · ¿ES ESTE EL REEMBOLSO QUE DEVOLVIÓ EL PORTE? Lo marcó
   * `reembolsar_pedido_total` al cerrar el pedido (§6.1). Si lo es, este
   * documento tiene que rectificar también el porte; si no, solo los artículos.
   *
   * Se lee UNA vez y gobierna las tres cosas de abajo —las líneas, la fecha y el
   * desglose—, para que no puedan discrepar entre sí.
   */
  select p.envio_devuelto_en_refund = p_refund_id, p.envio_devuelto_el
    into v_envio_de_este, v_envio_el
  from public.pedidos p where p.id = p_pedido_id;
  v_envio_de_este := coalesce(v_envio_de_este, false);

  /**
   * A QUÉ FACTURA RECTIFICA: la vigente de esa venta.
   *
   * ⚠️ El filtro `tipo in (...)` NO es redundante con `vigente`: una rectificativa
   * también sale como vigente —nada la sustituye— y una rectificativa no rectifica
   * a otra rectificativa.
   *
   * ⚠️⚠️ Y SI NO HAY NINGUNA, HAY QUE PARAR AQUÍ. `facturas_rectifica_coherente`
   * exige `rectifica_a not null` en toda rectificativa, así que seguir adelante
   * lanzaría un CHECK dentro de la transacción de un reembolso ya cobrado.
   */
  select f.id, f.numero, f.receptor into v_rectifica, v_numero_rect, v_receptor
  from public.libro_facturas_expedidas f
  where f.pedido_id = p_pedido_id
    and f.vigente
    and f.tipo in ('simplificada', 'completa')
  limit 1;

  if v_rectifica is null then
    insert into factura_eventos (evento, detalle, actor_id)
    values ('rectificativa_sin_factura_previa',
            jsonb_build_object('pedido_id', p_pedido_id, 'refund_id', p_refund_id),
            p_actor_id);
    return null;
  end if;

  /**
   * ⚠️ EL RECEPTOR SE HEREDA de la factura rectificada —una rectificativa va a
   * nombre de quien recibió la original— pero se cae si coincide con el emisor.
   * Heredarlo sin mirar haría que rectificar una venta con el NIF propio (un dato
   * de prueba, 076) abortara el reembolso. Se emite sin receptor y se anota.
   */
  v_emisor_nif := upper(trim(coalesce(emisor_fiscal()->>'nif', '')));
  if v_receptor is not null
     and v_emisor_nif <> ''
     and upper(trim(coalesce(v_receptor->>'nif', ''))) = v_emisor_nif then
    insert into factura_eventos (evento, detalle, actor_id)
    values ('rectificativa_sin_receptor_heredado',
            jsonb_build_object('pedido_id', p_pedido_id, 'refund_id', p_refund_id,
                               'motivo', 'el receptor de la factura rectificada es el propio emisor'),
            p_actor_id);
    v_receptor := null;
  end if;

  -- ⚠️ LA FECHA DE LA DEVOLUCIÓN, que es el trimestre en que el 303 la netea.
  -- Todas las líneas de un reembolso nacen en la misma sentencia, así que `min`
  -- y `max` dan lo mismo; se usa `min` para que sea determinista.
  --
  -- ⚠️⚠️ Y ES ADEMÁS LO QUE EMPAREJA EL DOCUMENTO CON EL PERIODO EN LA
  -- LIQUIDACIÓN: el 303 filtra las rectificativas por `fecha_operacion`.
  select min(public.dia_fiscal(rl.created_at)) into v_devuelto_el
  from public.reembolso_lineas rl
  where rl.pedido_id = p_pedido_id and rl.refund_id = p_refund_id;

  -- ⬇️ 080: una devolución que devuelve SOLO el porte no deja líneas (§6.3), así
  -- que la fecha sale de `pedidos`. Sin esto se caería por `sin_lineas` y el
  -- porte no se rectificaría nunca.
  v_devuelto_el := coalesce(
    v_devuelto_el,
    case when v_envio_de_este then v_envio_el end
  );

  if v_devuelto_el is null then
    insert into factura_eventos (evento, detalle, actor_id)
    values ('rectificativa_sin_lineas',
            jsonb_build_object('pedido_id', p_pedido_id, 'refund_id', p_refund_id),
            p_actor_id);
    return null;
  end if;

  /**
   * LAS LÍNEAS DEVUELTAS. Las unidades van en POSITIVO y el importe en NEGATIVO:
   * «3 uds · −2,40 €» se lee como lo que es, y «−3 uds» no aporta nada.
   *
   * ⬇️ 080: y el porte, cuando toca, con el mismo criterio que en la factura de
   * venta (§5): una línea por tipo de IVA, con el reparto de la misma función.
   */
  select jsonb_agg(x.linea order by x.orden, x.nombre, x.iva_pct)
  into v_lineas
  from (
    select 0 as orden, t.nombre, t.iva_pct,
           jsonb_build_object(
             'nombre',          t.nombre,
             'cantidad',        t.cantidad,
             'precio_unitario', t.precio_unitario,
             'iva_pct',         t.iva_pct,
             'importe',         -t.importe
           ) as linea
    from (
      select i.nombre_producto as nombre,
             sum(rl.cantidad)  as cantidad,
             i.precio_unitario,
             i.iva_pct,
             sum(rl.importe)   as importe
      from public.reembolso_lineas rl
      join public.pedido_items i on i.id = rl.pedido_item_id
      where rl.pedido_id = p_pedido_id and rl.refund_id = p_refund_id
      group by i.nombre_producto, i.precio_unitario, i.iva_pct
    ) t
    union all
    select 1, 'Gastos de envío', r.iva_pct,
           jsonb_build_object(
             'nombre',          'Gastos de envío',
             'cantidad',        1,
             'precio_unitario', r.envio,
             'iva_pct',         r.iva_pct,
             'importe',         -r.envio,
             'concepto',        'envio'
           )
    from public.reparto_envio_pedido(p_pedido_id) r
    where v_envio_de_este and r.envio > 0
  ) x;

  /**
   * ⭐⭐ EL DESGLOSE, CON REDONDEO ACUMULADO (078). Ver la cabecera de la 078
   * para el porqué y para los números que lo destaparon.
   *
   * Por tipo de IVA:
   *   objetivo  = round(base_venta × (ya_devuelto + esto) / total_venta, 2)
   *   base_doc  = objetivo − base_ya_rectificada
   *   cuota_doc = esto − base_doc          ← RESTANDO, nunca multiplicando
   *
   * ⚠️ `ya` SE LEE DE LOS DOCUMENTOS EMITIDOS, no de `reembolso_lineas`. Es lo
   * que hace que esto sea independiente del orden: si una rectificativa falló y
   * se emite después con `emitir_rectificativas_pendientes`, cada una ve lo que de
   * verdad hay emitido y la última cierra el resto.
   *
   * ⬇️⬇️ EL CAMBIO DE LA 080 ESTÁ EN `esto`, Y ES TODO LO QUE HACÍA FALTA. Ver
   * §6.2: `pedido_iva` ya lleva el porte dentro, así que basta con que el dinero
   * devuelto por tipo lo lleve también cuando este es el reembolso que lo
   * devolvió. La convergencia a cero exacto sale sola, por la misma razón que ya
   * salía.
   *
   * ⚠️ EL `case` DEL FALLBACK no es defensivo por si acaso: las ventas anteriores
   * a la 062 no tienen fila en `pedido_iva`, y sin `total_venta` no hay proporción
   * que calcular.
   *
   * ⚠️⚠️ EL `least/greatest` ES PARA QUE UN DOCUMENTO NUNCA SALGA CON LA CUOTA DEL
   * SIGNO CONTRARIO A SU BASE. Cuando muerde, el céntimo que no absorbe lo recoge
   * la siguiente rectificativa: acotar aquí no rompe la convergencia, la retrasa
   * un documento.
   */
  with esto as (
    select u.iva_pct, sum(u.con_iva) as con_iva
    from (
      select i.iva_pct, sum(rl.importe) as con_iva
      from public.reembolso_lineas rl
      join public.pedido_items i on i.id = rl.pedido_item_id
      where rl.pedido_id = p_pedido_id and rl.refund_id = p_refund_id
      group by i.iva_pct
      union all
      select r.iva_pct, r.envio
      from public.reparto_envio_pedido(p_pedido_id) r
      where v_envio_de_este and r.envio > 0
    ) u
    group by u.iva_pct
  ),
  ya as (
    -- Lo ya rectificado de esta venta, EN POSITIVO (el documento lo guarda en
    -- negativo). La rectificativa de este reembolso no está: la idempotencia de
    -- arriba ya devolvió si existía.
    select (d->>'iva_pct')::numeric                                        as iva_pct,
           sum(-(d->>'base')::numeric)                                     as base,
           sum(-((d->>'base')::numeric + (d->>'cuota')::numeric))          as con_iva
    from public.facturas_emitidas f
    cross join lateral jsonb_array_elements(f.desglose) d
    where f.pedido_id = p_pedido_id
      and f.tipo = 'rectificativa'
    group by (d->>'iva_pct')::numeric
  ),
  cuentas as (
    select e.iva_pct,
           e.con_iva,
           coalesce(y.base, 0)    as ya_base,
           coalesce(y.con_iva, 0) as ya_con_iva,
           pv.base                as base_venta,
           pv.base + pv.cuota     as total_venta
    from esto e
    left join ya y            on y.iva_pct = e.iva_pct
    left join public.pedido_iva pv on pv.pedido_id = p_pedido_id
                                  and pv.iva_pct   = e.iva_pct
  )
  select jsonb_agg(jsonb_build_object(
           'iva_pct', c.iva_pct,
           'base',    -c.base_doc,
           'cuota',   -(c.con_iva - c.base_doc)
         ) order by c.iva_pct)
  into v_desglose
  from (
    select iva_pct,
           con_iva,
           case
             when total_venta is null or total_venta = 0
               then round(con_iva / (1 + iva_pct / 100), 2)
             else least(
                    greatest(
                      round(base_venta * (ya_con_iva + con_iva) / total_venta, 2) - ya_base,
                      0
                    ),
                    con_iva
                  )
           end as base_doc
    from cuentas
  ) c;

  return emitir_factura(
    p_pedido_id       => p_pedido_id,
    p_tipo            => 'rectificativa',
    p_receptor        => v_receptor,
    p_lineas          => v_lineas,
    p_desglose        => v_desglose,
    p_rectifica_a     => v_rectifica,
    p_actor_id        => p_actor_id,
    p_fecha_operacion => v_devuelto_el,
    p_refund_id       => p_refund_id
  );
end;
$$;

comment on function public.emitir_rectificativa is
  'La rectificativa de una devolución. Importes en NEGATIVO y base con redondeo acumulado sobre pedido_iva (078). Desde la 080 rectifica también los gastos de envío, y solo en el reembolso que los devolvió (pedidos.envio_devuelto_en_refund).';

-- ── Ponerse al día ve también el porte solo ──────────────────────────────────
-- Se reemplaza entera: lo único que cambia es que el conjunto de devoluciones
-- pendientes ahora es la UNIÓN de las que tienen líneas y las que solo
-- devolvieron el porte. Ver §6.3: sin esto, un porte-solo cuya rectificativa
-- fallara no lo recuperaría ningún botón.

create or replace function public.emitir_rectificativas_pendientes(p_actor_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_r        record;
  v_emitidas int := 0;
  v_saltadas int := 0;
  v_id       uuid;
begin
  if emisor_fiscal() is null then
    raise exception
      'Faltan los datos fiscales del emisor (TI → Ajustes). Sin NIF, nombre y domicilio no hay factura que emitir.'
      using errcode = 'P0001';
  end if;

  -- Mismo criterio que `emitir_facturas_pendientes` (073): en orden de
  -- devolución, para que los números de la serie salgan en el orden en que
  -- ocurrieron.
  for v_r in
    select t.pedido_id, t.refund_id, min(t.cuando) as cuando
    from (
      select rl.pedido_id, rl.refund_id, rl.created_at as cuando
      from public.reembolso_lineas rl
      union all
      -- ⬇️ 080: la devolución que solo devolvió el porte. `envio_devuelto_el` es
      -- una fecha y no un timestamp, así que ordena por el día — que es toda la
      -- precisión que hay y la que necesita el 303.
      select p.id, p.envio_devuelto_en_refund, p.envio_devuelto_el::timestamptz
      from public.pedidos p
      where p.envio_devuelto_en_refund is not null
    ) t
    where not exists (
      select 1 from public.facturas_emitidas f
      where f.pedido_id = t.pedido_id
        and f.tipo = 'rectificativa'
        and f.refund_id = t.refund_id
    )
    group by t.pedido_id, t.refund_id
    order by min(t.cuando)
  loop
    v_id := emitir_rectificativa(v_r.pedido_id, v_r.refund_id, p_actor_id);
    if v_id is null then v_saltadas := v_saltadas + 1;
    else v_emitidas := v_emitidas + 1;
    end if;
  end loop;

  return jsonb_build_object('emitidas', v_emitidas, 'saltadas', v_saltadas);
end;
$$;

comment on function public.emitir_rectificativas_pendientes is
  'Emite las rectificativas de las devoluciones que no la tienen. Para el arranque y para recuperar un fallo del trigger sin entrar a la base a mano. Desde la 080 ve también las devoluciones de solo los gastos de envío, que no dejan linea en reembolso_lineas.';

-- ── §7 · ⚠️ LO QUE ESTA MIGRACIÓN **NO** TOCA DEL 303, Y POR QUÉ ─────────────
--
-- `liquidacion_iva` (078 §2) referencia `reembolso_lineas` en CINCO sitios. Se
-- han revisado los cinco:
--
--   1. `sin_doc` — la mitad del bloque `rectificado` que deriva las devoluciones
--      que todavía no tienen documento.                      ← LE FALTA EL PORTE
--   2. `v_r_docs` — el contador de documentos del bloque.     ← LE FALTA EL PORTE
--   3. Aviso `devolucion_sin_rectificativa`.                  ← LE FALTA EL PORTE
--   4. Aviso `cancelado_ya_cobrado_sin_devolucion` — mira si un pedido tiene
--      ALGUNA línea de devolución. No le afecta: un pedido cuyo porte se devolvió
--      tuvo que devolver antes sus artículos, así que líneas hay.
--   5. Aviso `devolucion_reconstruida` — filtra `refund_id like 'retro:%'`. Nada
--      que ver con el porte.
--
-- ── Qué se pierde exactamente, dicho sin rebajarlo ───────────────────────────
--
-- Los tres primeros solo entran en juego cuando una rectificativa **no se ha
-- emitido**. Si se emitió —el caso normal, y el que el trigger de la 077 y §6.3
-- garantizan— el 303 la lee del bloque `doc`, que suma el desglose del documento
-- y ahí el porte YA ESTÁ. El número es correcto.
--
-- Cuando una rectificativa falla, y solo entonces:
--   · El aviso `devolucion_sin_rectificativa` **sí salta** (lo disparan las
--     líneas de artículos), así que el fallo NO queda en silencio y el botón de
--     «emitir pendientes» sigue siendo la salida — que además §6.3 ya enseñó a
--     ver el caso del porte solo.
--   · Pero el importe que ese bloque adelanta se queda CORTO por la parte del
--     porte, hasta que el documento exista.
--
-- ⚠️ La dirección del error es la conservadora: el 303 declararía DE MÁS, nunca
-- de menos. Y se cierra en cuanto se emite el documento que falta.
--
-- ── Por qué no se arregla aquí ───────────────────────────────────────────────
--
-- `liquidacion_iva` es una función de 18 KB y `create or replace` obliga a
-- reescribirla entera para cambiar tres CTEs. Transcribir 430 líneas de SQL
-- fiscal a mano para tocar tres es cambiar un fallo acotado, conservador y
-- avisado por el riesgo de un error de copia **silencioso** en el cálculo del
-- 303. Es el mismo criterio con el que la 078 decidió no tocar los documentos ya
-- emitidos: no se mete la mano donde el coste del error es peor que el error.
--
-- Se hace en su propia migración, con su ensayo, y con el reparto ya probado.
-- Queda anotado en ESTADO.md.
