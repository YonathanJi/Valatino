-- ═══════════════════════════════════════════════════════════════════════════════
-- ENSAYO DEL §2 Y §3 DE LA 083 — el reparto y el desglose con descuento
-- ═══════════════════════════════════════════════════════════════════════════════
--
--   node scripts/aplicar-sql.mjs --dry \
--     supabase/migrations/083_codigos_de_descuento.sql \
--     scripts/083_funciones.generado.sql \
--     scripts/ensayo-083-descuento.sql
--
-- ⚠️⚠️ ES AUTOVERIFICABLE A PROPÓSITO: cada bloque LANZA si el número no es el
-- esperado, en vez de imprimir una tabla que alguien tiene que leer con cuidado.
-- La lección está en ESTADO.md y ya ha costado dos veces: una comprobación cuya
-- aguja casa con otra cosa parecida no comprueba nada, y encima sale en verde.
-- Un `select` que enseña 9,34 al lado de 9,34 esperado se lee en diagonal y se da
-- por bueno; un `raise exception` no.
--
-- ⚠️ NO CREA FACTURA, y es deliberado. Se monta el pedido en PENDIENTE_PAGO y sin
-- `devengado_el`, así que `trg_pedido_simplificada` no dispara. La factura con
-- descuento es el §7 y todavía no está escrita: emitirla aquí daría un documento
-- cuyas líneas suman los artículos y el porte SIN restar el descuento — que es
-- exactamente el agujero que el §7 y el guardia nuevo del §8 vienen a cerrar. El
-- bloque E de abajo lo demuestra en vez de esconderlo.
--
-- EL CASO. Carrito mixto, que es el que importa: un tipo solo valida cualquier
-- prorrateo, porque el reparto entero le toca a él.
--
--   artículos   10,00 al 10 %  +  5,00 al 21 %   =  15,00
--   envío                                            3,40
--   código ENSAYO20  −20 % sobre artículos          −3,00
--   ───────────────────────────────────────────────────────
--   TOTAL A COBRAR                                  15,40
--
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Preparación: dos productos reales, uno de cada tipo ──────────────────────

do $ensayo$
declare
  v_p10     uuid;
  v_p21     uuid;
  v_pedido  uuid;
begin
  select id into v_p10 from productos where activo and iva_pct = 10 order by id limit 1;
  select id into v_p21 from productos where activo and iva_pct = 21 order by id limit 1;

  if v_p10 is null or v_p21 is null then
    raise exception 'El ensayo necesita un producto activo al 10 %% y otro al 21 %%. Sin carrito mixto no prueba nada.';
  end if;

  -- El pedido se inserta ANTES de sus líneas, con sus dos conceptos de dinero ya
  -- puestos: el trigger del desglose escucha a `pedido_items`, no a `pedidos`, así
  -- que si el descuento no está aquí no se recalcula nada. Es la misma razón por la
  -- que `coste_envio` va en este insert desde la 080.
  insert into pedidos (
    numero_pedido, estado, total, coste_envio, descuento, descuento_codigo,
    metodo_pago, email_cliente
  ) values (
    'ENSAYO083', 'PENDIENTE_PAGO', 15.40, 3.40, 3.00, 'ENSAYO20',
    'stripe', 'ensayo-083@valatino.es'
  )
  returning id into v_pedido;

  -- Las dos líneas, en UNA sola sentencia: el trigger del desglose es
  -- `for each statement`, así que insertarlas por separado lo dispararía dos veces
  -- y no reproduciría lo que hace `confirmar_venta`.
  --
  -- ⚠️ `iva_pct` NO se escribe a mano: lo pone el trigger `pedido_item_hereda_iva`
  -- desde `productos`, que es lo que garantiza que el tipo del ensayo sea el tipo
  -- real del catálogo y no uno que yo haya supuesto. Y `nombre_producto` sí, porque
  -- es la copia congelada del nombre y es `not null`.
  insert into pedido_items (pedido_id, producto_id, nombre_producto, cantidad, precio_unitario)
  select v_pedido, p.id, p.nombre, 1, 10.00 from productos p where p.id = v_p10
  union all
  select v_pedido, p.id, p.nombre, 1,  5.00 from productos p where p.id = v_p21;

  -- ⭐⭐ SI LA ARITMÉTICA ESTUVIERA MAL, NO SE LLEGA HASTA AQUÍ. El insert de arriba
  -- dispara `recalcular_iva_pedido`, y su guardia aborta si el desglose no suma
  -- exactamente `pedidos.total`. O sea que el ensayo empieza a comprobar antes de
  -- ejecutar su primera comprobación.
  raise notice 'Pedido de ensayo creado y el guardia del desglose lo aceptó.';
