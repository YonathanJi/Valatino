-- ═══════════════════════════════════════════════════════════════════════════════
-- §2 y §3 de la 083 — GENERADO por scripts/generar-083-funciones.mjs
--
-- ⚠️⚠️ NO EDITAR A MANO. Las dos funciones que solo cambian el nombre de la función
-- de reparto se extrajeron del `prosrc` VIVO de la base y se les aplicó el parche
-- por script, con el número de sustituciones verificado. Editarlas aquí rompe esa
-- garantía: vuelve a generar.
--
-- md5 de los cuerpos vivos de los que se partió, para poder demostrar de dónde
-- salió esto:
--   linea_envio_factura(p_pedido_id uuid, p_signo integer)
--     md5(prosrc) = 2853c587e3eb0d048390d2311f41cae8  ·  961 caracteres
--   emitir_rectificativa(p_pedido_id uuid, p_refund_id text, p_actor_id uuid)
--     md5(prosrc) = 29731fbc1dc96e80917501c4f97471ce  ·  9900 caracteres
-- ═══════════════════════════════════════════════════════════════════════════════


-- ── §2.0 · EL GUARDIA DEL DROP ──────────────────────────────────────────────
--
-- ⚠️⚠️ POSTGRES NO AVISA. Dropear una función no comprueba quién la llama: los
-- consumidores siguen compilando y fallan AL EJECUTARSE, y los tres que hay están
-- en la ruta del dinero (el desglose de la venta, la línea de la factura y el
-- desglose de la rectificativa). Así que se comprueba a mano ANTES de dropear.
--
-- ⚠️ Y NO SE DEJA UN WRAPPER con el nombre viejo, que sería lo cómodo. Un
-- `reparto_envio_pedido` que siguiera existiendo devolvería el porte y CALLARÍA el
-- descuento: un consumidor que no se migrara daría un desglose sin descuento, que
-- cuadra consigo mismo y no cuadra con lo cobrado. Es mejor que falle ruidosamente.

do $comprobar$
declare
  v_inesperados text;
begin
  select string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ', ')
    into v_inesperados
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.prosrc like '%reparto_envio_pedido%'
    and p.proname not in ('reparto_envio_pedido', 'recalcular_iva_pedido', 'linea_envio_factura', 'emitir_rectificativa');

  if v_inesperados is not null then
    raise exception
      'Hay consumidores de reparto_envio_pedido que esta migración NO recrea: %. Postgres no avisa: fallarían al ejecutarse y están en la ruta del dinero.',
      v_inesperados;
  end if;
end $comprobar$;


-- ── §2 · EL REPARTO, GENERALIZADO A DOS CONCEPTOS ────────────────────────────
--
-- ⭐⭐ SIGUE SIENDO EL ÚNICO SITIO QUE REPARTE. La 080 puso aquí el prorrateo del
-- porte y dejó escrito por qué vive en una sola función: la llaman el desglose,
-- las líneas de la factura y el desglose de la rectificativa, y escribirlo tres
-- veces es exactamente el patrón que costó la 074 —el formato del número de
-- factura vivía en tres sitios y la huella certificaba uno mientras la impresión
-- sacaba otro—. Aquí sería peor: el documento diría un reparto y el 303 otro,
-- sobre el mismo dinero.
--
-- ⚠️⚠️ LOS DOS CONCEPTOS COMPARTEN LA MISMA VENTANA, Y NO ES ESTÉTICA. El porte y
-- el descuento se ponderan por el MISMO acumulado de artículos, con el MISMO
-- `order by iva_pct`. Es lo que hace que la suma de los netos por artículo de un
-- tipo sea EXACTAMENTE `articulos(t) - descuento(t)`, o sea que el universo
-- devolvible y el universo declarado vuelvan a ser el mismo conjunto — la
-- precondición que la 078 escribió en su cabecera. Con dos ventanas distintas
-- (por ejemplo ordenando una por `iva_pct` y otra por otra cosa) los dos números
-- dejarían de coincidir y el descuadre saldría en el 303, no aquí.
--
-- ⭐ EL ACUMULADO SE ESCRIBE UNA SOLA VEZ, a diferencia de la 080, que repetía la
-- ventana. Con dos conceptos habría que escribirla dos veces, y dos ventanas que
-- tienen que ser idénticas y están escritas por separado son un sitio donde
-- divergir en silencio. Se saca a su propio CTE (`acum.art_acum`).
--
-- ⚠️ EL REDONDEO ACUMULADO ES LO QUE HACE QUE LA SUMA SEA EXACTA POR
-- CONSTRUCCIÓN, para los dos conceptos y por la misma razón:
--
--     concepto_acum(i) = round(concepto × Σ_{j≤i} articulos(j) / articulos_total, 2)
--     concepto(i)      = concepto_acum(i) − concepto_acum(i−1)
--
-- El último acumulado es `round(concepto × 1, 2)` = el concepto entero, y los
-- trozos son sus diferencias: telescopan. Redondear cada trozo por su cuenta NO
-- suma (falla en 24 de 64 combinaciones, medido en la 080).

