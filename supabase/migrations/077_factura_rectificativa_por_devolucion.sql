-- ============================================================
-- 077 — La factura rectificativa por devolución
--
-- La última pieza de la Capa 2, y la que el propio sistema venía pidiendo: desde
-- la 075 el 303 avisa «N devolución(es) sin factura rectificativa» cada vez que
-- hay un reembolso. Era el único sitio donde el sistema informaba de un defecto
-- sobre sí mismo.
--
-- ⚠️⚠️ EL PROBLEMA QUE RESUELVE, dicho con números: se devuelve un pedido de
-- 5,10 €. El **libro** sigue diciendo que se facturaron 5,10 €; el **303** ya lo
-- ha neteado (rectificado 4,64/0,46, repercutido 0). Los dos tienen razón por
-- separado y no cuadran entre sí, porque falta el documento que los reconcilia.
--
-- ── Las cuatro decisiones de fondo ────────────────────────────────────────────
--
-- 1. ⚠️⚠️ LOS IMPORTES VAN EN NEGATIVO. Es lo que hace que el libro y el 303
--    digan lo mismo **sumando**: el 303 calcula `repercutido = devengado −
--    rectificado`, así que si la rectificativa lleva base y cuota negativas,
--    `sum(total)` sobre las facturas vigentes del libro da exactamente el
--    repercutido. Con importes positivos habría que saber restar por tipo de
--    documento — una segunda regla que algún día alguien no aplicaría.
--
-- 2. ⚠️⚠️ LA ARITMÉTICA SE COPIA DEL BLOQUE `rectificado` DE LA 068, línea por
--    línea: por cada tipo de IVA, `con_iva = sum(importe)`,
--    `base = round(con_iva / (1 + pct/100), 2)` y `cuota = con_iva − base`. La
--    cuota se saca RESTANDO, no multiplicando, y eso no es un detalle: es lo que
--    garantiza que base + cuota sea el importe devuelto al céntimo. Recalcularlo
--    de otra forma daría un documento que no cuadra con la liquidación **sobre el
--    mismo dinero**, que es el fallo que la 062 dejó escrito.
--
-- 3. ⚠️⚠️ LA FECHA DE OPERACIÓN ES LA DE LA DEVOLUCIÓN, no la de la venta. El 303
--    mete el rectificado en el trimestre de `dia_fiscal(rl.created_at)` — una
--    devolución de enero sobre una venta de diciembre no puede reabrir un
--    trimestre presentado—. Si el documento dijera la fecha de la venta, quien
--    cuadrara el libro contra el 303 encontraría la corrección en dos trimestres
--    distintos. **Por esto hubo que ampliar la firma del motor** (ver §1).
--
-- 4. ⚠️⚠️ SE EMITE SOLA, CON UN TRIGGER DIFERIDO, y NO desde la API. El reembolso
--    se apunta desde el panel hoy, pero `registrar_reembolso_lineas` es el único
--    sitio por donde nacen las líneas y mañana puede llamarlo otra vía. Con el
--    trigger, cualquier camino que apunte una devolución emite su rectificativa
--    — incluidos los que no existen todavía.
--
-- ⚠️⚠️⚠️ Y LA REGLA QUE MANDA SOBRE TODAS: **ESTO NO PUEDE TUMBAR UN REEMBOLSO.**
-- Cuando el trigger corre, el dinero YA salió de Stripe. Por eso la emisión va
-- dentro de un bloque de excepciones: si algo falla, se anota en `factura_eventos`
-- y el reembolso sigue. Es la misma regla que `registrarLineas` en la API («nunca
-- lanza: se llama con el dinero ya salido»).
--
-- ⭐ Y el fallo no queda en silencio, que es lo que hace aceptable ese `catch`:
-- el aviso `devolucion_sin_rectificativa` de la 075 **sigue cantando** hasta que
-- exista el documento. La red de seguridad ya estaba puesta.
-- ============================================================

