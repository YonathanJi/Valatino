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
--   emitir_factura(uuid, factura_tipo, jsonb, jsonb, jsonb, uuid, uuid, uuid, d)
--     md5(prosrc) = cca415f373e2c67cf66cafe9e5874362  ·  7331 caracteres
--   registrar_reembolso_lineas(uuid, jsonb, boolean, text, boolean, uuid)
--     md5(prosrc) = c663df7162213f7184ab705c1eea28f2  ·  3150 caracteres
--   reembolsar_pedido_total(uuid, uuid, text)
--     md5(prosrc) = 3d807a6317fe82402716adbd74836165  ·  6485 caracteres
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


-- ── §4 · EL DESCUENTO BAJA HASTA LA LÍNEA, Y SE CONGELA ─────────────────────
--
-- ⚠️⚠️ POR QUÉ HASTA LA LÍNEA, que es la pregunta que decide el diseño entero.
-- `reembolso_lineas.pedido_item_id` es NOT NULL y todos sus consumidores hacen
-- `join pedido_items`: la devolución SOLO sabe hablar de líneas. Y un descuento
-- baja el valor de cada línea, así que si el descuento no llega hasta aquí,
-- devolver un artículo devuelve su PVP de catálogo — más dinero del que el cliente
-- pagó. La 078 avisó de esto para el porte («dinero declarado que no se puede
-- devolver») y tardó meses en morder; aquí es peor, porque la devolución parcial de
-- un pedido con cupón es el camino PRINCIPAL, no un borde.
--
-- ⭐⭐ Y POR QUÉ SE CONGELA en vez de derivarse al leer. Se consideró dejar
-- `reembolso_lineas.importe` como un PESO y convertirlo a dinero en tiempo de
-- lectura. Se descarta: esa conversión leería `pedidos.descuento` EN VIVO, y toda
-- esta casa está construida sobre lo contrario —`carrito_items.precio_unitario` es
-- una copia, `checkout_datos.coste_envio` un snapshot, `pedido_items.iva_pct` se
-- congela al vender, `facturas_emitidas` es inmutable—. Derivar al leer significa
-- que el día que alguien toque `pedidos.descuento` de un pedido con rectificativa
-- emitida, la función diría un número y el papel otro, y `trg_factura_inmutable`
-- impide corregir el papel. Es la avería de la 074 donde no hay vuelta atrás.
--
-- ⚠️⚠️ EL ORDEN DEL ACUMULADO ES `(iva_pct, id)`, CON EL TIPO PRIMERO, Y ES LO QUE
-- HACE QUE TODO CUADRE. Con ese orden, el acumulado de la ÚLTIMA línea de un tipo
-- es idéntico al acumulado de ese tipo, así que las diferencias telescopan igual y
--
--     Σ_{líneas de t} descuento_imputado  =  descuento(t)      al céntimo
--
-- Por eso `reparto_conceptos_pedido` puede limitarse a SUMAR esta columna en vez de
-- repartir por su cuenta: no son dos aritméticas que deban coincidir, es una. Con
-- el orden `(id, iva_pct)` la identidad se rompe y el descuadre sale en el 303.
--
-- ⚠️ El `id` no es un criterio de negocio, es solo el desempate que hace el orden
-- TOTAL y por tanto determinista. Sin él, dos líneas del mismo tipo podrían
-- ordenarse distinto entre dos ejecuciones y el reparto por línea cambiaría.

create or replace function public.reparto_descuento_lineas(p_pedido_id uuid)
returns table (pedido_item_id uuid, iva_pct numeric, descuento numeric)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  with l as (
    select pi.id, pi.iva_pct, pi.cantidad * pi.precio_unitario as importe
    from public.pedido_items pi
    where pi.pedido_id = p_pedido_id
  ),
  t as (
    select coalesce(sum(l.importe), 0) as articulos_total,
           (select coalesce(p.descuento, 0)
            from public.pedidos p where p.id = p_pedido_id) as descuento
    from l
  ),
  acum as (
    select l.id, l.iva_pct, l.importe, t.articulos_total, t.descuento,
           -- ⚠️ EL TIPO PRIMERO. Ver el aviso de arriba: es lo que hace que la suma
           -- por tipo salga exacta sin una segunda aritmética.
           sum(l.importe) over (
             order by l.iva_pct, l.id
             rows between unbounded preceding and current row
           ) as imp_acum
    from l cross join t
  ),
  rep as (
    select a.id, a.iva_pct,
           case when a.articulos_total > 0
                then round(a.descuento * a.imp_acum / a.articulos_total, 2)
                else 0 end as desc_acum
    from acum a
  )
  select r.id,
         r.iva_pct,
         r.desc_acum - coalesce(lag(r.desc_acum) over (order by r.iva_pct, r.id), 0)
  from rep r;
$$;