create or replace function public.reparto_conceptos_pedido(p_pedido_id uuid)
returns table (iva_pct numeric, articulos numeric, envio numeric, descuento numeric)
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
    -- ⚠️ Los dos conceptos van como SUBCONSULTAS ESCALARES, igual que el porte en
    -- la 080, y no como un `cross join` a la fila del pedido. Se intentó lo
    -- segundo el 2026-08-23 «para leerlos en una pasada» y el ensayo revertido lo
    -- tumbó: con `sum(g.articulos)` en el mismo SELECT, las columnas del join
    -- tendrían que estar en el GROUP BY. Dos escaneos de una fila por clave
    -- primaria no son un problema; una agregación torcida sí.
    select coalesce(sum(g.articulos), 0) as articulos_total,
           (select coalesce(p.coste_envio, 0)
            from public.pedidos p where p.id = p_pedido_id) as envio,
           (select coalesce(p.descuento, 0)
            from public.pedidos p where p.id = p_pedido_id) as descuento
    from g
  ),
  acum as (
    select g.iva_pct,
           g.articulos,
           t.articulos_total,
           t.envio,
           t.descuento,
           -- ⭐ LA VENTANA, UNA SOLA VEZ. La comparten los dos conceptos.
           sum(g.articulos) over (
             order by g.iva_pct
             rows between unbounded preceding and current row
           ) as art_acum
    from g cross join t
  ),
  rep as (
    select a.iva_pct,
           a.articulos,
           -- El `case` no es defensivo por si acaso: un catálogo con precio 0 daría
           -- articulos_total = 0 y una división por cero. Sin artículos que
           -- ponderen, no hay reparto posible. Viene de la 080 y se conserva.
           case when a.articulos_total > 0
                then round(a.envio * a.art_acum / a.articulos_total, 2) else 0 end as envio_acum,
           case when a.articulos_total > 0
                then round(a.descuento * a.art_acum / a.articulos_total, 2) else 0 end as descuento_acum
    from acum a
  )
  select r.iva_pct,
         r.articulos,
         r.envio_acum     - coalesce(lag(r.envio_acum)     over (order by r.iva_pct), 0),
         r.descuento_acum - coalesce(lag(r.descuento_acum) over (order by r.iva_pct), 0)
  from rep r;
$$;

comment on function public.reparto_conceptos_pedido(uuid) is
  'Por tipo de IVA: lo que aportan los artículos, lo que le toca de porte y lo que le toca de descuento (083). Sucede a reparto_envio_pedido, que se dropeó. Es el ÚNICO sitio que reparte: la llaman recalcular_iva_pedido, linea_envio_factura y emitir_rectificativa. Los dos conceptos comparten la MISMA ventana de ponderación a propósito — ver §2 de la migración.';

revoke execute on function public.reparto_conceptos_pedido(uuid) from public, anon, authenticated;


-- ── §3 · EL DESGLOSE, CON UN TÉRMINO MÁS ────────────────────────────────────
--
-- ⭐⭐ EL GUARDIA NO CAMBIA NI UNA LETRA, Y ESO ES LA COMPROBACIÓN DE QUE ESTO ESTÁ
-- BIEN. Es literalmente lo que la 080 dijo de sí misma, y el comentario del propio
-- guardia —escrito en la 062, antes de que existiera el envío— nombra este trabajo:
-- «Si algún día cambia cómo se calcula el total del pedido —unos gastos de envío,
-- un descuento—, esto salta aquí». El invariante pasa a cubrir el descuento SIN
-- haber tenido que relajarlo.
--
-- ⭐ LO ÚNICO QUE CAMBIA DE FONDO: `articulos + envio` pasa a
-- `articulos + envio - descuento`.
--
-- ⚠️ Y SE SACA A UN SUBSELECT PARA ESCRIBIRLO UNA SOLA VEZ. La 080 repetía
-- `(r.articulos + r.envio)` dos veces —una para la base y otra para la cuota—; con
-- el descuento serían tres, y una expresión de dinero repetida tres veces es un
-- sitio donde divergir. Ahora `con_iva` se define UNA vez y la regla de la 062
-- queda a la vista: la base se DERIVA dividiendo el importe agregado, y la cuota se
-- saca RESTANDO, nunca multiplicando. Es lo que hace que base + cuota sea
-- exactamente lo cobrado.
--
-- ⚠️ Si el descuento imputado a un tipo se comiera su aportación, `con_iva` saldría
-- negativo y el CHECK `base >= 0` de la 062 abortaría la venta. NO puede pasar con
-- un porcentaje —la demostración está en el §0.2 de esta migración— y el CHECK se
-- queda como red, no como defensa activa.

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
  select p_pedido_id, y.iva_pct, y.base, y.con_iva - y.base
  from (
    select x.iva_pct,
           x.con_iva,
           round(x.con_iva / (1 + x.iva_pct / 100), 2) as base
    from (
      -- El importe con IVA del grupo, definido UNA vez: artículos, más lo que le
      -- toca de porte, menos lo que le toca de descuento.
      select r.iva_pct, r.articulos + r.envio - r.descuento as con_iva
      from public.reparto_conceptos_pedido(p_pedido_id) r
    ) x
  ) y;

  -- El desglose tiene que sumar EXACTAMENTE lo cobrado. Si algún día cambia
  -- cómo se calcula el total del pedido —otro concepto—, esto salta aquí, en el
  -- momento de la venta, y no en el modelo 303 tres meses después con el
  -- trimestre ya cerrado.
  --
  -- ⚠️ Desde la 080 esto cubre también el envío, y desde la 083 el descuento. Es
  -- además lo que caza que alguien edite `pedidos.coste_envio` o
  -- `pedidos.descuento` de un pedido ya creado: el trigger del desglose escucha a
  -- `pedido_items`, no a `pedidos`, así que un cambio a mano no recalcula nada —
  -- pero la siguiente factura de ese pedido no se emite.
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


