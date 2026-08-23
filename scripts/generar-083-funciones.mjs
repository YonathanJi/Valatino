/**
 * Genera el §2 y el §3 de la migración 083 (códigos de descuento).
 *
 * ⚠️⚠️ POR QUÉ UN SCRIPT Y NO ESCRIBIRLO A MANO. Es la técnica de la 082, y la
 * razón es la misma: `emitir_rectificativa` son 9.900 caracteres de SQL fiscal de
 * los que este cambio toca UNA línea. Transcribirla a mano es meter 9.899
 * caracteres de riesgo para cambiar 20, y una errata en SQL fiscal es invisible.
 *
 * Así que las funciones que SOLO cambian de nombre se extraen del `prosrc` VIVO
 * —el texto literal que está desplegado, no lo que dicen las migraciones, que
 * tienen definiciones muertas: la 080 definió `emitir_factura` y
 * `emitir_rectificativa` y la 082 las redefinió— y se les aplica el parche por el
 * canal. Las que cambian de VERDAD se escriben aquí, a la vista.
 *
 * ⚠️ Y EL PARCHE SE VERIFICA: si el número de sustituciones no es el esperado, el
 * script ABORTA. Un `replace` que no encuentra nada devuelve el original sin
 * protestar, y eso saldría como «migración aplicada» con la función vieja dentro.
 *
 *   node scripts/generar-083-funciones.mjs
 *
 * Escribe `scripts/083_funciones.generado.sql`, que luego se pega al
 * final de `083_codigos_de_descuento.sql`. No se aplica nada aquí.
 */

import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const raiz = path.resolve(import.meta.dirname, "..");
const SALIDA = path.join(raiz, "scripts/083_funciones.generado.sql");

const VIEJO = "reparto_envio_pedido";
const NUEVO = "reparto_conceptos_pedido";

/**
 * Las que solo cambian de nombre, con cuántas veces DEBE aparecer el nombre viejo.
 * El número se comprobó contra la base el 2026-08-23; si cambia, alguien tocó la
 * función y hay que mirarlo antes de seguir.
 */
const RENOMBRAR = [
  { nombre: "linea_envio_factura", args: "p_pedido_id uuid, p_signo integer", veces: 1 },
  { nombre: "emitir_rectificativa", args: "p_pedido_id uuid, p_refund_id text, p_actor_id uuid", veces: 1 },
];

function conexion() {
  const url = fs.readFileSync(path.join(raiz, "supabase/.temp/pooler-url"), "utf8").trim();
  const ficheroPass = path.join(raiz, "supabase/.temp/db-password");
  const pass = fs.existsSync(ficheroPass)
    ? fs.readFileSync(ficheroPass, "utf8").trim()
    : process.env.SUPABASE_DB_PASSWORD;
  if (!pass) throw new Error("Falta supabase/.temp/db-password o SUPABASE_DB_PASSWORD.");
  return url.replace(/^(postgresql:\/\/[^:@/]+)@/, `$1:${encodeURIComponent(pass)}@`);
}

// ── Lo que cambia DE VERDAD, escrito a la vista ───────────────────────────────

