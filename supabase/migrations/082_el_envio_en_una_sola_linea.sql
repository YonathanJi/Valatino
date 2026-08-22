-- ═══════════════════════════════════════════════════════════════════════════
-- 082 · EL ENVÍO, EN UNA SOLA LÍNEA DE FACTURA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Petición del dueño, 2026-08-22: «que salga el envío total y ya, menos
-- complicado para el cliente». Hoy una factura con carrito mixto saca dos:
--
--     Gastos de envío    1   10 %   2,20 €   2,20 €
--     Gastos de envío    1   21 %   1,20 €   1,20 €
--
-- y a partir de aquí saca una:
--
--     Gastos de envío    1    —     3,40 €   3,40 €
--
-- ── §0 · ⚠️⚠️ ESTO DEROGA EL §5 DE LA 080, QUE LO PROHIBÍA POR ESCRITO ────────
--
-- La 080 eligió una línea por tipo y dejó escritas tres razones. Hay que
-- responderlas una a una, porque si no la próxima sesión leerá aquel comentario
-- y «arreglará» esto devolviéndolo a dos líneas:
--
--   1. «El art. 6.1.f RD 1619/2012 pide que la factura exprese el tipo
--      aplicado.» SIGUE CUMPLIÉNDOSE, y no por esta línea sino por el bloque de
--      totales: el PDF imprime «Base imponible al 10 %» y «al 21 %» con sus dos
--      cuotas, copiadas de `pedido_iva`. Eso es lo que diferencia la base de
--      cada tipo, que es lo que el reglamento exige. Y el porte NO es una
--      operación aparte: el art. 78.Dos.1º LIVA lo mete DENTRO de la base de la
--      entrega, así que darle un tipo propio siempre fue una comodidad de
--      presentación, nunca una obligación.
--
--   2. «`factura-pdf.service.ts` imprime `${l.iva_pct} %`: sin tipo saldría
--      "undefined %".» ERA CIERTO Y SEGUÍA SIÉNDOLO HASTA HOY. Se arregla en el
--      mismo cambio, no después: la columna pinta «—» cuando no hay un tipo
--      único, y hay un test que se vio ROJO imprimiendo «null %» antes de
--      tocarlo. Sin ese test esto no se sube: TypeScript no lo caza, porque
--      interpolar `null` en una plantilla compila tan ricamente.
--
--   3. «El desglose queda atribuible línea a línea.» ES LA ÚNICA QUE SE PIERDE
--      de verdad, y se compensa sin devolverle complejidad al cliente:
--        · la línea guarda el reparto dentro, en la clave `reparto`, así que el
--          documento congelado no pierde el dato — sigue estando en el libro;
--        · y el PDF lo imprime en letra pequeña bajo la tabla, solo cuando el
--          porte cae en más de un tipo.
--      El cliente ve una línea. Quien tenga que cuadrarla tiene los números.
--
-- ── §1 · LA LÍNEA SE ARMA EN UN SOLO SITIO ───────────────────────────────────
--
-- ⚠️ La 080 la construía DOS veces, con el mismo jsonb copiado a mano en
-- `emitir_factura` y en `emitir_rectificativa`. Nada comprobaba que siguieran
-- iguales: tocar una y olvidar la otra daba una venta con un formato y su
-- devolución con otro, y no hay test ni guardia que cace esa divergencia.
-- Por eso el cambio no es «editar dos sitios» sino dejar UNO.
--
-- ── §2 · LO QUE ESTO **NO** TOCA ─────────────────────────────────────────────
--
--   · `reparto_envio_pedido` — intacta. Sigue siendo el único sitio que reparte,
--     y ahora tiene cuatro consumidores en vez de tres.
--   · `pedido_iva` y `recalcular_iva_pedido` — intactos. El IVA declarado no
--     cambia ni un céntimo: esto es presentación.
--   · La huella de Verifactu — no cubre `lineas` (072 §199: hashea nif, número,
--     fecha, tipo, cuota, total y la huella anterior), así que la cadena ni se
--     entera. Comprobado, no supuesto.
--   · El guardia del cuadre de `emitir_factura` — compara el DESGLOSE contra
--     `pedidos.total`, no suma las líneas. Tampoco se entera.
--   · LAS FACTURAS YA EMITIDAS. Son inmutables por trigger (072 §6) y así se
--     quedan: `VALS/VALF202600100` y `VALR202600101` conservan sus dos líneas
--     de envío para siempre. Convivirán los dos formatos en el libro, y eso es
--     lo correcto — un papel que ya se emitió no se reformatea.
--
-- ═══════════════════════════════════════════════════════════════════════════