-- ── §1 · El motor gana dos parámetros, y hay que DROPearlo primero ───────────
-- ⚠️⚠️ `create or replace` con más parámetros NO reemplaza: crea una SOBRECARGA,
-- y entonces `emitir_factura(id, 'simplificada')` queda ambigua y el trigger de la
-- simplificada empieza a fallar. Es exactamente la trampa que la 068 dejó
-- documentada y que la 069 esquivó por no tener que tocar la firma.
--
-- Los dos parámetros nuevos van al FINAL y con default, así que ninguna llamada
-- existente cambia:
--   · `p_fecha_operacion` — para que la rectificativa declare la fecha de la
--     DEVOLUCIÓN y no la de la venta (ver la decisión 3 de la cabecera);
--   · `p_refund_id` — el reembolso que la originó, que es la clave de su
--     idempotencia (`idx_factura_una_por_reembolso`, 073 §2).
drop function if exists public.emitir_factura(
  uuid, public.factura_tipo, jsonb, jsonb, jsonb, uuid, uuid, uuid
);

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

  -- ⬇️ EL CAMBIO DE LA 077: la fecha de operación puede venir dada. Una
  -- rectificativa declara la fecha de la DEVOLUCIÓN, que es el trimestre en que
  -- el 303 la netea; todo lo demás sigue usando la de devengo de la venta.
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
  'Motor de emisión. Devuelve el id, o NULL si falta el emisor o el desglose (lo recoge el aviso del 303). Desde la 077 acepta la fecha de operación y el reembolso de origen, para las rectificativas.';

-- ── §2 · La rectificativa de una devolución ──────────────────────────────────
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
  v_ya          uuid;
  v_rectifica   uuid;
  v_numero_rect text;
  v_receptor    jsonb;
  v_emisor_nif  text;
  v_lineas      jsonb;
  v_desglose    jsonb;
  v_devuelto_el date;