const REPARTO = `
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
-- ⚠️⚠️ EL DESCUENTO NO SE REPARTE AQUÍ. Se LEE de \`pedido_items.descuento_imputado\`,
-- que lo congeló \`congelar_descuento_lineas\` (§4) antes de que esto corra. Y es la
-- decisión de diseño más importante del §4:
--
--   El porte se reparte por TIPO y ya está: no hay nada que devolver por línea,
--   porque el porte es todo-o-nada (080 §6.1). El descuento sí: cada unidad
--   devuelta arrastra su parte, y \`reembolso_lineas.pedido_item_id\` es NOT NULL, o
--   sea que la devolución solo sabe hablar de LÍNEAS. Así que el descuento tiene
--   que existir a nivel de línea de todas formas.
--
--   Y si existe a nivel de línea, calcularlo TAMBIÉN a nivel de tipo serían DOS
--   aritméticas que tienen que dar el mismo número. Es exactamente el patrón que
--   costó la 074. Así que hay una sola: la de línea, y esto la suma.
--
-- ⭐⭐ LA SUMA POR TIPO SALE EXACTA POR CONSTRUCCIÓN, no por suerte, y la razón está
-- en el ORDEN del acumulado del §4: se ordena por \`(iva_pct, id)\`, con el tipo
-- PRIMERO. Eso hace que el acumulado de la última línea de un tipo sea idéntico al
-- acumulado de ese tipo, así que las diferencias telescopan igual y
-- \`Σ_lineas_de_t descuento_imputado = descuento(t)\` al céntimo. Si el orden fuera
-- \`(id, iva_pct)\` la identidad se rompería y el descuadre saldría en el 303.
--
-- ⚠️ Y SI LA IMPUTACIÓN ESTUVIERA SIN HACER, esto devuelve descuento = 0 mientras
-- \`pedidos.total\` sí lo lleva restado → el guardia del desglose ABORTA. Es el fallo
-- ruidoso, que es el que se quiere: la misma protección que tiene \`coste_envio\`
-- porque el trigger escucha a \`pedido_items\` y no a \`pedidos\`.
--
-- ⭐ EL ACUMULADO DEL PORTE SE ESCRIBE UNA SOLA VEZ, a diferencia de la 080, que
-- repetía la ventana. Se saca a su propio CTE (\`acum.art_acum\`).
--
-- ⚠️ EL REDONDEO ACUMULADO ES LO QUE HACE QUE LA SUMA SEA EXACTA POR CONSTRUCCIÓN:
--
--     envio_acum(i) = round(envio × Σ_{j≤i} articulos(j) / articulos_total, 2)
--     envio(i)      = envio_acum(i) − envio_acum(i−1)
--
-- El último acumulado es \`round(envio × 1, 2)\` = el porte entero, y los trozos son
-- sus diferencias: telescopan. Redondear cada trozo por su cuenta NO suma (falla en
-- 24 de 64 combinaciones, medido en la 080).

create or replace function public.${NUEVO}(p_pedido_id uuid)
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
    -- \`cross join\` a la fila del pedido. Se intentó lo segundo el 2026-08-23 «para
    -- leerlo en una pasada» y el ensayo revertido lo tumbó: con
    -- \`sum(g.articulos)\` en el mismo SELECT, las columnas del join tendrían que
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
           -- El \`case\` no es defensivo por si acaso: un catálogo con precio 0 daría
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

comment on function public.${NUEVO}(uuid) is
  'Por tipo de IVA: lo que aportan los artículos, lo que le toca de porte y lo que le toca de descuento (083). Sucede a reparto_envio_pedido, que se dropeó. Es el ÚNICO sitio que reparte: la llaman recalcular_iva_pedido, linea_envio_factura y emitir_rectificativa. Los dos conceptos comparten la MISMA ventana de ponderación a propósito — ver §2 de la migración.';

revoke execute on function public.${NUEVO}(uuid) from public, anon, authenticated;
`;

const DESGLOSE = `
-- ── §3 · EL DESGLOSE, CON UN TÉRMINO MÁS ────────────────────────────────────
--
-- ⭐⭐ EL GUARDIA NO CAMBIA NI UNA LETRA, Y ESO ES LA COMPROBACIÓN DE QUE ESTO ESTÁ
-- BIEN. Es literalmente lo que la 080 dijo de sí misma, y el comentario del propio
-- guardia —escrito en la 062, antes de que existiera el envío— nombra este trabajo:
-- «Si algún día cambia cómo se calcula el total del pedido —unos gastos de envío,
-- un descuento—, esto salta aquí». El invariante pasa a cubrir el descuento SIN
-- haber tenido que relajarlo.
--
-- ⭐ LO ÚNICO QUE CAMBIA DE FONDO: \`articulos + envio\` pasa a
-- \`articulos + envio - descuento\`.
--
-- ⚠️ Y SE SACA A UN SUBSELECT PARA ESCRIBIRLO UNA SOLA VEZ. La 080 repetía
-- \`(r.articulos + r.envio)\` dos veces —una para la base y otra para la cuota—; con
-- el descuento serían tres, y una expresión de dinero repetida tres veces es un
-- sitio donde divergir. Ahora \`con_iva\` se define UNA vez y la regla de la 062
-- queda a la vista: la base se DERIVA dividiendo el importe agregado, y la cuota se
-- saca RESTANDO, nunca multiplicando. Es lo que hace que base + cuota sea
-- exactamente lo cobrado.
--
-- ⚠️ Si el descuento imputado a un tipo se comiera su aportación, \`con_iva\` saldría
-- negativo y el CHECK \`base >= 0\` de la 062 abortaría la venta. NO puede pasar con
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
      from public.${NUEVO}(p_pedido_id) r
    ) x
  ) y;

  -- El desglose tiene que sumar EXACTAMENTE lo cobrado. Si algún día cambia
  -- cómo se calcula el total del pedido —otro concepto—, esto salta aquí, en el
  -- momento de la venta, y no en el modelo 303 tres meses después con el
  -- trimestre ya cerrado.
  --
  -- ⚠️ Desde la 080 esto cubre también el envío, y desde la 083 el descuento. Es
  -- además lo que caza que alguien edite \`pedidos.coste_envio\` o
  -- \`pedidos.descuento\` de un pedido ya creado: el trigger del desglose escucha a
  -- \`pedido_items\`, no a \`pedidos\`, así que un cambio a mano no recalcula nada —
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
`;