end $ensayo$;


-- ── A · El reparto por tipo ──────────────────────────────────────────────────

-- ⚠️⚠️ CADA VALOR ESPERADO SE ESCRIBE UNA SOLA VEZ, y no es estilo: la primera
-- versión de este bloque los tenía dos veces —en el `if` y en el texto del error—
-- y al probar que sabía salir rojo el mensaje dijo «envio=2,27 (esperado 2,27)»,
-- que es imposible y manda a buscar un fallo de redondeo que no existe. El valor
-- vive en la tabla `esperado` y el mensaje se DERIVA de ella.
--
-- ⚠️ Y el `full outer join` no es adorno: caza también el tipo que FALTA y el tipo
-- de más. Un `for` sobre lo que devuelve la función no puede detectar que la
-- función se haya dejado un tipo fuera, porque solo mira lo que sí devolvió.

do $bloque_a$
declare
  v_pedido uuid;
  v_fallos text;
begin
  select id into v_pedido from pedidos where numero_pedido = 'ENSAYO083';

  with esperado(iva_pct, campo, valor) as (
    values
      -- articulos: lo que aporta cada tipo, tal cual
      (10::numeric, 'articulos', 10.00::numeric),
      (21::numeric, 'articulos',  5.00::numeric),
      -- envio:  round(3,40 × 10,00/15,00, 2) = round(2,2667) = 2,27
      --         y el 21 % es la DIFERENCIA del acumulado: 3,40 − 2,27 = 1,13
      (10::numeric, 'envio',      2.27::numeric),
      (21::numeric, 'envio',      1.13::numeric),
      -- descuento: round(3,00 × 10,00/15,00, 2) = 2,00 · y 3,00 − 2,00 = 1,00
      (10::numeric, 'descuento',  2.00::numeric),
      (21::numeric, 'descuento',  1.00::numeric)
  ),
  obtenido as (
    select rc.iva_pct, 'articulos' as campo, rc.articulos as valor from reparto_conceptos_pedido(v_pedido) rc
    union all
    select rc.iva_pct, 'envio',              rc.envio              from reparto_conceptos_pedido(v_pedido) rc
    union all
    select rc.iva_pct, 'descuento',          rc.descuento          from reparto_conceptos_pedido(v_pedido) rc
  )
  select string_agg(
           format('%s%% %s = %s (esperado %s)',
                  coalesce(e.iva_pct, o.iva_pct),
                  coalesce(e.campo,   o.campo),
                  coalesce(o.valor::text, '<no lo devolvió>'),
                  coalesce(e.valor::text, '<no se esperaba este tipo>')),
           '; ' order by coalesce(e.iva_pct, o.iva_pct), coalesce(e.campo, o.campo))
    into v_fallos
  from esperado e
  full outer join obtenido o on o.iva_pct = e.iva_pct and o.campo = e.campo
  where o.valor is distinct from e.valor;

  if v_fallos is not null then
    raise exception 'A · reparto: %', v_fallos;
  end if;
  raise notice 'A · reparto por tipo: OK';
end $bloque_a$;


-- ── B · Los dos conceptos suman EXACTO, que es la propiedad del acumulado ────

do $bloque_b$
declare
  v_pedido uuid;
  v_envio  numeric;
  v_desc   numeric;