comment on function public.reparto_descuento_lineas(uuid) is
  'El descuento del pedido repartido LÍNEA A LÍNEA, IVA incluido, con redondeo acumulado ordenado por (iva_pct, id) — el tipo primero, que es lo que hace que la suma por tipo de IVA salga exacta sin una segunda aritmética (083 §4). Es el ÚNICO sitio que reparte el descuento.';

revoke execute on function public.reparto_descuento_lineas(uuid) from public, anon, authenticated;


create or replace function public.congelar_descuento_lineas(p_pedido_id uuid)
returns void
language sql
security definer
set search_path to 'public', 'pg_temp'
as $$
  -- ⚠️ `is distinct from` para no escribir filas que no cambian: el trigger puede
  -- correr más de una vez y un UPDATE que no cambia nada sigue costando una versión
  -- de fila y una entrada de WAL.
  --
  -- ⚠️ Escribir en `pedido_items` desde el trigger del propio `pedido_items` NO
  -- recursa: el trigger es `after insert`, y esto es un UPDATE. Comprobado en la
  -- base el 2026-08-23: los dos únicos triggers de la tabla son
  -- `trg_pedido_item_hereda_iva` (before insert, por fila) y
  -- `trg_pedido_items_desglosa_iva` (after insert, por sentencia).
  update public.pedido_items pi
  set descuento_imputado = r.descuento
  from public.reparto_descuento_lineas(p_pedido_id) r
  where pi.id = r.pedido_item_id
    and pi.descuento_imputado is distinct from r.descuento;
$$;

comment on function public.congelar_descuento_lineas(uuid) is
  'Escribe pedido_items.descuento_imputado desde reparto_descuento_lineas (083 §4). La llama el trigger del desglose ANTES de recalcular_iva_pedido, porque reparto_conceptos_pedido suma esta columna.';

revoke execute on function public.congelar_descuento_lineas(uuid) from public, anon, authenticated;


-- ── §4.2 · EL TRIGGER ORQUESTA EL ORDEN, EXPLÍCITAMENTE ─────────────────────
--
-- ⚠️⚠️ EL ORDEN IMPORTA Y NO SE DEJA AL AZAR. `reparto_conceptos_pedido` SUMA
-- `descuento_imputado`, así que la imputación tiene que estar escrita antes de que
-- se calcule el desglose. La alternativa era un segundo trigger de sentencia, y
-- Postgres los dispara por ORDEN ALFABÉTICO del nombre: haría falta bautizarlo
-- `trg_a_...` para que fuera primero, y una garantía que depende de cómo se llame
-- una cosa es una garantía que alguien rompe al renombrarla. Aquí el orden está
-- escrito en dos líneas seguidas y se lee.

create or replace function public.trg_pedido_items_desglosa_iva()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare r record;
begin
  for r in select distinct pedido_id from nuevas loop
    -- 1. Primero el descuento baja a las líneas y se congela…
    perform congelar_descuento_lineas(r.pedido_id);
    -- 2. …y solo entonces se calcula el desglose, que lo SUMA de ahí.
    perform recalcular_iva_pedido(r.pedido_id);
  end loop;
  return null;
end; $$;


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
-- ⚠️⚠️ EL DESCUENTO NO SE REPARTE AQUÍ. Se LEE de `pedido_items.descuento_imputado`,
-- que lo congeló `congelar_descuento_lineas` (§4) antes de que esto corra. Y es la
-- decisión de diseño más importante del §4:
--
--   El porte se reparte por TIPO y ya está: no hay nada que devolver por línea,
--   porque el porte es todo-o-nada (080 §6.1). El descuento sí: cada unidad
--   devuelta arrastra su parte, y `reembolso_lineas.pedido_item_id` es NOT NULL, o
--   sea que la devolución solo sabe hablar de LÍNEAS. Así que el descuento tiene
--   que existir a nivel de línea de todas formas.
--
--   Y si existe a nivel de línea, calcularlo TAMBIÉN a nivel de tipo serían DOS
--   aritméticas que tienen que dar el mismo número. Es exactamente el patrón que
--   costó la 074. Así que hay una sola: la de línea, y esto la suma.
--
-- ⭐⭐ LA SUMA POR TIPO SALE EXACTA POR CONSTRUCCIÓN, no por suerte, y la razón está
-- en el ORDEN del acumulado del §4: se ordena por `(iva_pct, id)`, con el tipo
-- PRIMERO. Eso hace que el acumulado de la última línea de un tipo sea idéntico al
-- acumulado de ese tipo, así que las diferencias telescopan igual y
-- `Σ_lineas_de_t descuento_imputado = descuento(t)` al céntimo. Si el orden fuera
-- `(id, iva_pct)` la identidad se rompería y el descuadre saldría en el 303.
--
-- ⚠️ Y SI LA IMPUTACIÓN ESTUVIERA SIN HACER, esto devuelve descuento = 0 mientras
-- `pedidos.total` sí lo lleva restado → el guardia del desglose ABORTA. Es el fallo
-- ruidoso, que es el que se quiere: la misma protección que tiene `coste_envio`
-- porque el trigger escucha a `pedido_items` y no a `pedidos`.
--
-- ⭐ EL ACUMULADO DEL PORTE SE ESCRIBE UNA SOLA VEZ, a diferencia de la 080, que
-- repetía la ventana. Se saca a su propio CTE (`acum.art_acum`).
--
-- ⚠️ EL REDONDEO ACUMULADO ES LO QUE HACE QUE LA SUMA SEA EXACTA POR CONSTRUCCIÓN:
--
--     envio_acum(i) = round(envio × Σ_{j≤i} articulos(j) / articulos_total, 2)
--     envio(i)      = envio_acum(i) − envio_acum(i−1)
--
-- El último acumulado es `round(envio × 1, 2)` = el porte entero, y los trozos son
-- sus diferencias: telescopan. Redondear cada trozo por su cuenta NO suma (falla en
-- 24 de 64 combinaciones, medido en la 080).