const IMPUTACION = `
-- ── §4 · EL DESCUENTO BAJA HASTA LA LÍNEA, Y SE CONGELA ─────────────────────
--
-- ⚠️⚠️ POR QUÉ HASTA LA LÍNEA, que es la pregunta que decide el diseño entero.
-- \`reembolso_lineas.pedido_item_id\` es NOT NULL y todos sus consumidores hacen
-- \`join pedido_items\`: la devolución SOLO sabe hablar de líneas. Y un descuento
-- baja el valor de cada línea, así que si el descuento no llega hasta aquí,
-- devolver un artículo devuelve su PVP de catálogo — más dinero del que el cliente
-- pagó. La 078 avisó de esto para el porte («dinero declarado que no se puede
-- devolver») y tardó meses en morder; aquí es peor, porque la devolución parcial de
-- un pedido con cupón es el camino PRINCIPAL, no un borde.
--
-- ⭐⭐ Y POR QUÉ SE CONGELA en vez de derivarse al leer. Se consideró dejar
-- \`reembolso_lineas.importe\` como un PESO y convertirlo a dinero en tiempo de
-- lectura. Se descarta: esa conversión leería \`pedidos.descuento\` EN VIVO, y toda
-- esta casa está construida sobre lo contrario —\`carrito_items.precio_unitario\` es
-- una copia, \`checkout_datos.coste_envio\` un snapshot, \`pedido_items.iva_pct\` se
-- congela al vender, \`facturas_emitidas\` es inmutable—. Derivar al leer significa
-- que el día que alguien toque \`pedidos.descuento\` de un pedido con rectificativa
-- emitida, la función diría un número y el papel otro, y \`trg_factura_inmutable\`
-- impide corregir el papel. Es la avería de la 074 donde no hay vuelta atrás.
--
-- ⚠️⚠️ EL ORDEN DEL ACUMULADO ES \`(iva_pct, id)\`, CON EL TIPO PRIMERO, Y ES LO QUE
-- HACE QUE TODO CUADRE. Con ese orden, el acumulado de la ÚLTIMA línea de un tipo
-- es idéntico al acumulado de ese tipo, así que las diferencias telescopan igual y
--
--     Σ_{líneas de t} descuento_imputado  =  descuento(t)      al céntimo
--
-- Por eso \`reparto_conceptos_pedido\` puede limitarse a SUMAR esta columna en vez de
-- repartir por su cuenta: no son dos aritméticas que deban coincidir, es una. Con
-- el orden \`(id, iva_pct)\` la identidad se rompe y el descuadre sale en el 303.
--
-- ⚠️ El \`id\` no es un criterio de negocio, es solo el desempate que hace el orden
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
  -- ⚠️ \`is distinct from\` para no escribir filas que no cambian: el trigger puede
  -- correr más de una vez y un UPDATE que no cambia nada sigue costando una versión
  -- de fila y una entrada de WAL.
  --
  -- ⚠️ Escribir en \`pedido_items\` desde el trigger del propio \`pedido_items\` NO
  -- recursa: el trigger es \`after insert\`, y esto es un UPDATE. Comprobado en la
  -- base el 2026-08-23: los dos únicos triggers de la tabla son
  -- \`trg_pedido_item_hereda_iva\` (before insert, por fila) y
  -- \`trg_pedido_items_desglosa_iva\` (after insert, por sentencia).
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
-- ⚠️⚠️ EL ORDEN IMPORTA Y NO SE DEJA AL AZAR. \`reparto_conceptos_pedido\` SUMA
-- \`descuento_imputado\`, así que la imputación tiene que estar escrita antes de que
-- se calcule el desglose. La alternativa era un segundo trigger de sentencia, y
-- Postgres los dispara por ORDEN ALFABÉTICO del nombre: haría falta bautizarlo
-- \`trg_a_...\` para que fuera primero, y una garantía que depende de cómo se llame
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
`;

