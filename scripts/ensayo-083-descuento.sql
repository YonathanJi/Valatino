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