create or replace function public.reparto_conceptos_pedido(p_pedido_id uuid)
returns table (iva_pct numeric, articulos numeric, envio numeric, descuento numeric)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  with g as (
    select pi.iva_pct,
           sum(pi.precio_unitario * pi.cantidad) as articulos,
           -- ⭐ El descuento del tipo NO se calcula: se suma lo ya imputado por
           -- línea. Una sola aritmética, la del §4. Ver el aviso de arriba.
           sum(pi.descuento_imputado)            as descuento
    from public.pedido_items pi
    where pi.pedido_id = p_pedido_id
    group by pi.iva_pct
  ),
  t as (
    -- ⚠️ El porte va como SUBCONSULTA ESCALAR, igual que en la 080, y no como un
    -- `cross join` a la fila del pedido. Se intentó lo segundo el 2026-08-23 «para
    -- leerlo en una pasada» y el ensayo revertido lo tumbó: con
    -- `sum(g.articulos)` en el mismo SELECT, las columnas del join tendrían que
    -- estar en el GROUP BY. Un escaneo de una fila por clave primaria no es un
    -- problema; una agregación torcida sí.
    select coalesce(sum(g.articulos), 0) as articulos_total,
           (select coalesce(p.coste_envio, 0)
            from public.pedidos p where p.id = p_pedido_id) as envio
    from g
  ),
  acum as (
    select g.iva_pct,
           g.articulos,
           g.descuento,
           t.articulos_total,
           t.envio,
           sum(g.articulos) over (
             order by g.iva_pct
             rows between unbounded preceding and current row
           ) as art_acum
    from g cross join t
  ),
  rep as (
    select a.iva_pct,
           a.articulos,
           a.descuento,
           -- El `case` no es defensivo por si acaso: un catálogo con precio 0 daría
           -- articulos_total = 0 y una división por cero. Sin artículos que
           -- ponderen, no hay reparto posible. Viene de la 080 y se conserva.
           case when a.articulos_total > 0
                then round(a.envio * a.art_acum / a.articulos_total, 2) else 0 end as envio_acum
    from acum a
  )
  select r.iva_pct,
         r.articulos,
         r.envio_acum - coalesce(lag(r.envio_acum) over (order by r.iva_pct), 0),
         r.descuento
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


-- ── §5 · QUÉ HACE UN CÓDIGO, DECIDIDO EN UN SOLO SITIO ──────────────────────
--
-- ⚠️⚠️ ESTA REGLA NO PUEDE VIVIR EN TYPESCRIPT, y ya está escrito en el propio
-- `carrito.service.ts` para el porte: «EL ENVÍO LO DECIDE LA BASE, NUNCA ESTE
-- FICHERO… Aplicar aquí la regla en TypeScript sería tenerla en dos sitios: el día
-- que difirieran, se cobraría un importe y se facturaría otro, y el guardia del
-- desglose abortaría DENTRO del webhook de un pago ya cobrado. Es la lección de la
-- 074». Con el descuento vale igual. La pantalla solo FORMATEA lo que devuelve
-- esto.
--
-- ⭐ Devuelve `motivo` en texto para el cliente. Que el rechazo lo redacte la base
-- evita el otro sitio donde divergir: la pantalla diciendo «código caducado» cuando
-- lo que pasa es que no llega al mínimo.

create or replace function public.codigo_descuento_aplicable(
  p_codigo   text,
  p_subtotal numeric
)
returns table (valido boolean, motivo text, tipo text, descuento numeric, envio_gratis boolean)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_c    public.codigos_descuento;
  v_sub  numeric := coalesce(p_subtotal, 0);
  v_desc numeric;