begin
  -- Idempotencia por reembolso. El índice único de la 073 es el suelo; esto es
  -- para que un reintento devuelva la misma en vez de estrellarse.
  select id into v_ya
  from facturas_emitidas
  where pedido_id = p_pedido_id and tipo = 'rectificativa' and refund_id = p_refund_id;
  if v_ya is not null then return v_ya; end if;

  /**
   * A QUÉ FACTURA RECTIFICA: la vigente de esa venta.
   *
   * ⚠️ El filtro `tipo in (...)` NO es redundante con `vigente`: una rectificativa
   * también sale como vigente —nada la sustituye— y una rectificativa no rectifica
   * a otra rectificativa.
   *
   * ⚠️⚠️ Y SI NO HAY NINGUNA, HAY QUE PARAR AQUÍ. `facturas_rectifica_coherente`
   * exige `rectifica_a not null` en toda rectificativa, así que seguir adelante
   * lanzaría un CHECK **dentro de la transacción de un reembolso ya cobrado**.
   * Pasa con las ventas anteriores a configurar el emisor: no llegaron a tener
   * factura, y no se puede rectificar lo que no se emitió.
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
   *
   * Y eso no es teórico: `VALF202600100`, la factura de prueba del 2026-08-14,
   * quedó con el NIF del propio negocio como receptor, y la 076 lo prohíbe con un
   * CHECK. Heredarlo sin mirar haría que rectificar ESE pedido abortara el
   * reembolso por un dato de prueba de hace días. Se emite sin receptor y se
   * anota, que es mucho mejor que no emitir nada.
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
  select min(public.dia_fiscal(rl.created_at)) into v_devuelto_el
  from public.reembolso_lineas rl
  where rl.pedido_id = p_pedido_id and rl.refund_id = p_refund_id;

  if v_devuelto_el is null then
    -- Llamada para un reembolso que no tiene líneas apuntadas. No hay nada que
    -- rectificar y no es un error: pasa con las devoluciones por importe suelto,
    -- anteriores a la 044.
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
   * Se agrupa por producto porque un mismo artículo podría aparecer en dos líneas
   * del pedido con el mismo precio; sumarlas da un documento más corto y con el
   * mismo importe.
   */
  select jsonb_agg(jsonb_build_object(
           'nombre',          t.nombre,
           'cantidad',        t.cantidad,
           'precio_unitario', t.precio_unitario,
           'iva_pct',         t.iva_pct,
           'importe',         -t.importe
         ) order by t.nombre)
  into v_lineas
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
  ) t;

  /**
   * ⚠️⚠️ EL DESGLOSE, COPIADO DEL BLOQUE `rectificado` DE LA 068 LÍNEA POR LÍNEA.
   *
   * Por tipo de IVA: `con_iva = sum(importe)`, la base se DERIVA dividiendo y la
   * cuota se saca RESTANDO. Restar y no multiplicar es lo que garantiza que
   * `base + cuota` sea exactamente el importe devuelto — con dos redondeos
   * independientes se pierde un céntimo, y ese céntimo separa el documento de la
   * liquidación **sobre el mismo dinero**.
   *
   * El tipo sale de `pedido_items.iva_pct`, el snapshot de lo que se aplicó al
   * VENDER (062), nunca del catálogo: si Hacienda cambia un tipo, la devolución
   * de una venta vieja se rectifica al tipo viejo.
   *
   * En negativo, para que `sum(total)` del libro dé el repercutido del 303.
   */
  select jsonb_agg(jsonb_build_object(
           'iva_pct', d.iva_pct,
           'base',    -round(d.con_iva / (1 + d.iva_pct / 100), 2),
           'cuota',   -(d.con_iva - round(d.con_iva / (1 + d.iva_pct / 100), 2))
         ) order by d.iva_pct)
  into v_desglose
  from (
    select i.iva_pct, sum(rl.importe) as con_iva
    from public.reembolso_lineas rl
    join public.pedido_items i on i.id = rl.pedido_item_id
    where rl.pedido_id = p_pedido_id and rl.refund_id = p_refund_id
    group by i.iva_pct
  ) d;

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
  'La rectificativa de una devolución. Importes en NEGATIVO y aritmética copiada del bloque `rectificado` de la 068, para que el libro y el 303 digan lo mismo. Idempotente por reembolso.';

-- ── §3 · Se emite sola, y no puede tumbar un reembolso ───────────────────────
create or replace function public.reembolso_emite_rectificativa()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  /**
   * ⚠️⚠️⚠️ EL `EXCEPTION` NO ES PEREZA, ES LA REGLA DE ESTA RUTA. Cuando esto
   * corre, el dinero YA salió de Stripe. Dejar que un fallo aquí aborte la
   * transacción convertiría **una devolución hecha** en un error en pantalla, y el
   * cliente se quedaría con su dinero devuelto y el pedido sin apuntarlo. Es la
   * misma regla que `registrarLineas` en la API.
   *
   * ⭐ Y lo que hace aceptable atrapar todo: el fallo NO queda en silencio. Se
   * anota aquí, y el aviso `devolucion_sin_rectificativa` del 303 (075) **sigue
   * cantando** hasta que el documento exista. La red estaba puesta antes que el
   * trapecio.
   *
   * ⚠️ El trigger es POR FILA y un reembolso tiene varias, así que esto corre una
   * vez por línea. La idempotencia de `emitir_rectificativa` hace que solo la
   * primera emita; las demás encuentran la que ya está. Es diferido, así que
   * cuando la primera corre ya están TODAS las líneas — sin eso, la rectificativa
   * saldría por el importe de una sola.
   */
  begin
    perform emitir_rectificativa(new.pedido_id, new.refund_id, new.actor_user_id);
  exception
    when others then
      insert into factura_eventos (evento, detalle, actor_id)
      values ('rectificativa_fallida',
              jsonb_build_object(
                'pedido_id', new.pedido_id,
                'refund_id', new.refund_id,
                'error',     sqlerrm,
                'sqlstate',  sqlstate),
              new.actor_user_id);
  end;

  return null;