begin
  select id into v_pedido from pedidos where numero_pedido = 'ENSAYO083';

  select sum(envio), sum(descuento) into v_envio, v_desc
  from reparto_conceptos_pedido(v_pedido);

  -- ⭐ Esto es lo que el redondeo acumulado garantiza POR CONSTRUCCIÓN. Redondear
  -- cada trozo por su cuenta falla en 24 de 64 combinaciones (medido en la 080):
  -- 2,27 + 1,13 = 3,40, pero round(3,40×10/15)+round(3,40×5/15) = 2,27+1,13 aquí
  -- coincide y en otros repartos no. El acumulado no depende de la suerte.
  if v_envio <> 3.40 then
    raise exception 'B · el envío repartido suma % y coste_envio es 3.40', v_envio;
  end if;
  if v_desc <> 3.00 then
    raise exception 'B · el descuento repartido suma % y pedidos.descuento es 3.00', v_desc;
  end if;
  raise notice 'B · suma exacta: envío 3,40 y descuento 3,00, sin céntimo perdido';
end $bloque_b$;


-- ── C · El desglose de IVA, y que cuadra con lo cobrado ──────────────────────

do $bloque_c$
declare
  v_pedido uuid;
  v_total  numeric;
  v_suma   numeric;
  v_fallos text;
begin
  select id, total into v_pedido, v_total from pedidos where numero_pedido = 'ENSAYO083';

  with esperado(iva_pct, campo, valor) as (
    values
      -- 10 %: con_iva = 10,00 + 2,27 − 2,00 = 10,27
      --       base    = round(10,27 / 1,10, 2) = round(9,33636) = 9,34
      --       cuota   = 10,27 − 9,34 = 0,93   ← RESTANDO, nunca multiplicando
      (10::numeric, 'base',  9.34::numeric),
      (10::numeric, 'cuota', 0.93::numeric),
      -- 21 %: con_iva = 5,00 + 1,13 − 1,00 = 5,13
      --       base    = round(5,13 / 1,21, 2) = round(4,23967) = 4,24
      --       cuota   = 5,13 − 4,24 = 0,89
      (21::numeric, 'base',  4.24::numeric),
      (21::numeric, 'cuota', 0.89::numeric)
  ),
  obtenido as (
    select pi.iva_pct, 'base' as campo, pi.base as valor from pedido_iva pi where pi.pedido_id = v_pedido
    union all
    select pi.iva_pct, 'cuota',         pi.cuota         from pedido_iva pi where pi.pedido_id = v_pedido
  )
  select string_agg(
           format('%s%% %s = %s (esperado %s)',
                  coalesce(e.iva_pct, o.iva_pct),
                  coalesce(e.campo,   o.campo),
                  coalesce(o.valor::text, '<no hay fila de ese tipo>'),
                  coalesce(e.valor::text, '<tipo inesperado en el desglose>')),
           '; ' order by coalesce(e.iva_pct, o.iva_pct), coalesce(e.campo, o.campo))
    into v_fallos
  from esperado e
  full outer join obtenido o on o.iva_pct = e.iva_pct and o.campo = e.campo
  where o.valor is distinct from e.valor;

  if v_fallos is not null then raise exception 'C · desglose: %', v_fallos; end if;

  -- Y que cuadra con lo cobrado. `v_total` se lee del pedido, NO se escribe 15,40
  -- otra vez: el número ya está en la cabecera del ensayo y en el insert.
  select sum(base + cuota) into v_suma from pedido_iva where pedido_id = v_pedido;
  if v_suma <> v_total then
    raise exception 'C · el desglose suma % y el pedido cobró %', v_suma, v_total;
  end if;
  raise notice 'C · desglose OK y cuadra con lo cobrado (%)', v_total;
end $bloque_c$;


-- ── D · ⭐ EL ENSAYO NEGATIVO: el guardia TIENE que abortar ──────────────────
--
-- ⚠️⚠️ SIN ESTE BLOQUE EL ENSAYO NO VALE. Todo lo de arriba sale en verde también
-- si el guardia estuviera desactivado, porque solo comprueba que los números que
-- salen son los esperados. Lo que hay que demostrar es que un desglose que NO
-- cuadra no puede existir — o sea que el guardia sigue vivo después de haberle
-- añadido un término.

do $bloque_d$
declare
  v_p10    uuid;
  v_p21    uuid;
  v_pedido uuid;
  v_salto  boolean := false;
