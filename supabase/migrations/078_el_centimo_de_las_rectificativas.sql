-- ============================================================
-- 078 — El céntimo de las rectificativas, y el 303 sumando documentos
--
-- ⚠️⚠️ EL PROBLEMA, DICHO CON LOS NÚMEROS REALES DEL 2026-08-14. La venta
-- `260814015565` declaró `pedido_iva` = base 2,75 / cuota 0,27 (total 3,02). Se
-- devolvió ENTERA, en dos reembolsos parciales, y salieron dos rectificativas:
--
--     0,62 €  →  base 0,56 / cuota 0,06
--     2,40 €  →  base 2,18 / cuota 0,22
--                ───────────────────────
--                base 2,74 / cuota 0,28   ≠  2,75 / 0,27
--
-- El DINERO cuadra al céntimo (3,02 − 0,62 − 2,40 = 0,00). Lo que no vuelve a
-- cero es el reparto: el 303 quedó con `repercutido` = base **+0,01** y cuota
-- **−0,01**. Una cuota negativa sobre una base positiva, en una venta que se
-- devolvió entera y que debería dejar la casilla en cero.
--
-- La causa: cada reembolso derivaba SU base aisladamente —`round(con_iva /
-- (1 + pct/100), 2)`— y dos redondeos independientes no vuelven al original.
-- Partir una factura en dos rectificativas perdía un céntimo por el camino.
--
-- ── §1 · LA SOLUCIÓN: REDONDEO ACUMULADO ─────────────────────────────────────
--
-- La base de cada rectificativa deja de salir de su importe aislado y sale de la
-- base que DEBERÍA llevar rectificada en total, menos la ya rectificada:
--
--     objetivo = round(base_venta × devuelto_acumulado / total_venta, 2)
--     base_doc = objetivo − base_ya_rectificada        (por tipo de IVA)
--     cuota_doc = devuelto_en_este_reembolso − base_doc
--
-- Con los números de arriba: 0,56/0,06 y luego 2,19/0,21 → **2,75 / 0,27**, que
-- es exactamente lo que declaró la venta.
--
-- ⭐ Y las dos propiedades que había que conservar SIGUEN EN PIE:
--
-- 1. `base + cuota` es EXACTAMENTE el dinero devuelto en cada documento. La
--    cuota se sigue sacando RESTANDO, nunca multiplicando — es la regla de la
--    062 y de la 068, y es lo que impide que el documento y la liquidación digan
--    cosas distintas sobre el mismo dinero.
-- 2. Cuando se devuelve todo, la suma vuelve al original **al céntimo**: si
--    `devuelto_acumulado = total_venta`, el objetivo es `round(base_venta) =
--    base_venta`. No es que se compense de casualidad: es que converge.
--
-- ⚠️ Y LA DERIVA NO SE ACUMULA. Como el objetivo se recalcula sobre el acumulado
-- y no sobre el trozo, un céntimo de diferencia vive como mucho ENTRE dos
-- devoluciones parciales, y se cierra solo en la siguiente. El error no crece con
-- el número de devoluciones, que es justo lo que sí hacía el reparto anterior.
--
-- ⚠️⚠️ POR QUÉ LA PROPORCIÓN ES EXACTA Y NO UNA APROXIMACIÓN, que es lo que hay
-- que comprobar antes de fiarse de una regla de tres sobre dinero: `pedido_iva`
-- se construye (062) con `sum(precio_unitario × cantidad)` de `pedido_items`, y
-- `reembolso_lineas.importe` es una copia de `cantidad × precio_unitario` de esas
-- MISMAS líneas. **No hay coste de envío ni ningún otro concepto fuera de los
-- artículos** —`recalcular_iva_pedido` aborta si el desglose no suma el total
-- cobrado—, así que el universo devolvible y el universo declarado son el mismo.
-- Si algún día se cobra el envío aparte, esta proporción hay que revisarla: sería
-- dinero declarado que no se puede devolver.
--
-- ── §2 · Y HABÍA UN PROBLEMA MÁS GORDO QUE EL CÉNTIMO ────────────────────────
--
-- ⚠️⚠️ LA ARITMÉTICA ESTABA DUPLICADA. La 077 la escribió para el documento y la
-- 068 la tenía para el 303 —«copiada del bloque `rectificado` línea por línea»,
-- dice su propio comentario—. Arreglar solo la 077 habría hecho que el documento
-- dijera 2,19/0,21 y el 303 siguiera calculando 2,18/0,22 **sobre el mismo
-- reembolso**: el descuadre pasaría de un céntimo a una contradicción.
--
-- Es EL MISMO PATRÓN QUE COSTÓ LA 074: el formato del número vivía en tres sitios
-- y la huella certificaba uno mientras la impresión sacaba otro. Mientras
-- coinciden no pasa nada; el día que difieren, nadie lo ve.
--
-- Así que el 303 deja de recalcular y **suma el desglose de las rectificativas
-- emitidas**, que es además lo que dice hacer: «el 303 suma documentos» (068).
-- Sigue calculando por su cuenta SOLO los reembolsos que todavía no tienen
-- documento, con el mismo predicado exacto del aviso `devolucion_sin_
-- rectificativa` de la 075 — para que el aviso y el número no se contradigan.
--
-- ⚠️ El periodo de un documento se decide por `fecha_operacion`, que en una
-- rectificativa ES la fecha de la devolución (077 §2 la fija con
-- `min(dia_fiscal(rl.created_at))`). O sea el MISMO criterio que usaba el bloque
-- viejo: las dos mitades parten el conjunto sin solaparse y sin dejar hueco.
--
-- ── Lo que esta migración NO toca, y por qué ─────────────────────────────────
--
-- **El bloque `devengado` sigue leyendo `pedido_iva`**, no las facturas. Y no es
-- una incoherencia con lo de arriba: el desglose de una factura de venta es una
-- COPIA de `pedido_iva` (073, «copiar y nunca recalcular»), no una segunda
-- aritmética. No hay dos fórmulas que puedan divergir, así que no hay nada que
-- unificar. Donde sí había dos fórmulas era en el rectificado, y es lo que se
-- arregla aquí.
--
-- **Y NO SE TOCA NINGÚN DOCUMENTO YA EMITIDO.** No se podría: `trg_factura_
-- inmutable` lo impide y el número entra en la huella. Las cuatro facturas de
-- prueba del 2026-08-14 se quedan con el céntimo viejo hasta que se borren con
-- `limpiar_datos_de_prueba()`. Esto vale desde la próxima rectificativa.
--
-- ── Ensayo en transacción revertida, 4/4 (2026-08-15) ────────────────────────
--   A · las dos en orden        → 0,56/0,06 + 2,19/0,21 = 2,75/0,27 · repercutido 0,00/0,00
--   B · las dos al revés        → 2,19/0,21 + 0,56/0,06 = 2,75/0,27 · repercutido 0,00/0,00
--   C · una sin documento       → el 303 la sigue contando y el aviso canta
--   D · ninguna emitida         → idéntico a antes de la 078 (sin regresión)
-- ============================================================