begin
  if p_codigo is null or btrim(p_codigo) = '' then
    return query select false, 'Escribe un código'::text, null::text, 0::numeric, false; return;
  end if;

  -- Se compara en mayúsculas y sin espacios, igual que el índice único: el cartel
  -- dirá VERANO20 y el cliente escribirá « verano20 ».
  select * into v_c
  from public.codigos_descuento c
  where upper(btrim(c.codigo)) = upper(btrim(p_codigo));

  if not found then
    return query select false, 'Ese código no existe'::text, null::text, 0::numeric, false; return;
  end if;

  if not v_c.activo then
    return query select false, 'Ese código ya no está disponible'::text, v_c.tipo, 0::numeric, false; return;
  end if;

  -- `now()` es estable dentro de la transacción, así que la función puede ser
  -- STABLE: dos llamadas en el mismo checkout no pueden discrepar sobre la vigencia.
  if v_c.valido_desde is not null and now() < v_c.valido_desde then
    return query select false, 'Ese código todavía no está vigente'::text, v_c.tipo, 0::numeric, false; return;
  end if;

  if v_c.valido_hasta is not null and now() > v_c.valido_hasta then
    return query select false, 'Ese código ha caducado'::text, v_c.tipo, 0::numeric, false; return;
  end if;

  -- ⚠️ El tope de usos es BLANDO por diseño: se comprueba aquí (al aplicar) y se
  -- consume en el webhook, minutos después. Dos checkouts simultáneos con un código
  -- de un solo uso lo gastan los dos. Ver §0.6 de la migración: revalidar en el
  -- webhook facturaría un total distinto del cobrado, y abortar allí dejaría un pago
  -- cobrado sin pedido y a Stripe reintentando el mismo fallo para siempre.
  if v_c.usos_maximos is not null and v_c.usos >= v_c.usos_maximos then
    return query select false, 'Ese código ya se ha agotado'::text, v_c.tipo, 0::numeric, false; return;
  end if;

  if v_c.minimo_articulos is not null and v_sub < v_c.minimo_articulos then
    return query select false,
      format('Ese código pide una compra mínima de %s €', trim(to_char(v_c.minimo_articulos, '9999990D99')))::text,
      v_c.tipo, 0::numeric, false;
    return;
  end if;

  if v_c.tipo = 'porcentaje' then
    v_desc := round(v_sub * v_c.porcentaje / 100, 2);

    -- ⚠️ Los artículos tienen que quedar en ALGO. Con el porcentaje topado a 90 esto
    -- solo puede morder en carritos de céntimos, pero se rechaza en vez de recortar
    -- el descuento: un «−20 %» que en realidad descuenta otra cosa es peor que un
    -- código que no se aplica y dice por qué.
    if v_sub - v_desc <= 0 then
      return query select false, 'Ese código no se puede aplicar a un carrito tan pequeño'::text,
        v_c.tipo, 0::numeric, false;
      return;
    end if;

    return query select true, null::text, v_c.tipo, v_desc, false; return;
  end if;

  if v_c.tipo = 'envio_gratis' then
    -- ⚠️⚠️ EL SUELO DE 0,50 € DE STRIPE, Y ESTE TIPO DE CÓDIGO ES EL QUE LO HACE
    -- ALCANZABLE. Hoy no lo es: el porte solo sale gratis pasando el umbral, que
    -- son 30 €. Con un código de envío gratis, un carrito de 0,40 € se queda con un
    -- total de 0,40 € y `createPaymentIntent` devuelve un 400 en la cara del
    -- cliente al pulsar «Continuar con el pago». Se rechaza aquí, que es donde se
    -- puede explicar.
    if v_sub < 0.50 then
      return query select false, 'Ese código no se puede aplicar a un carrito tan pequeño'::text,
        v_c.tipo, 0::numeric, false;
      return;
    end if;

    return query select true, null::text, v_c.tipo, 0::numeric, true; return;
  end if;

  -- ⚠️ Un tipo nuevo añadido sin pasar por aquí NO se aplica en silencio: revienta.
  -- El CHECK de la tabla y este `if` son dos sitios que hablan de los mismos dos
  -- tipos, y esto es lo que garantiza que el segundo se entere cuando cambie el
  -- primero.
  raise exception 'Tipo de código de descuento no contemplado: %', v_c.tipo;
end;
$$;

comment on function public.codigo_descuento_aplicable(text, numeric) is
  'El ÚNICO sitio que decide qué hace un código: si es válido, por qué no lo es (texto para el cliente), y qué aplica — un importe de descuento sobre los artículos, o el porte a 0. La llaman el carrito por RPC, coste_envio_de y confirmar_venta (083 §5).';

revoke execute on function public.codigo_descuento_aplicable(text, numeric) from public, anon, authenticated;