begin
  select id into v_p10 from productos where activo and iva_pct = 10 order by id limit 1;
  select id into v_p21 from productos where activo and iva_pct = 21 order by id limit 1;

  -- Mismo carrito, mismo envío, mismo descuento… y un total que NO es el que sale
  -- de esos números (15,40). Debe abortar el insert de las líneas.
  insert into pedidos (
    numero_pedido, estado, total, coste_envio, descuento, descuento_codigo,
    metodo_pago, email_cliente
  ) values (
    'ENSAYO083NEG', 'PENDIENTE_PAGO', 18.40, 3.40, 3.00, 'ENSAYO20',
    'stripe', 'ensayo-083-neg@valatino.es'
  )
  returning id into v_pedido;

  begin
    insert into pedido_items (pedido_id, producto_id, nombre_producto, cantidad, precio_unitario)
    select v_pedido, p.id, p.nombre, 1, 10.00 from productos p where p.id = v_p10
    union all
    select v_pedido, p.id, p.nombre, 1,  5.00 from productos p where p.id = v_p21;
  exception when others then
    v_salto := true;
    raise notice 'D · el guardia abortó, como debía: %', sqlerrm;
  end;

  if not v_salto then
    raise exception
      'D · ⚠️⚠️ EL GUARDIA NO SALTÓ con un total de 18,40 que no cuadra con 15,40. '
      'El invariante «el desglose suma exactamente lo cobrado» está ROTO, y con él '
      'la única defensa que caza un descuento mal repartido en el momento de la venta.';
  end if;
end $bloque_d$;


-- ── E · Lo que TODAVÍA está mal, demostrado en vez de escondido ──────────────
--
-- ⚠️⚠️ El §2 y el §3 arreglan el DESGLOSE. La FACTURA sigue sin saber del
-- descuento: sus líneas suman los artículos más el porte, sin restarlo. Este
-- bloque lo mide y lo deja escrito, para que nadie aplique el §2/§3 creyendo que
-- los descuentos ya funcionan de punta a punta.
--
-- ⭐ Y es la justificación del guardia nuevo del §8: el guardia de cuadre de
-- `emitir_factura` compara el DESGLOSE contra `pedidos.total`, y los dos valen
-- 15,40, así que PASARÍA. Lo que no cuadra es la suma de las líneas, y hoy nadie
-- la mira.

do $bloque_e$
declare
  v_pedido    uuid;
  v_lineas    numeric;
  v_total     numeric;
begin
  select id, total into v_pedido, v_total from pedidos where numero_pedido = 'ENSAYO083';

  -- Lo que sumarían las líneas de la factura si se emitiera ahora: los artículos
  -- (a PVP, sin descuento) más la línea de envío de la 082.
  select coalesce(sum(pi.cantidad * pi.precio_unitario), 0)
         + coalesce((linea_envio_factura(v_pedido, 1) ->> 'importe')::numeric, 0)
    into v_lineas
  from pedido_items pi where pi.pedido_id = v_pedido;

  if v_lineas = v_total then
    raise exception
      'E · las líneas ya suman el total (%). Si esto pasa, alguien escribió el §7 '
      'y este bloque hay que convertirlo en una comprobación positiva.', v_lineas;
  end if;

  raise notice
    'E · CONFIRMADO que el §7 sigue haciendo falta: las líneas de la factura sumarían %, el pedido cobró %, faltan % de descuento. El guardia de emitir_factura NO lo caza porque compara el desglose, no las líneas.',
    v_lineas, v_total, v_lineas - v_total;
end $bloque_e$;