-- ── §1 · La rectificativa, con redondeo acumulado ────────────────────────────
--
-- Se reemplaza entera (misma firma, así que no hace falta `drop`): lo único que
-- cambia es el bloque del desglose. El resto —idempotencia por reembolso, a qué
-- factura rectifica, el receptor heredado que se cae si es el propio emisor, la
-- fecha de la devolución y las líneas en negativo— es de la 077 y sigue igual.
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
  -- ⚠️⚠️ Y DESDE LA 078 ES ADEMÁS LO QUE EMPAREJA EL DOCUMENTO CON EL PERIODO EN
  -- LA LIQUIDACIÓN: el 303 filtra las rectificativas por `fecha_operacion`. Si
  -- esto dejara de ser la fecha de la devolución, el 303 contaría el rectificado
  -- en otro trimestre.
  select min(public.dia_fiscal(rl.created_at)) into v_devuelto_el
  from public.reembolso_lineas rl
  where rl.pedido_id = p_pedido_id and rl.refund_id = p_refund_id;

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
   * ⭐⭐ EL DESGLOSE, CON REDONDEO ACUMULADO (078). Ver la cabecera para el porqué
   * y para los números que lo destaparon.
   *
   * Por tipo de IVA:
   *   objetivo  = round(base_venta × (ya_devuelto + esto) / total_venta, 2)
   *   base_doc  = objetivo − base_ya_rectificada
   *   cuota_doc = esto − base_doc          ← RESTANDO, nunca multiplicando
   *
   * ⚠️ `ya` SE LEE DE LOS DOCUMENTOS EMITIDOS, no de `reembolso_lineas`. Es lo
   * que hace que esto sea **independiente del orden**: si una rectificativa falló
   * y se emite después con `emitir_rectificativas_pendientes`, cada una ve lo que
   * de verdad hay emitido y la última cierra el resto. Contar reembolsos en vez
   * de documentos daría por rectificado lo que no tiene papel.
   *
   * ⚠️ EL `case` DEL FALLBACK NO ES DEFENSIVO POR SI ACASO: las ventas anteriores
   * a la 062 no tienen fila en `pedido_iva`, y sin `total_venta` no hay
   * proporción que calcular. Ahí se deriva como antes —aislado, con su céntimo—
   * porque es lo único que se puede hacer y es lo que ya hacía.
   *
   * ⚠️⚠️ EL `least/greatest` ES PARA QUE UN DOCUMENTO NUNCA SALGA CON LA CUOTA DEL
   * SIGNO CONTRARIO A SU BASE. Solo puede morder en devoluciones de céntimos
   * sueltos y solo si viene arrastrado un desajuste previo; y cuando muerde, el
   * céntimo que no absorbe **lo recoge la siguiente rectificativa**, porque el
   * objetivo se recalcula sobre el acumulado. Es decir: acotar aquí no rompe la
   * convergencia, la retrasa un documento. Un papel con base 0,05 y cuota −0,01
   * no lo arregla nadie después.
   */
  with esto as (
    select i.iva_pct, sum(rl.importe) as con_iva
    from public.reembolso_lineas rl
    join public.pedido_items i on i.id = rl.pedido_item_id
    where rl.pedido_id = p_pedido_id and rl.refund_id = p_refund_id
    group by i.iva_pct
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
  'La rectificativa de una devolución. Importes en NEGATIVO y, desde la 078, base con REDONDEO ACUMULADO sobre `pedido_iva`: devolver una venta entera en varios reembolsos vuelve exactamente a la base y la cuota que declaró la venta. Idempotente por reembolso.';

-- ── §2 · El 303 suma documentos y deja de recalcular ─────────────────────────
--
-- Se reemplaza entera porque `liquidacion_iva` es una sola función: lo único que
-- cambia es el bloque `rectificado` (y su contador de documentos). El resto
-- —devengado, deducible y los ocho avisos— es de la 068, la 070 y la 075, y va
-- copiado tal cual.
create or replace function public.liquidacion_iva(
  p_desde date,
  p_hasta date
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
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
  v_d_docs       integer := 0;
  v_r_docs       integer := 0;
  v_c_docs       integer := 0;
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
  -- El filtro es `devengado_el`, NO `created_at`.
  --
  -- ⚠️ Sigue leyendo `pedido_iva` y no las facturas emitidas, a diferencia del
  -- bloque de abajo: el desglose de una factura de venta es una COPIA de
  -- `pedido_iva` (073), no una segunda aritmética. No hay dos fórmulas que puedan
  -- divergir. El aviso `venta_sin_factura` es quien cuida que además haya papel.
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

  select count(distinct p.id) into v_d_docs
  from public.pedidos p
  join public.pedido_iva pv on pv.pedido_id = p.id
  where p.devengado_el is not null
    and public.dia_fiscal(p.devengado_el) between p_desde and p_hasta;

  /**
   * ── Rectificado: las devoluciones del periodo ─────────────────────────────
   *
   * ⭐⭐ DESDE LA 078 ESTO SUMA DOCUMENTOS, NO RECALCULA. Antes derivaba la base
   * de cada reembolso por su cuenta con la misma fórmula que la 077 usaba para
   * emitir el documento: dos implementaciones de la misma aritmética sobre el
   * mismo dinero, que es exactamente lo que costó la 074 con el formato del
   * número de factura. Ahora el documento manda y el 303 lo suma.
   *
   * Son dos mitades que parten el conjunto sin solaparse:
   *
   *   · `doc`     — las rectificativas emitidas, por `fecha_operacion`, que en
   *                 una rectificativa ES la fecha de la devolución (077 §2). Su
   *                 desglose está en negativo y aquí se pasa a positivo, porque
   *                 este bloque se RESTA después (`repercutido = devengado −
   *                 rectificado`).
   *   · `sin_doc` — las devoluciones que todavía no tienen documento, con la
   *                 derivación de siempre.
   *
   * ⚠️⚠️ EL PREDICADO DE `sin_doc` ES EL MISMO, LITERAL, QUE EL DEL AVISO
   * `devolucion_sin_rectificativa` de la 075. Tiene que serlo: el aviso dice «esta
   * liquidación YA descuenta su IVA aunque no haya papel», y si los dos
   * predicados divergieran, el aviso estaría describiendo un número que no es el
   * que sale. Se cambian juntos o no se cambia ninguno.
   *
   * ⚠️ `vigente` en `doc`: una rectificativa no la sustituye nadie hoy, pero el
   * libro es quien decide qué cuenta, y sumar aquí lo que el libro no cuenta es
   * la vía de contar el IVA dos veces (073 §5).
   */
  with doc as (
    select f.refund_id                    as ref,
           (d->>'iva_pct')::numeric       as iva_pct,
           -(d->>'base')::numeric         as base,
           -(d->>'cuota')::numeric        as cuota
    from public.libro_facturas_expedidas f
    cross join lateral jsonb_array_elements(f.desglose) d
    where f.tipo = 'rectificativa'
      and f.vigente
      and coalesce(f.fecha_operacion, f.fecha_expedicion) between p_desde and p_hasta
  ),
  sin_doc as (
    select rl.refund_id as ref, i.iva_pct, sum(rl.importe) as con_iva
    from public.reembolso_lineas rl
    join public.pedido_items i on i.id = rl.pedido_item_id
    where public.dia_fiscal(rl.created_at) between p_desde and p_hasta
      and not exists (
        select 1 from public.facturas_emitidas f
        where f.pedido_id  = rl.pedido_id
          and f.tipo       = 'rectificativa'
          and f.refund_id  = rl.refund_id
      )
    group by rl.refund_id, i.iva_pct
  ),
  por_documento as (
    select ref, iva_pct, base, cuota from doc
    union all
    select ref, iva_pct,
           round(con_iva / (1 + iva_pct / 100), 2) as base,
           con_iva - round(con_iva / (1 + iva_pct / 100), 2) as cuota
    from sin_doc
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
           count(distinct ref) as documentos
    from por_documento group by iva_pct
  ) t;

  -- Los documentos del bloque: rectificativas emitidas + devoluciones sin ella.
  -- Mismos dos criterios de arriba, y por eso mismo no se pueden tocar por
  -- separado.
  select count(*) into v_r_docs
  from (
    select f.refund_id as ref
    from public.libro_facturas_expedidas f
    where f.tipo = 'rectificativa'
      and f.vigente
      and coalesce(f.fecha_operacion, f.fecha_expedicion) between p_desde and p_hasta
    union
    select rl.refund_id
    from public.reembolso_lineas rl
    where public.dia_fiscal(rl.created_at) between p_desde and p_hasta
      and not exists (
        select 1 from public.facturas_emitidas f
        where f.pedido_id  = rl.pedido_id
          and f.tipo       = 'rectificativa'
          and f.refund_id  = rl.refund_id
      )
  ) r;

  -- ── Deducible: lo soportado en las compras del periodo ──────────────────
  -- ⚠️ POR `created_at`, LA FECHA DE REGISTRO, NO POR LA DE LA FACTURA.
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

  -- ⚠️ Los MISMOS filtros que el bloque de arriba, y eso hay que mantenerlo.
  select count(distinct fci.factura_id) into v_c_docs
  from public.factura_compra_items fci
  join public.facturas_compra f on f.id = fci.factura_id
  where fci.iva_pct is not null
    and fci.costo_unitario is not null
    and public.dia_fiscal(f.created_at) between p_desde and p_hasta;

  -- ── Los avisos ─────────────────────────────────────────────────────────
  -- ⚠️⚠️ NO son decoración, son la mitad del valor del informe.

  -- ── ⭐ AQUÍ ESTABA EL AVISO FALSO (la 068 y la 070 lo ponían siempre) ────────
  -- ⚠️⚠️ EL PREDICADO ES EL MISMO QUE USA `emitir_facturas_pendientes` (073), y
  -- tiene que serlo: si el aviso contara una cosa y el botón «emitir las que
  -- faltan» emitiera otra, el panel se contradiría a sí mismo.
  --
  -- No se mira `vigente`: una simplificada sustituida NO cuenta en el libro, pero
  -- su venta SÍ tiene documento (la completa que la sustituyó). Filtrar por
  -- vigencia haría que cada canje inventara una venta sin facturar.
  select count(*), string_agg(p.numero_pedido, ', ' order by p.numero_pedido)
  into v_cuantos, v_refs
  from public.pedidos p
  where p.devengado_el is not null
    and public.dia_fiscal(p.devengado_el) between p_desde and p_hasta
    and not exists (
      select 1 from public.facturas_emitidas f
      where f.pedido_id = p.id and f.tipo in ('simplificada', 'completa')
    );

  if v_cuantos > 0 then
    v_avisos := v_avisos || jsonb_build_object(
      'clase', 'venta_sin_factura',
      'gravedad', 'grave',
      'titulo', v_cuantos || ' venta(s) devengadas sin factura',
      'detalle', 'Estas ventas declaran su IVA en esta liquidación y no tienen documento en '
                 'el libro de facturas expedidas, que es con lo que se soporta un 303. Cada '
                 'venta emite su simplificada sola, así que esto solo pasa con las anteriores '
                 'a que el emisor estuviera configurado. Se arregla en Contabilidad → '
                 'Facturas, con «emitir las que faltan».',
      'cuantos', v_cuantos,
      'referencias', to_jsonb(string_to_array(coalesce(v_refs, ''), ', '))
    );
  end if;

  -- ── Devoluciones sin rectificativa: el libro y esta liquidación discrepan ───
  -- Mismo criterio de documento y de periodo que el bloque `rectificado`.
  -- `cuantos` cuenta REEMBOLSOS y `referencias` lista los pedidos afectados, así
  -- que pueden no coincidir: un pedido admite varias devoluciones parciales.
  select count(distinct rl.refund_id), string_agg(distinct p.numero_pedido, ', ')
  into v_cuantos, v_refs
  from public.reembolso_lineas rl
  join public.pedidos p on p.id = rl.pedido_id
  where public.dia_fiscal(rl.created_at) between p_desde and p_hasta
    and not exists (
      select 1 from public.facturas_emitidas f
      where f.pedido_id  = rl.pedido_id
        and f.tipo       = 'rectificativa'
        and f.refund_id  = rl.refund_id
    );

  if v_cuantos > 0 then
    v_avisos := v_avisos || jsonb_build_object(
      'clase', 'devolucion_sin_rectificativa',
      'gravedad', 'aviso',
      'titulo', v_cuantos || ' devolución(es) sin factura rectificativa',
      'detalle', 'Esta liquidación YA descuenta su IVA (bloque rectificado), pero el libro de '
                 'facturas expedidas sigue diciendo que se facturó el importe entero. Los dos '
                 'tienen razón por separado y no cuadran entre sí: la rectificativa es el '
                 'documento que los reconcilia y todavía no se emite. La diferencia es esta, '
                 'y está contada.',
      'cuantos', v_cuantos,
      'referencias', to_jsonb(string_to_array(coalesce(v_refs, ''), ', '))
    );
  end if;

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
      'devengado_documentos', v_d_docs,
      'rectificado_base', v_r_base,
      'rectificado_cuota', v_r_cuota,
      'rectificado_documentos', v_r_docs,
      'repercutido_base', v_d_base - v_r_base,
      'repercutido_cuota', v_d_cuota - v_r_cuota,
      'deducible_base', v_c_base,
      'deducible_cuota', v_c_cuota,
      'deducible_documentos', v_c_docs,
      'resultado', (v_d_cuota - v_r_cuota) - v_c_cuota
    ),
    'avisos', v_avisos
  );
end;
$$;

comment on function public.liquidacion_iva is
  'El 303 del periodo. Desde la 078 el bloque `rectificado` SUMA el desglose de las rectificativas emitidas y solo deriva por su cuenta las devoluciones que aún no tienen documento (mismo predicado que el aviso `devolucion_sin_rectificativa`).';

-- ── §3 · Los permisos, revocados y COMPROBADOS (regla de la 062) ─────────────
-- `create or replace` conserva los permisos que hubiera, así que esto no debería
-- cambiar nada. Se hace igualmente: el día que una de estas funciones se cree de
-- cero en otra migración, esta comprobación es la que lo caza.
do $revocar$
declare v_fn text;
begin
  foreach v_fn in array array[
    'public.emitir_rectificativa(uuid, text, uuid)',
    'public.liquidacion_iva(date, date)'
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
    'public.emitir_rectificativa(uuid, text, uuid)',
    'public.liquidacion_iva(date, date)'
  ]
  loop
    if has_function_privilege('anon', v_fn, 'EXECUTE')
       or has_function_privilege('authenticated', v_fn, 'EXECUTE') then
      raise exception '% sigue siendo ejecutable desde internet', v_fn;
    end if;
  end loop;
end
$comprobar$;