-- ── §5.2 · coste_envio_de aprende el código ─────────────────────────────────
--
-- ⚠️⚠️ AMPLIAR LA FIRMA OBLIGA A `drop function`. Con `create or replace` y un
-- parámetro nuevo Postgres crea una SOBRECARGA, no reemplaza nada, y entonces
-- `coste_envio_de(numeric)` queda AMBIGUA entre la vieja de un argumento y la nueva
-- con default. Es la lección de la 068, repetida en la 077 §1.
--
-- ⭐ Y por eso el parámetro lleva default: `confirmar_venta` y
-- `crear_pedido_transferencia` la llaman con un solo argumento y NO hay que
-- recrearlas (son plpgsql, resuelven en ejecución). El carrito la llama por RPC con
-- `{ p_subtotal }` y sigue funcionando igual.
--
-- ⚠️ EL UMBRAL SE MIDE SOBRE EL SUBTOTAL BRUTO, sin descontar. Decisión del §0.5:
-- sobre el neto, un carrito de 30 € con un código del −20 % pasaría de «envío
-- gratis» a pagar 3,40 € por haber usado el código, y el cliente lo lee como un
-- castigo. Los llamadores pasan el bruto.

drop function if exists public.coste_envio_de(numeric);

create or replace function public.coste_envio_de(
  p_subtotal numeric,
  p_codigo   text default null
)
returns numeric
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select case
    -- Un código de envío gratis pone el porte a 0 y punto. NO es un descuento sobre
    -- la base imponible: es porte que no se cobra, y por eso no toca nada de la
    -- cadena fiscal — `linea_envio_factura` filtra por `envio > 0` y la factura
    -- omite la línea, igual que en cualquier pedido que pasa del umbral. Ver §0.3.
    when coalesce((
      select ca.envio_gratis
      from public.codigo_descuento_aplicable(p_codigo, p_subtotal) ca
      where ca.valido
    ), false) then 0::numeric

    else round(coalesce(
      case
        -- Un carrito vacío no paga porte. No debería llegar aquí (las dos
        -- funciones que crean pedidos abortan antes con «carrito vacío»), pero
        -- cobrar el porte de nada sería el peor fallo posible de esta función y no
        -- cuesta nada cerrarlo.
        when p_subtotal is null or p_subtotal <= 0 then 0
        else (
          select case
                   when a.envio_gratis_desde is not null and p_subtotal >= a.envio_gratis_desde then 0
                   else a.envio_coste
                 end
          from public.ajustes_tienda a
          where a.id
        )
      end, 0), 2)
  end;
$$;

comment on function public.coste_envio_de(numeric, text) is
  'El porte que paga un carrito: 0 si lleva un código de envío gratis válido, 0 si el subtotal BRUTO pasa de ajustes_tienda.envio_gratis_desde, y la tarifa plana en otro caso (080, ampliada en 083 §5). El umbral se mide sobre el bruto a propósito: ver §0.5.';

revoke execute on function public.coste_envio_de(numeric, text) from public, anon, authenticated;


-- ── §6 · LO QUE SE LE DEVUELVE AL CLIENTE, EN UN SOLO SITIO ─────────────────
--
-- ⚠️⚠️ EL PROBLEMA, EN UNA FRASE: hoy los TRES escritores de
-- `reembolso_lineas.importe` calculan `round(cantidad × precio_unitario, 2)` cada
-- uno por su cuenta —044:146, 068:600 y 080:1021, la misma fórmula copiada tres
-- veces— y eso es PVP DE CATÁLOGO. Con un cupón se devolvería más dinero del que el
-- cliente pagó, la rectificativa rectificaría más base de la declarada, y el 303 se
-- quedaría con IVA repercutido negativo. Ningún CHECK lo caza.
--
-- ⭐⭐ Y LA CURA NO ES ARREGLAR LOS TRES: es que dejen de calcular. Esta función es
-- el único sitio, y los tres pasan a insertar lo que devuelve. Art. 107 RDL 1/2007
-- obliga a devolver «todos los pagos recibidos», que con cupón es lo efectivamente
-- cobrado y nunca el PVP.
--
-- ⚠️ EL ACUMULADO, OTRA VEZ, AHORA SOBRE UNIDADES DE UNA LÍNEA. Es la lección de la
-- 078 con otro eje: derivar cada devolución por su cuenta
-- (`round(k × neto / n, 2)`) hace que dos devoluciones parciales de la misma línea
-- NO sumen el neto. Con el acumulado sí, por construcción:
--
--     importe(k) = round(neto × (ya+k)/n, 2) − round(neto × ya/n, 2)
--
-- Devolver 1 de 3 unidades de una línea con neto 19,00 da
-- `round(19,00×1/3, 2)` = 6,33; las 2 restantes dan `19,00 − 6,33` = 12,67, no
-- 2×6,33 = 12,66. Y al revés: 12,67 y luego 6,33. El céntimo no se pierde en ningún
-- orden, que es justo lo que la 078 tuvo que arreglar a mano.
--
-- ⚠️ NINGÚN TROZO SALE NEGATIVO: el acumulado no decrece en `ya`, porque
-- `neto >= 0` lo garantiza el CHECK `descuento_imputado <= cantidad *
-- precio_unitario` del §1.3. Pero SÍ puede salir 0,00 legítimamente, y por eso el
-- §1.4 relaja `importe > 0` a `>= 0`: filtrar esa fila dejaría la unidad sin
-- apuntar y —si es la última pendiente— sin disparar el trigger de la rectificativa.
--
-- ⭐ ABSORBE EL TOPE, no lo duplica. Los dos escritores tenían cada uno su
-- `least(pedido, cantidad − ya_devuelto)`; ahora está aquí y solo aquí, así que la
-- función devuelve directamente lo que se puede devolver y cuánto vale.
--
-- ⚠️ `p_lineas = null` significa TODO LO PENDIENTE, y es el modo que usa
-- `reembolsar_pedido_total`. Explícito a propósito: con `'[]'` habría que
-- distinguir «nada» de «todo» mirando el JSON.