-- ── F · ⭐⭐ EL ORDEN DEL ACUMULADO DEL §4, CON UN CASO QUE SÍ LO DETECTA ─────
--
-- ⚠️⚠️ LA PRIMERA VERSIÓN DE ESTE BLOQUE ERA UNA TAUTOLOGÍA, y merece quedar
-- escrito. Comparaba `Σ descuento_imputado` por tipo contra
-- `reparto_conceptos_pedido.descuento`… que ES esa suma desde que el §2 dejó de
-- repartir el descuento por su cuenta. Comparaba un número consigo mismo y salía en
-- verde siempre. Se cazó al preguntarse «¿y esto sabe salir rojo?».
--
-- ⚠️⚠️ Y EL CASO DE LOS BLOQUES A–E TAMPOCO DETECTA UN ERROR DE ORDEN: con UNA
-- línea por tipo, el reparto acumulado da lo mismo se ordene como se ordene, porque
-- cada tipo se lleva su propio trozo en cualquier secuencia. Hacen falta DOS líneas
-- del mismo tipo y unos importes que hagan que el acumulado cruce el medio céntimo
-- en distinto sitio.
--
-- EL CASO SENSIBLE:  1,11 + 1,11 al 10 %   ·   1,11 al 21 %   =  3,33
--                    descuento 20 % = round(0,666, 2) = 0,67 · envío 3,40
--                    total = 3,33 + 3,40 − 0,67 = 6,06
--
--   Ordenando por (iva_pct, id) — los dos del 10 % juntos:
--     acum: round(0,67×1,11/3,33)=0,22 · round(0,67×2,22/3,33)=0,45 · 0,67
--     líneas: 0,22 · 0,23 · 0,22        →  10 % = 0,45   21 % = 0,22
--
--   Ordenando por (id, …) con las líneas intercaladas 10-21-10:
--     acum: 0,22 · 0,45 · 0,67
--     líneas: 0,22 · 0,23(al 21 %) · 0,22  →  10 % = 0,44   21 % = 0,23
--
-- ⭐ Un céntimo de diferencia EN LA BASE DECLARADA de cada tipo, con el mismo total.
-- Eso es lo que el orden compra, y es lo que este bloque comprueba: que el reparto
-- por tipo NO depende de en qué orden se insertaron las líneas ni de qué uuid les
-- tocó.

do $bloque_f$
declare
  v_p10    uuid;
  v_p21    uuid;
  v_pedido uuid;
  v_fallos text;
  v_lineas numeric;
begin
  select id into v_p10 from productos where activo and iva_pct = 10 order by id limit 1;
  select id into v_p21 from productos where activo and iva_pct = 21 order by id limit 1;

  insert into pedidos (numero_pedido, estado, total, coste_envio, descuento, descuento_codigo,
                       metodo_pago, email_cliente)
  values ('ENSAYO083ORD', 'PENDIENTE_PAGO', 6.06, 3.40, 0.67, 'ENSAYO20',
          'stripe', 'ensayo-083-ord@valatino.es')
  returning id into v_pedido;

  -- ⚠️ Las tres líneas INTERCALADAS a propósito (10 %, 21 %, 10 %). Si el acumulado
  -- se ordenara por inserción o por uuid, el reparto por tipo saldría 0,44/0,23 en
  -- vez de 0,45/0,22. Insertarlas agrupadas no probaría nada.
  insert into pedido_items (pedido_id, producto_id, nombre_producto, cantidad, precio_unitario)
  select v_pedido, p.id, p.nombre, 1, 1.11 from productos p where p.id = v_p10
  union all
  select v_pedido, p.id, p.nombre, 1, 1.11 from productos p where p.id = v_p21
  union all
  select v_pedido, p.id, p.nombre, 1, 1.11 from productos p where p.id = v_p10;

  -- El reparto por tipo, contra el valor calculado a mano arriba. Escrito UNA vez.
  with esperado(iva_pct, valor) as (
    values (10::numeric, 0.45::numeric),
           (21::numeric, 0.22::numeric)
  ),
  obtenido as (
    select pi.iva_pct, sum(pi.descuento_imputado) as valor
    from pedido_items pi where pi.pedido_id = v_pedido group by pi.iva_pct
  )
  select string_agg(
           format('%s%% imputado = %s (esperado %s)',
                  coalesce(e.iva_pct, o.iva_pct),
                  coalesce(o.valor::text, '<sin líneas de ese tipo>'),
                  coalesce(e.valor::text, '<tipo inesperado>')), '; ')
    into v_fallos
  from esperado e
  full outer join obtenido o on o.iva_pct = e.iva_pct
  where o.valor is distinct from e.valor;

  if v_fallos is not null then
    raise exception
      'F · el reparto por tipo DEPENDE del orden de inserción: %. El acumulado del §4 '
      'tiene que ordenar por (iva_pct, id) con el TIPO PRIMERO.', v_fallos;
  end if;

  -- Y el total sigue exacto: ni un céntimo perdido ni sobrante.
  select coalesce(sum(descuento_imputado), 0) into v_lineas
  from pedido_items where pedido_id = v_pedido;
  if v_lineas <> 0.67 then
    raise exception 'F · las líneas llevan imputados % y el descuento del pedido es 0,67', v_lineas;
  end if;

  raise notice 'F · orden OK: 10%% 0,45 · 21%% 0,22 con las líneas intercaladas, y suman 0,67';