end;
$$;

drop trigger if exists trg_reembolso_rectificativa on public.reembolso_lineas;
create constraint trigger trg_reembolso_rectificativa
  after insert on public.reembolso_lineas
  deferrable initially deferred
  for each row execute function public.reembolso_emite_rectificativa();

-- ── §4 · Ponerse al día, para que un fallo sea recuperable sin SQL ───────────
-- Sin esto, una rectificativa que no se emitiera —emisor sin configurar, o el
-- fallo que sea— solo se podría arreglar entrando a la base a mano. El aviso del
-- 303 diría qué falta y no habría botón que lo resolviera.
--
-- Mismo criterio que `emitir_facturas_pendientes` (073): en orden de devolución,
-- para que los números de la serie salgan en el orden en que ocurrieron.
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

  for v_r in
    select rl.pedido_id, rl.refund_id, min(rl.created_at) as cuando
    from public.reembolso_lineas rl
    where not exists (
      select 1 from public.facturas_emitidas f
      where f.pedido_id = rl.pedido_id
        and f.tipo = 'rectificativa'
        and f.refund_id = rl.refund_id
    )
    group by rl.pedido_id, rl.refund_id
    order by min(rl.created_at)
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
  'Emite las rectificativas de las devoluciones que no la tienen. Para el arranque y para recuperar un fallo del trigger sin entrar a la base a mano.';

-- ── §5 · El libro dice a quién rectifica ─────────────────────────────────────
-- `rectifica_a` es un uuid y en pantalla no dice nada. Se resuelve aquí, igual
-- que `sustituida_por`, para que ni la API ni el PDF tengan que cruzarlo.
create or replace view public.libro_facturas_expedidas as
select
  f.*,
  not exists (
    select 1 from public.facturas_emitidas s where s.sustituye_a = f.id
  ) as vigente,
  (select s.numero from public.facturas_emitidas s where s.sustituye_a = f.id) as sustituida_por,
  (select r.numero from public.facturas_emitidas r where r.id = f.rectifica_a) as rectifica_a_numero
from public.facturas_emitidas f;

comment on view public.libro_facturas_expedidas is
  'Las facturas con `vigente`: una simplificada canjeada por una completa NO es vigente y no cuenta en el libro, o el IVA saldría dos veces. Desde la 077 resuelve también el número de la factura rectificada.';

revoke all on public.libro_facturas_expedidas from anon;
revoke all on public.libro_facturas_expedidas from authenticated;

-- ── §6 · Los permisos, revocados y COMPROBADOS (regla de la 062) ─────────────
do $revocar$
declare v_fn text;
begin
  foreach v_fn in array array[
    'public.emitir_factura(uuid, public.factura_tipo, jsonb, jsonb, jsonb, uuid, uuid, uuid, date, text)',
    'public.emitir_rectificativa(uuid, text, uuid)',
    'public.emitir_rectificativas_pendientes(uuid)',
    'public.reembolso_emite_rectificativa()'
  ]
  loop
    execute format('revoke all on function %s from public', v_fn);
    execute format('revoke all on function %s from anon', v_fn);
    execute format('revoke all on function %s from authenticated', v_fn);
  end loop;
end
$revocar$;

do $comprobar$
declare v_fn text;
begin
  foreach v_fn in array array[
    'public.emitir_factura(uuid, public.factura_tipo, jsonb, jsonb, jsonb, uuid, uuid, uuid, date, text)',
    'public.emitir_rectificativa(uuid, text, uuid)',
    'public.emitir_rectificativas_pendientes(uuid)'
  ]
  loop
    if has_function_privilege('anon', v_fn, 'EXECUTE')
       or has_function_privilege('authenticated', v_fn, 'EXECUTE') then
      raise exception '% sigue siendo ejecutable desde internet', v_fn;
    end if;
  end loop;
end
$comprobar$;