-- ── §2.1 · linea_envio_factura — SOLO CAMBIA EL NOMBRE DEL REPARTO ─
--
-- Extraída del `prosrc` vivo (md5 2853c587e3eb0d048390d2311f41cae8) y parcheada por script:
-- 1 sustitución(es) de reparto_envio_pedido → reparto_conceptos_pedido, verificadas. Ni una letra más.

CREATE OR REPLACE FUNCTION public.linea_envio_factura(p_pedido_id uuid, p_signo integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  from public.reparto_conceptos_pedido(p_pedido_id) r
  where r.envio > 0;
$function$
;

revoke execute on function public.linea_envio_factura(uuid, integer) from public, anon, authenticated;


-- ── §2.2 · emitir_rectificativa — SOLO CAMBIA EL NOMBRE DEL REPARTO 
--
-- Extraída del `prosrc` vivo (md5 29731fbc1dc96e80917501c4f97471ce) y parcheada por script:
-- 1 sustitución(es) de reparto_envio_pedido → reparto_conceptos_pedido, verificadas. Ni una letra más.

CREATE OR REPLACE FUNCTION public.emitir_rectificativa(p_pedido_id uuid, p_refund_id text, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
      from public.reparto_conceptos_pedido(p_pedido_id) r
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
$function$
;

revoke execute on function public.emitir_rectificativa(uuid, text, uuid) from public, anon, authenticated;


-- ── §2.9 · LO QUE HAY QUE COMPROBAR DESPUÉS ─────────────────────────────────

drop function if exists public.reparto_envio_pedido(uuid);

do $comprobar$
begin
  -- El nombre viejo no puede quedar ni como sobrecarga.
  if exists (
    select 1 from pg_proc
    where pronamespace = 'public'::regnamespace and proname = 'reparto_envio_pedido'
  ) then
    raise exception 'reparto_envio_pedido sigue existiendo tras el drop.';
  end if;

  -- UNA sola sobrecarga de la nueva. El otro fallo clásico de reemplazar
  -- funciones con defaults es dejar la firma vieja colgando: hoy mismo se
  -- encontró `cancelar_transferencia_reemplazada` con DOS, así que pasa de verdad.
  if (select count(*) from pg_proc
      where pronamespace = 'public'::regnamespace and proname = 'reparto_conceptos_pedido') <> 1 then
    raise exception 'reparto_conceptos_pedido tiene más de una sobrecarga.';
  end if;

  -- Y nadie puede haberse quedado apuntando al nombre viejo.
  if exists (
    select 1 from pg_proc
    where pronamespace = 'public'::regnamespace and prosrc like '%reparto_envio_pedido%'
  ) then
    raise exception 'Queda alguna función llamando a reparto_envio_pedido después del drop.';
  end if;
end $comprobar$;

-- ⚠️⚠️ LA REVOCACIÓN SE COMPRUEBA, NO SE SUPONE. Regla de la 062 §5: hay DOS
-- fuentes de permiso —la herencia de PUBLIC y el grant por defecto de Supabase— y
-- el REVOKE no protesta si te dejas una. Presente en la 068, la 075 y la 078 §3.
do $comprobar$
declare
  v_fn   text;
  v_rol  text;
begin
  foreach v_fn in array array[
    'public.reparto_conceptos_pedido(uuid)',
    'public.recalcular_iva_pedido(uuid)',
    'public.linea_envio_factura(uuid, integer)'
  ]
  loop
    foreach v_rol in array array['anon', 'authenticated']
    loop
      if has_function_privilege(v_rol, v_fn, 'EXECUTE') then
        raise exception 'El rol % todavía puede ejecutar %: la revocación no surtió efecto.', v_rol, v_fn;
      end if;
    end loop;
  end loop;
end $comprobar$;