create or replace function public.importe_a_devolver(
  p_pedido_id uuid,
  p_lineas    jsonb
)
returns table (pedido_item_id uuid, cantidad integer, importe numeric)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  with entrada as (
    select (l->>'pedido_item_id')::uuid as pedido_item_id,
           (l->>'cantidad')::integer    as cantidad
    from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) l
    where p_lineas is not null
    union all
    -- El modo «todo lo pendiente»: se piden todas las unidades de cada línea y el
    -- `least` de abajo las acota a las que quedan.
    select i.id, i.cantidad
    from public.pedido_items i
    where p_lineas is null and i.pedido_id = p_pedido_id
  ),
  linea as (
    select
      i.id,
      i.cantidad                                             as unidades,
      -- ⭐ EL NETO DE LA LÍNEA: lo que el cliente pagó de verdad por ella.
      i.cantidad * i.precio_unitario - i.descuento_imputado   as neto,
      coalesce(y.devuelto, 0)                                 as ya,
      least(e.cantidad, i.cantidad - coalesce(y.devuelto, 0)) as pide
    from entrada e
    join public.pedido_items i
      on i.id = e.pedido_item_id
     and i.pedido_id = p_pedido_id
    left join (
      select rl.pedido_item_id, sum(rl.cantidad) as devuelto
      from public.reembolso_lineas rl
      group by rl.pedido_item_id
    ) y on y.pedido_item_id = i.id
  )
  select l.id,
         l.pide,
         round(l.neto * (l.ya + l.pide) / l.unidades, 2)
           - round(l.neto * l.ya / l.unidades, 2)
  from linea l
  where l.pide > 0;
$$;

comment on function public.importe_a_devolver(uuid, jsonb) is
  'Qué unidades se pueden devolver de cada línea y CUÁNTO DINERO son: el neto que el cliente pagó, con el descuento del cupón ya restado (083 §6). p_lineas null = todo lo pendiente. Es el ÚNICO sitio que calcula reembolso_lineas.importe: antes la misma fórmula vivía copiada en registrar_reembolso_lineas, reembolsar_pedido_total y la API. Art. 107 RDL 1/2007.';

revoke execute on function public.importe_a_devolver(uuid, jsonb) from public, anon, authenticated;


-- ── §7 · EL DESCUENTO SALE EN LA FACTURA ────────────────────────────────────
--
-- ⚠️ ES OBLIGACIÓN LEGAL, no una cortesía. Art. 6.1.f RD 1619/2012: la factura debe
-- consignar «cualquier descuento o rebaja que no esté incluido en dicho precio
-- unitario». Y como aquí NO se baja el `precio_unitario` de las líneas —romper la
-- trazabilidad de la devolución sería peor—, el descuento tiene que salir como
-- concepto propio.
--
-- ⭐ UNA SOLA LÍNEA, con el mismo criterio que el porte desde la 082 y por la misma
-- razón, que la dijo el dueño mirando su primera factura real: «que salga el envío
-- total y ya, menos complicado para el cliente». Un descuento partido en dos líneas
-- por tipo de IVA tendría exactamente el problema que aquello vino a quitar.
--
-- ⚠️⚠️ EL SIGNO VA AL REVÉS QUE EL DEL PORTE, y es lo único delicado de esta
-- función. El porte SUMA y el descuento RESTA, así que con `p_signo = 1` (factura
-- de venta) el importe sale NEGATIVO, y con `p_signo = -1` (rectificativa) sale
-- POSITIVO — porque rectificar una venta es deshacer también su descuento. De ahí
-- el `-p_signo`.
--
-- ⚠️ `iva_pct` NULL cuando el descuento cae en varios tipos, igual que el porte, y
-- el reparto viaja DENTRO de la línea congelada en la clave `reparto`. Eso es lo que
-- hace que unificar la presentación no pierda información: el libro conserva de
-- dónde salió cada céntimo aunque el papel enseñe una sola cifra.
--
-- ⚠️⚠️ Y NULL SOLO VALE EN `lineas`, NUNCA EN `desglose`. El bloque `doc` de
-- `liquidacion_iva` agrupa por `(d->>'iva_pct')` del desglose: un grupo NULL no
-- casaría con `pedido_iva` y desaparecería de los totales del 303. El desglose se
-- COPIA de `pedido_iva`, que ya lleva el descuento neteado dentro, así que aquí no
-- hay nada que añadirle.