const CODIGOS = `
-- ── §5 · QUÉ HACE UN CÓDIGO, DECIDIDO EN UN SOLO SITIO ──────────────────────
--
-- ⚠️⚠️ ESTA REGLA NO PUEDE VIVIR EN TYPESCRIPT, y ya está escrito en el propio
-- \`carrito.service.ts\` para el porte: «EL ENVÍO LO DECIDE LA BASE, NUNCA ESTE
-- FICHERO… Aplicar aquí la regla en TypeScript sería tenerla en dos sitios: el día
-- que difirieran, se cobraría un importe y se facturaría otro, y el guardia del
-- desglose abortaría DENTRO del webhook de un pago ya cobrado. Es la lección de la
-- 074». Con el descuento vale igual. La pantalla solo FORMATEA lo que devuelve
-- esto.
--
-- ⭐ Devuelve \`motivo\` en texto para el cliente. Que el rechazo lo redacte la base
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

  -- \`now()\` es estable dentro de la transacción, así que la función puede ser
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
    -- total de 0,40 € y \`createPaymentIntent\` devuelve un 400 en la cara del
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
  -- El CHECK de la tabla y este \`if\` son dos sitios que hablan de los mismos dos
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
-- ⚠️⚠️ AMPLIAR LA FIRMA OBLIGA A \`drop function\`. Con \`create or replace\` y un
-- parámetro nuevo Postgres crea una SOBRECARGA, no reemplaza nada, y entonces
-- \`coste_envio_de(numeric)\` queda AMBIGUA entre la vieja de un argumento y la nueva
-- con default. Es la lección de la 068, repetida en la 077 §1.
--
-- ⭐ Y por eso el parámetro lleva default: \`confirmar_venta\` y
-- \`crear_pedido_transferencia\` la llaman con un solo argumento y NO hay que
-- recrearlas (son plpgsql, resuelven en ejecución). El carrito la llama por RPC con
-- \`{ p_subtotal }\` y sigue funcionando igual.
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
    -- cadena fiscal — \`linea_envio_factura\` filtra por \`envio > 0\` y la factura
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
`;

// ── El generador ─────────────────────────────────────────────────────────────

const cliente = new pg.Client({ connectionString: conexion(), ssl: { rejectUnauthorized: false } });
await cliente.connect();

const trozos = [];

trozos.push(`-- ═══════════════════════════════════════════════════════════════════════════════
-- §2 y §3 de la 083 — GENERADO por scripts/generar-083-funciones.mjs
--
-- ⚠️⚠️ NO EDITAR A MANO. Las dos funciones que solo cambian el nombre de la función
-- de reparto se extrajeron del \`prosrc\` VIVO de la base y se les aplicó el parche
-- por script, con el número de sustituciones verificado. Editarlas aquí rompe esa
-- garantía: vuelve a generar.
--
-- md5 de los cuerpos vivos de los que se partió, para poder demostrar de dónde
-- salió esto:
`);

// 1. El guardia previo: nadie más puede estar llamando a la función que se dropea.
trozos.push(`
-- ── §2.0 · EL GUARDIA DEL DROP ──────────────────────────────────────────────
--
-- ⚠️⚠️ POSTGRES NO AVISA. Dropear una función no comprueba quién la llama: los
-- consumidores siguen compilando y fallan AL EJECUTARSE, y los tres que hay están
-- en la ruta del dinero (el desglose de la venta, la línea de la factura y el
-- desglose de la rectificativa). Así que se comprueba a mano ANTES de dropear.
--
-- ⚠️ Y NO SE DEJA UN WRAPPER con el nombre viejo, que sería lo cómodo. Un
-- \`reparto_envio_pedido\` que siguiera existiendo devolvería el porte y CALLARÍA el
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
    and p.prosrc like '%${VIEJO}%'
    and p.proname not in ('${VIEJO}', 'recalcular_iva_pedido', 'linea_envio_factura', 'emitir_rectificativa');

  if v_inesperados is not null then
    raise exception
      'Hay consumidores de ${VIEJO} que esta migración NO recrea: %. Postgres no avisa: fallarían al ejecutarse y están en la ruta del dinero.',
      v_inesperados;
  end if;
end $comprobar$;
`);