end $bloque_f$;


-- ── G · §5 · Qué hace cada código, y cada motivo de rechazo ─────────────────
--
-- ⚠️ Se prueban los RECHAZOS uno a uno, no solo el camino bueno. Un validador que
-- solo se ha visto aceptar no se ha visto validar.

do $bloque_g$
declare
  v_fallos text := '';
  r        record;

  -- (código, subtotal, ¿válido?, ¿envío gratis?, descuento esperado)
  casos text[][] := array[
    ['ENSAYO20',       '15.00', 't', 'f', '3.00'],   -- 20 % de 15,00
    ['ensayo20',       '15.00', 't', 'f', '3.00'],   -- minúsculas: mismo código
    ['  ENSAYO20  ',   '15.00', 't', 'f', '3.00'],   -- con espacios: mismo código
    ['ENSAYOPORTE',    '15.00', 't', 't', '0.00'],   -- envío gratis no descuenta base
    ['NOEXISTE',       '15.00', 'f', 'f', '0.00'],
    [null,             '15.00', 'f', 'f', '0.00'],
    ['ENSAYOAPAGADO',  '15.00', 'f', 'f', '0.00'],
    ['ENSAYOCADUCADO', '15.00', 'f', 'f', '0.00'],
    ['ENSAYOFUTURO',   '15.00', 'f', 'f', '0.00'],
    ['ENSAYOAGOTADO',  '15.00', 'f', 'f', '0.00'],
    ['ENSAYOMINIMO',   '15.00', 'f', 'f', '0.00'],   -- pide 100 € de mínimo
    ['ENSAYOMINIMO',  '150.00', 't', 'f', '30.00'],  -- el mismo código, ya cumplido
    -- ⚠️⚠️ EL SUELO DE STRIPE: el envío gratis lo hace alcanzable, y hay que verlo.
    ['ENSAYOPORTE',     '0.40', 'f', 'f', '0.00']
  ];
  i int;
begin
  insert into codigos_descuento (codigo, tipo, porcentaje, activo, valido_desde, valido_hasta, usos_maximos, usos, minimo_articulos)
  values
    ('ENSAYO20',       'porcentaje',   20, true,  null, null, null, 0, null),
    ('ENSAYOPORTE',    'envio_gratis', null, true, null, null, null, 0, null),
    ('ENSAYOAPAGADO',  'porcentaje',   20, false, null, null, null, 0, null),
    ('ENSAYOCADUCADO', 'porcentaje',   20, true,  null, now() - interval '1 day', null, 0, null),
    ('ENSAYOFUTURO',   'porcentaje',   20, true,  now() + interval '1 day', null, null, 0, null),
    ('ENSAYOAGOTADO',  'porcentaje',   20, true,  null, null, 1, 1, null),
    ('ENSAYOMINIMO',   'porcentaje',   20, true,  null, null, null, 0, 100.00);

  for i in 1 .. array_length(casos, 1) loop
    select * into r from codigo_descuento_aplicable(casos[i][1], casos[i][2]::numeric);

    if r.valido <> casos[i][3]::boolean then
      v_fallos := v_fallos || format(' [%s / %s] valido=%s (esperado %s, motivo «%s»);',
        coalesce(casos[i][1], 'NULL'), casos[i][2], r.valido, casos[i][3], coalesce(r.motivo, '—'));
    end if;
    if r.envio_gratis <> casos[i][4]::boolean then
      v_fallos := v_fallos || format(' [%s / %s] envio_gratis=%s (esperado %s);',
        coalesce(casos[i][1], 'NULL'), casos[i][2], r.envio_gratis, casos[i][4]);
    end if;
    if r.descuento <> casos[i][5]::numeric then
      v_fallos := v_fallos || format(' [%s / %s] descuento=%s (esperado %s);',
        coalesce(casos[i][1], 'NULL'), casos[i][2], r.descuento, casos[i][5]);
    end if;
    -- Un rechazo SIN motivo es un rechazo que la pantalla no puede explicar.
    if not r.valido and (r.motivo is null or btrim(r.motivo) = '') then
      v_fallos := v_fallos || format(' [%s] rechazado sin motivo;', coalesce(casos[i][1], 'NULL'));
    end if;
  end loop;

  if v_fallos <> '' then raise exception 'G · códigos:%', v_fallos; end if;
  raise notice 'G · los % casos de validación salen como deben, y cada rechazo trae motivo', array_length(casos, 1);