create or replace function public.linea_descuento_factura(
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
      -- El código en el nombre, que es el «medio de prueba» del art. 78.Tres.2 LIVA
      -- puesto donde el cliente lo ve.
      'nombre',          'Descuento' || coalesce(
                           ' (' || (select p.descuento_codigo
                                    from public.pedidos p where p.id = p_pedido_id) || ')', ''),
      'cantidad',        1,
      -- En positivo, como el porte: lo que lleva el signo es el importe.
      'precio_unitario', round(sum(r.descuento), 2),
      'iva_pct',         case when count(*) = 1 then min(r.iva_pct) end,
      'importe',         -p_signo * round(sum(r.descuento), 2),
      'concepto',        'descuento',
      'reparto',         jsonb_agg(jsonb_build_object(
                           'iva_pct', r.iva_pct,
                           'importe', -p_signo * r.descuento
                         ) order by r.iva_pct)
    )
  end
  from public.reparto_conceptos_pedido(p_pedido_id) r
  where r.descuento > 0;
$$;

comment on function public.linea_descuento_factura(uuid, int) is
  'La línea de factura del descuento, UNA sola con el total y en NEGATIVO (083 §7). Art. 6.1.f RD 1619/2012. Devuelve NULL si el pedido no llevó cupón. iva_pct es null cuando el descuento cae en varios tipos, y entonces el detalle va en la clave reparto. Mismo criterio que linea_envio_factura: es el único sitio que le da forma.';

revoke execute on function public.linea_descuento_factura(uuid, int) from public, anon, authenticated;


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


-- ── §6.1 · emitir_factura — la linea del descuento y el guardia del §8 
--
-- Extraída del `prosrc` vivo (md5 cca415f373e2c67cf66cafe9e5874362) y parcheada por script:
--     · la declaración de la variable del guardia nuevo (1 reemplazo)
--     · la rama del `union all` que añade la línea del descuento (1 reemplazo)
--     · el guardia del §8: Σ lineas = total del documento (1 reemplazo)
-- Ni una letra más. El resto de la función es literalmente la que está desplegada.