-- ── §3 · ⭐ LA LÍNEA DEL PORTE, Y VIVE SOLO AQUÍ ─────────────────────────────
--
-- Devuelve la línea de factura del envío, ya montada, o NULL si no hay porte
-- que facturar. `p_signo` es 1 en la venta y -1 en la rectificativa.
--
-- ⚠️ `iva_pct` VA A NULL A PROPÓSITO cuando el porte cae en más de un tipo. La
-- tentación es poner el tipo mayoritario, o el primero, para que la columna no
-- quede vacía: sería un dato falso en un documento fiscal. Una línea que no
-- tiene un tipo único no lo declara, y quien la lea tiene el reparto justo al
-- lado y el desglose debajo.
--
-- ⚠️ `precio_unitario` va SIN signo y `importe` CON él, que es el criterio que
-- ya seguían las líneas de artículo en la rectificativa: «1 ud · −3,40 €» se
-- lee, «−1 ud» no dice nada.

create or replace function public.linea_envio_factura(
  p_pedido_id uuid,
  p_signo     int default 1
)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select case when count(*) = 0 then null else
    jsonb_build_object(
      'nombre',          'Gastos de envío',
      'cantidad',        1,
      'precio_unitario', round(sum(r.envio), 2),
      -- El tipo solo cuando es uno solo. Con varios, null: ver el aviso de arriba.
      'iva_pct',         case when count(*) = 1 then min(r.iva_pct) end,
      'importe',         p_signo * round(sum(r.envio), 2),
      'concepto',        'envio',
      -- ⭐ El reparto viaja DENTRO de la línea congelada. Es lo que hace que
      -- unificar la presentación no pierda información: el libro conserva de
      -- dónde salió cada céntimo aunque el papel enseñe una sola cifra.
      'reparto',         jsonb_agg(jsonb_build_object(
                           'iva_pct', r.iva_pct,
                           'importe', p_signo * r.envio
                         ) order by r.iva_pct)
    )
  end
  from public.reparto_envio_pedido(p_pedido_id) r
  where r.envio > 0;
$$;

comment on function public.linea_envio_factura(uuid, int) is
  'La línea de factura del envío, UNA sola con el total (082). Devuelve NULL si no hay porte. `iva_pct` es null cuando el porte cae en varios tipos, y entonces el desglose va en la clave `reparto`. La usan emitir_factura y emitir_rectificativa: es el único sitio que le da forma.';

revoke execute on function public.linea_envio_factura(uuid, int) from public, anon, authenticated;

-- ── §4 · Las dos funciones que la usan ───────────────────────────────────────
--
-- Van enteras porque en Postgres una función se reemplaza completa. Lo único
-- que cambia respecto a la 080 es la rama del `union all` que arma la línea del
-- porte y el comentario que la explica; el resto es idéntico byte a byte, y se
-- extrajo del fichero de la 080 con un script en vez de a mano justo para que
-- lo sea.

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
   * ⬇️ EL CAMBIO DE LA 082: el porte sale como UNA SOLA línea con el total, y la
   * arma `linea_envio_factura` — el único sitio que le da forma, para las dos
   * funciones. Devuelve NULL cuando no hay porte que facturar (pedidos anteriores
   * a la 080 y los que caen bajo el umbral de gratuidad), y por eso el filtro es
   * `z.linea is not null` y ya no un `where` sobre el reparto.
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
      select 1, 'Gastos de envío', null::numeric, z.linea
      from (select public.linea_envio_factura(p_pedido_id, 1) as linea) z
      where z.linea is not null
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
   * ⬇️ 082: y el porte, cuando toca, con el mismo criterio que en la factura de
   * venta: UNA sola línea con el total, de `linea_envio_factura`, aquí con signo
   * negativo. Que las dos la pidan a la misma función es lo que impide que la
   * venta y su rectificativa acaben con formatos distintos.
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
    select 1, 'Gastos de envío', null::numeric, z.linea
    from (select public.linea_envio_factura(p_pedido_id, -1) as linea) z
    where v_envio_de_este and z.linea is not null
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

-- ── §5 · Los comentarios publicados, que si no quedan mintiendo ──────────────
--
-- Se consultan con \df+ desde la propia base, sin abrir el repo. Un comentario
-- que describe el comportamiento anterior es peor que ninguno.

comment on function public.emitir_factura is
  'Emite una factura del pedido y la encadena. Desde la 082 los gastos de envío salen como UNA sola línea con el total, de linea_envio_factura; el reparto por tipo sigue en el desglose (pedido_iva) y dentro de la propia línea.';

comment on function public.emitir_rectificativa is
  'Emite la rectificativa de un reembolso (078: redondeo acumulado sobre lo ya rectificado). Desde la 082 el porte devuelto va en UNA sola línea negativa, de linea_envio_factura, con el mismo criterio que la factura de venta.';

comment on function public.reparto_envio_pedido(uuid) is
  'Reparte el coste de envío del pedido entre sus tipos de IVA, a prorrata de los artículos y con redondeo ACUMULADO para que la suma sea exacta (art. 78.Dos.1º LIVA). EL ÚNICO SITIO que lo calcula: lo usan el desglose de la venta (062), el de la rectificativa (078) y linea_envio_factura, que arma la línea del papel para las dos (082).';