end $bloque_g$;


-- ── H · §5.2 · coste_envio_de con y sin código ──────────────────────────────

do $bloque_h$
declare
  v_fallos text := '';
  -- (subtotal, código, porte esperado)
  casos text[][] := array[
    ['15.00', null,             '3.40'],  -- tarifa plana
    ['15.00', 'ENSAYOPORTE',    '0.00'],  -- ⭐ el código pone el porte a 0
    ['15.00', 'ENSAYO20',       '3.40'],  -- ⚠️ un % NO toca el porte
    ['35.00', null,             '0.00'],  -- pasa del umbral de 30
    -- ⭐⭐ EL UMBRAL SE MIDE SOBRE EL BRUTO (§0.5): 35,00 con un −20 % sigue
    -- teniendo envío gratis, aunque el neto (28,00) no llegue a 30. Si esto
    -- devolviera 3,40 el cliente vería SUBIR el total al aplicar un código.
    ['35.00', 'ENSAYO20',       '0.00'],
    ['15.00', 'ENSAYOCADUCADO', '3.40'],  -- código inválido: se ignora
    ['0',     'ENSAYOPORTE',    '0.00'],  -- carrito vacío
    ['0.40',  'ENSAYOPORTE',    '3.40']   -- rechazado por el suelo de Stripe → tarifa
  ];
  i int;
  v_real numeric;
begin
  update ajustes_tienda set envio_coste = 3.40, envio_gratis_desde = 30.00 where id;

  for i in 1 .. array_length(casos, 1) loop
    v_real := coste_envio_de(casos[i][1]::numeric, casos[i][2]);
    if v_real <> casos[i][3]::numeric then
      v_fallos := v_fallos || format(' [subtotal %s / %s] porte=%s (esperado %s);',
        casos[i][1], coalesce(casos[i][2], 'sin código'), v_real, casos[i][3]);
    end if;
  end loop;

  if v_fallos <> '' then raise exception 'H · coste_envio_de:%', v_fallos; end if;
  raise notice 'H · coste_envio_de: los % casos correctos, umbral medido sobre el bruto', array_length(casos, 1);
end $bloque_h$;


-- ── I · Que la firma vieja de coste_envio_de NO quedó colgando ──────────────

do $bloque_i$
declare v_n int;
begin
  select count(*) into v_n from pg_proc
  where pronamespace = 'public'::regnamespace and proname = 'coste_envio_de';
  if v_n <> 1 then
    raise exception
      'I · coste_envio_de tiene % firmas y debe tener 1. Con dos, coste_envio_de(numeric) '
      'queda ambigua y la llamada de confirmar_venta falla DENTRO del webhook de un pago '
      'ya cobrado. Es el fallo clásico de ampliar una firma con create or replace.', v_n;
  end if;
  raise notice 'I · coste_envio_de: una sola firma';
end $bloque_i$;


-- ── Resumen legible, para pegarlo en ESTADO.md ───────────────────────────────

select 'reparto'  as bloque, rc.iva_pct::text as tipo,
       rc.articulos::text as articulos, rc.envio::text as envio, rc.descuento::text as descuento
from pedidos p, reparto_conceptos_pedido(p.id) rc
where p.numero_pedido = 'ENSAYO083'
union all
select 'desglose', pi.iva_pct::text, pi.base::text, pi.cuota::text, (pi.base + pi.cuota)::text
from pedidos p join pedido_iva pi on pi.pedido_id = p.id
where p.numero_pedido = 'ENSAYO083'
order by 1, 2;