// Orden por DEPENDENCIA, no por número de sección: `reparto_conceptos_pedido` es
// `language sql` y su cuerpo se valida al crearla, así que lo que lea tiene que
// existir ya. El §4 va antes del §2 aunque se numere después.
trozos.push(IMPUTACION);
trozos.push(REPARTO);
trozos.push(DESGLOSE);
trozos.push(CODIGOS);

// 2. Las que solo cambian de nombre: se extraen vivas y se parchean.
const md5s = [];
for (const f of RENOMBRAR) {
  const { rows } = await cliente.query(
    `select pg_get_functiondef(p.oid) as def, md5(p.prosrc) as md5, length(p.prosrc) as chars
     from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname = $1
       and pg_get_function_identity_arguments(p.oid) = $2`,
    [f.nombre, f.args],
  );
  if (rows.length !== 1) {
    throw new Error(`Esperaba 1 ${f.nombre}(${f.args}) y hay ${rows.length}. Firma cambiada o sobrecarga colgando.`);
  }

  const def = rows[0].def;
  const veces = (def.match(new RegExp(VIEJO, "g")) || []).length;
  if (veces !== f.veces) {
    throw new Error(
      `${f.nombre}: esperaba ${f.veces} aparición(es) de ${VIEJO} y hay ${veces}. ` +
        `Alguien tocó la función; míralo antes de generar.`,
    );
  }

  const parcheado = def.split(VIEJO).join(NUEVO);
  if (parcheado === def) throw new Error(`${f.nombre}: el parche no cambió nada.`);

  md5s.push(`--   ${f.nombre}(${f.args})`);
  md5s.push(`--     md5(prosrc) = ${rows[0].md5}  ·  ${rows[0].chars} caracteres`);

  trozos.push(`
-- ── §2.${md5s.length / 2} · ${f.nombre} — SOLO CAMBIA EL NOMBRE DEL REPARTO ${"─".repeat(Math.max(0, 20 - f.nombre.length))}
--
-- Extraída del \`prosrc\` vivo (md5 ${rows[0].md5}) y parcheada por script:
-- ${f.veces} sustitución(es) de ${VIEJO} → ${NUEVO}, verificadas. Ni una letra más.

${parcheado};

revoke execute on function public.${f.nombre}(${f.args.replace(/p_\w+\s+/g, "")}) from public, anon, authenticated;
`);
}

// 3. Los guardias de después.
trozos.push(`
-- ── §2.9 · LO QUE HAY QUE COMPROBAR DESPUÉS ─────────────────────────────────

drop function if exists public.${VIEJO}(uuid);

do $comprobar$
begin
  -- El nombre viejo no puede quedar ni como sobrecarga.
  if exists (
    select 1 from pg_proc
    where pronamespace = 'public'::regnamespace and proname = '${VIEJO}'
  ) then
    raise exception '${VIEJO} sigue existiendo tras el drop.';
  end if;

  -- UNA sola sobrecarga de la nueva. El otro fallo clásico de reemplazar
  -- funciones con defaults es dejar la firma vieja colgando: hoy mismo se
  -- encontró \`cancelar_transferencia_reemplazada\` con DOS, así que pasa de verdad.
  if (select count(*) from pg_proc
      where pronamespace = 'public'::regnamespace and proname = '${NUEVO}') <> 1 then
    raise exception '${NUEVO} tiene más de una sobrecarga.';
  end if;

  -- Y nadie puede haberse quedado apuntando al nombre viejo.
  if exists (
    select 1 from pg_proc
    where pronamespace = 'public'::regnamespace and prosrc like '%${VIEJO}%'
  ) then
    raise exception 'Queda alguna función llamando a ${VIEJO} después del drop.';
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
    'public.${NUEVO}(uuid)',
    'public.recalcular_iva_pedido(uuid)',
    'public.linea_envio_factura(uuid, integer)',
    'public.reparto_descuento_lineas(uuid)',
    'public.congelar_descuento_lineas(uuid)',
    'public.codigo_descuento_aplicable(text, numeric)',
    'public.coste_envio_de(numeric, text)'
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
`);

// La cabecera con los md5, ya conocidos.
trozos[0] += md5s.join("\n") + "\n-- ═══════════════════════════════════════════════════════════════════════════════\n";

fs.writeFileSync(SALIDA, trozos.join("\n"), "utf8");
await cliente.end();

console.log(`✅ generado ${path.relative(raiz, SALIDA)}`);
console.log(`   ${fs.readFileSync(SALIDA, "utf8").length} caracteres`);
for (const l of md5s) console.log("   " + l.replace(/^--\s*/, ""));