CREATE OR REPLACE FUNCTION public.emitir_factura(p_pedido_id uuid, p_tipo factura_tipo, p_receptor jsonb DEFAULT NULL::jsonb, p_lineas jsonb DEFAULT NULL::jsonb, p_desglose jsonb DEFAULT NULL::jsonb, p_rectifica_a uuid DEFAULT NULL::uuid, p_sustituye_a uuid DEFAULT NULL::uuid, p_actor_id uuid DEFAULT NULL::uuid, p_fecha_operacion date DEFAULT NULL::date, p_refund_id text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_pedido      pedidos;
  v_emisor      jsonb;
  v_lineas      jsonb;
  v_desglose    jsonb;
  v_base        numeric(12, 2);
  v_cuota       numeric(12, 2);
  v_total       numeric(12, 2);
  v_suma_lineas numeric(12, 2);
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
      union all
      -- §7 de la 083: el descuento, DESPUÉS del porte (orden 2) para que el
      -- documento se lea de arriba abajo: artículos, envío, descuento, total.
      select 2, 'Descuento', null::numeric, z.linea
      from (select public.linea_descuento_factura(p_pedido_id, 1) as linea) z
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

  /**
   * ── §8 DE LA 083 · LAS LÍNEAS TIENEN QUE SUMAR EL TOTAL DEL DOCUMENTO ──────
   *
   * ⚠️⚠️ EL GUARDIA DE ARRIBA NO CUBRE ESTO, y por eso hace falta otro. Aquel
   * compara el DESGLOSE contra \`pedidos.total\`; este compara las LÍNEAS contra el
   * total del documento. Son cosas distintas: una línea con el signo o el importe
   * equivocados deja el desglose intacto, así que el primero pasa, la factura se
   * emite, se encadena y \`trg_factura_inmutable\` impide corregirla. Para siempre.
   *
   * ⭐ NO HEREDA DEUDA: comprobado contra el remoto el 2026-08-23, las 9 facturas
   * ya emitidas cumplen este invariante una a una, formato viejo y nuevo, ventas y
   * rectificativas. Se puede exigir desde hoy sin arreglar nada antes.
   *
   * ⚠️ Y CUBRE TAMBIÉN LAS RECTIFICATIVAS, que es lo que el otro guardia exime:
   * \`emitir_rectificativa\` no inserta, DELEGA aquí pasando sus líneas por
   * \`p_lineas\`. Un solo sitio protege los tres tipos de documento.
   *
   * ⚠️ El descuento es justo el primer concepto capaz de romperlo en silencio: va
   * en negativo, y un signo al revés cuadra el desglose y descuadra el papel.
   */
  select coalesce(sum((l->>'importe')::numeric), 0) into v_suma_lineas
  from jsonb_array_elements(v_lineas) l;

  if v_suma_lineas <> v_total then
    raise exception
      'Las líneas de la factura del pedido % suman % y el documento declara %. No se emite un documento cuyas líneas no cuadran con su total.',
      v_pedido.numero_pedido, v_suma_lineas, v_total
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
$function$
;

revoke execute on function public.emitir_factura(uuid, factura_tipo, jsonb, jsonb, jsonb, uuid, uuid, uuid, date, text) from public, anon, authenticated;


-- ── §6.2 · registrar_reembolso_lineas — deja de calcular el importe y lo pide 
--
-- Extraída del `prosrc` vivo (md5 c663df7162213f7184ab705c1eea28f2) y parcheada por script:
--     · el CTE `disponible`, que duplicaba el tope y la fórmula del PVP (1 reemplazo)
--     · el valor insertado en `importe`, que era PVP de catálogo (1 reemplazo)
-- Ni una letra más. El resto de la función es literalmente la que está desplegada.

CREATE OR REPLACE FUNCTION public.registrar_reembolso_lineas(p_pedido_id uuid, p_lineas jsonb, p_reponer_stock boolean, p_refund_id text, p_marcar_total boolean DEFAULT false, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    -- §6 de la 083: el tope y el importe los da importe_a_devolver, que es el
    -- único sitio que sabe cuánto se le debe al cliente por esas unidades.
    select d.pedido_item_id as id, d.cantidad, d.importe
    from public.importe_a_devolver(p_pedido_id, p_lineas) d
  ),
  insertada as (
    insert into public.reembolso_lineas (
      pedido_id, pedido_item_id, cantidad, importe,
      repuesto_al_stock, refund_id, actor_user_id
    )
    select
      p_pedido_id, d.id, d.cantidad, d.importe,
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
$function$
;

revoke execute on function public.registrar_reembolso_lineas(uuid, jsonb, boolean, text, boolean, uuid) from public, anon, authenticated;


-- ── §6.3 · reembolsar_pedido_total — lo pendiente se valora en neto 
--
-- Extraída del `prosrc` vivo (md5 3d807a6317fe82402716adbd74836165) y parcheada por script:
--     · el cuerpo de `pendiente_por_item`, que valoraba a PVP (1 reemplazo)
-- Ni una letra más. El resto de la función es literalmente la que está desplegada.

CREATE OR REPLACE FUNCTION public.reembolsar_pedido_total(p_pedido_id uuid, p_actor_id uuid DEFAULT NULL::uuid, p_refund_id text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    -- §6 de la 083: sigue siendo EL conjunto y se lee UNA sola vez, pero el
    -- importe lo valora importe_a_devolver en NETO, no a PVP de catálogo.
    select d.pedido_item_id, i.producto_id, d.cantidad, d.importe
    from public.importe_a_devolver(p_pedido_id, null) d
    join public.pedido_items i on i.id = d.pedido_item_id
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
$function$
;

revoke execute on function public.reembolsar_pedido_total(uuid, uuid, text) from public, anon, authenticated;


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

  -- ⚠️ Y coste_envio_de tiene que haber quedado con UNA sola firma. El drop de la
  -- de un argumento y el create de la de dos con default son las dos mitades de la
  -- misma operación: si el drop no surtió efecto, coste_envio_de(numeric) queda
  -- AMBIGUA y las llamadas de confirmar_venta fallan en ejecución, dentro del
  -- webhook de un pago ya cobrado.
  if (select count(*) from pg_proc
      where pronamespace = 'public'::regnamespace and proname = 'coste_envio_de') <> 1 then
    raise exception
      'coste_envio_de tiene % firmas y debe tener 1. La llamada de confirmar_venta quedaría ambigua.',
      (select count(*) from pg_proc
       where pronamespace = 'public'::regnamespace and proname = 'coste_envio_de');
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
    'public.linea_envio_factura(uuid, integer)',
    'public.reparto_descuento_lineas(uuid)',
    'public.congelar_descuento_lineas(uuid)',
    'public.codigo_descuento_aplicable(text, numeric)',
    'public.coste_envio_de(numeric, text)',
    'public.importe_a_devolver(uuid, jsonb)',
    'public.linea_descuento_factura(uuid, integer)'
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
