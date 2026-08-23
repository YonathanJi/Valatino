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
  // ⚠️ `emitir_rectificativa` YA NO ESTÁ AQUÍ, y no es un olvido: el §9 le sustituye
  // el CTE `esto` entero, y ese CTE contenía la única referencia al nombre viejo. Si
  // siguiera en esta lista el renombrado buscaría 1 aparición, encontraría 0 y
  // abortaría — que es exactamente lo que el verificador tiene que hacer.
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

const DEVOLVER = `
-- ── §6 · LO QUE SE LE DEVUELVE AL CLIENTE, EN UN SOLO SITIO ─────────────────
--
-- ⚠️⚠️ EL PROBLEMA, EN UNA FRASE: hoy los TRES escritores de
-- \`reembolso_lineas.importe\` calculan \`round(cantidad × precio_unitario, 2)\` cada
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
-- (\`round(k × neto / n, 2)\`) hace que dos devoluciones parciales de la misma línea
-- NO sumen el neto. Con el acumulado sí, por construcción:
--
--     importe(k) = round(neto × (ya+k)/n, 2) − round(neto × ya/n, 2)
--
-- Devolver 1 de 3 unidades de una línea con neto 19,00 da
-- \`round(19,00×1/3, 2)\` = 6,33; las 2 restantes dan \`19,00 − 6,33\` = 12,67, no
-- 2×6,33 = 12,66. Y al revés: 12,67 y luego 6,33. El céntimo no se pierde en ningún
-- orden, que es justo lo que la 078 tuvo que arreglar a mano.
--
-- ⚠️ NINGÚN TROZO SALE NEGATIVO: el acumulado no decrece en \`ya\`, porque
-- \`neto >= 0\` lo garantiza el CHECK \`descuento_imputado <= cantidad *
-- precio_unitario\` del §1.3. Pero SÍ puede salir 0,00 legítimamente, y por eso el
-- §1.4 relaja \`importe > 0\` a \`>= 0\`: filtrar esa fila dejaría la unidad sin
-- apuntar y —si es la última pendiente— sin disparar el trigger de la rectificativa.
--
-- ⭐ ABSORBE EL TOPE, no lo duplica. Los dos escritores tenían cada uno su
-- \`least(pedido, cantidad − ya_devuelto)\`; ahora está aquí y solo aquí, así que la
-- función devuelve directamente lo que se puede devolver y cuánto vale.
--
-- ⚠️ \`p_lineas = null\` significa TODO LO PENDIENTE, y es el modo que usa
-- \`reembolsar_pedido_total\`. Explícito a propósito: con \`'[]'\` habría que
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
    -- \`least\` de abajo las acota a las que quedan.
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
`;

const LINEA_DESCUENTO = `
-- ── §7 · EL DESCUENTO SALE EN LA FACTURA ────────────────────────────────────
--
-- ⚠️ ES OBLIGACIÓN LEGAL, no una cortesía. Art. 6.1.f RD 1619/2012: la factura debe
-- consignar «cualquier descuento o rebaja que no esté incluido en dicho precio
-- unitario». Y como aquí NO se baja el \`precio_unitario\` de las líneas —romper la
-- trazabilidad de la devolución sería peor—, el descuento tiene que salir como
-- concepto propio.
--
-- ⭐ UNA SOLA LÍNEA, con el mismo criterio que el porte desde la 082 y por la misma
-- razón, que la dijo el dueño mirando su primera factura real: «que salga el envío
-- total y ya, menos complicado para el cliente». Un descuento partido en dos líneas
-- por tipo de IVA tendría exactamente el problema que aquello vino a quitar.
--
-- ⚠️⚠️ EL SIGNO VA AL REVÉS QUE EL DEL PORTE, y es lo único delicado de esta
-- función. El porte SUMA y el descuento RESTA, así que con \`p_signo = 1\` (factura
-- de venta) el importe sale NEGATIVO, y con \`p_signo = -1\` (rectificativa) sale
-- POSITIVO — porque rectificar una venta es deshacer también su descuento. De ahí
-- el \`-p_signo\`.
--
-- ⚠️ \`iva_pct\` NULL cuando el descuento cae en varios tipos, igual que el porte, y
-- el reparto viaja DENTRO de la línea congelada en la clave \`reparto\`. Eso es lo que
-- hace que unificar la presentación no pierda información: el libro conserva de
-- dónde salió cada céntimo aunque el papel enseñe una sola cifra.
--
-- ⚠️⚠️ Y NULL SOLO VALE EN \`lineas\`, NUNCA EN \`desglose\`. El bloque \`doc\` de
-- \`liquidacion_iva\` agrupa por \`(d->>'iva_pct')\` del desglose: un grupo NULL no
-- casaría con \`pedido_iva\` y desaparecería de los totales del 303. El desglose se
-- COPIA de \`pedido_iva\`, que ya lleva el descuento neteado dentro, así que aquí no
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
  from public.${NUEVO}(p_pedido_id) r
  where r.descuento > 0;
$$;

comment on function public.linea_descuento_factura(uuid, int) is
  'La línea de factura del descuento, UNA sola con el total y en NEGATIVO (083 §7). Art. 6.1.f RD 1619/2012. Devuelve NULL si el pedido no llevó cupón. iva_pct es null cuando el descuento cae en varios tipos, y entonces el detalle va en la clave reparto. Mismo criterio que linea_envio_factura: es el único sitio que le da forma.';

revoke execute on function public.linea_descuento_factura(uuid, int) from public, anon, authenticated;
`;

const LIQUIDACION = `
-- ── §9 · EL 303 EN EL CASO DE FALLO — LA DEUDA DEL §7 DE LA 080 ─────────────
--
-- ⚠️⚠️ Y AL ABRIRLO SALIÓ ALGO PEOR DE LO QUE DECÍA LA DEUDA. La 080 dejó escrito
-- que a \`liquidacion_iva\` «le falta el porte, luego declara DE MÁS, y la dirección
-- del error es la conservadora». Es verdad, pero no es lo único:
--
--   \`emitir_rectificativas_pendientes\` YA TIENE EL PREDICADO BUENO. La 080 le añadió
--   la rama de «la devolución que solo devolvió el porte». \`liquidacion_iva\` NO la
--   tiene, en NINGUNO de sus tres sitios.
--
-- O sea que el panel YA SE CONTRADICE HOY: el botón «emitir las que faltan» ve una
-- devolución de solo porte y el aviso \`devolucion_sin_rectificativa\` del 303 no la
-- cuenta. No es que un importe salga corto: es que el CONJUNTO es distinto.
--
-- ⚠️⚠️ Y ESO ES EXACTAMENTE LO QUE ESTE PROYECTO SE PROHIBIÓ POR ESCRITO EN LA 075:
-- «El predicado de \`venta_sin_factura\` es EL MISMO que usa
-- \`emitir_facturas_pendientes\`, y tiene que serlo: si el aviso contara una cosa y el
-- botón «emitir las que faltan» emitiera otra, el panel se contradiría a sí mismo y
-- nadie podría saber cuál de los dos miente.» Con las rectificativas pasa justo eso.
--
-- ⭐⭐ ASÍ QUE EL ARREGLO NO ES AÑADIR EL PORTE EN TRES CTEs: es que el predicado y el
-- cálculo dejen de estar escritos más de una vez. Dos funciones, y cuatro sitios que
-- pasan a leer de ellas:
--
--     devoluciones_pendientes_de_rectificativa()   ← EL CONJUNTO
--       · emitir_rectificativas_pendientes  (el botón)
--       · liquidacion_iva → el contador de documentos del bloque rectificado
--       · liquidacion_iva → el aviso devolucion_sin_rectificativa
--
--     devolucion_desglose(pedido, refund)          ← EL DINERO, por tipo de IVA
--       · emitir_rectificativa  (el documento)
--       · liquidacion_iva → sin_doc  (el 303)
--
-- ⭐ Y el descuento no necesita ninguna rama nueva en ninguna de las dos: entra por
-- \`reembolso_lineas.importe\`, que desde el §6 ya es el NETO. Ese es el otro motivo
-- por el que el §6 iba antes que esto.

create or replace function public.devolucion_desglose(
  p_pedido_id uuid,
  p_refund_id text
)
returns table (iva_pct numeric, con_iva numeric)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select u.iva_pct, sum(u.con_iva)
  from (
    -- Los artículos devueltos, agrupados por el tipo que congeló la venta.
    -- ⭐ \`rl.importe\` es NETO desde el §6: el descuento ya viene restado y no hace
    -- falta ninguna rama para él.
    select i.iva_pct, sum(rl.importe) as con_iva
    from public.reembolso_lineas rl
    join public.pedido_items i on i.id = rl.pedido_item_id
    where rl.pedido_id = p_pedido_id and rl.refund_id = p_refund_id
    group by i.iva_pct
    union all
    -- ⚠️ EL PORTE, Y SOLO CUANDO ESTE REEMBOLSO ES EL QUE LO DEVOLVIÓ. Es
    -- todo-o-nada (080 §6.1), así que se marca en el pedido y no cabe como línea.
    -- Esta es la rama que a \`liquidacion_iva\` le faltaba en sus tres sitios.
    select r.iva_pct, r.envio
    from public.pedidos p
    cross join public.${NUEVO}(p.id) r
    where p.id = p_pedido_id
      and p.envio_devuelto_en_refund = p_refund_id
      and r.envio > 0
  ) u
  group by u.iva_pct;
$$;

comment on function public.devolucion_desglose(uuid, text) is
  'El dinero de UNA devolución repartido por tipo de IVA, IVA incluido: los artículos en NETO (reembolso_lineas.importe, con el descuento ya restado desde el §6) más el porte cuando ese reembolso fue el que lo devolvió (083 §9). Es el ÚNICO sitio que lo calcula: lo leen emitir_rectificativa y liquidacion_iva, y antes cada una lo hacía por su cuenta — con la de liquidacion_iva sin la rama del porte.';

revoke execute on function public.devolucion_desglose(uuid, text) from public, anon, authenticated;


create or replace function public.devoluciones_pendientes_de_rectificativa()
returns table (pedido_id uuid, refund_id text, cuando timestamptz)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select t.pedido_id, t.refund_id, min(t.cuando)
  from (
    select rl.pedido_id, rl.refund_id, rl.created_at as cuando
    from public.reembolso_lineas rl
    union all
    -- ⬇️ 080: la devolución que solo devolvió el porte, que NO deja ninguna fila en
    -- \`reembolso_lineas\`. \`envio_devuelto_el\` es una fecha y no un timestamp, así
    -- que ordena por el día — que es toda la precisión que hay y la que necesita el
    -- 303.
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
  group by t.pedido_id, t.refund_id;
$$;

comment on function public.devoluciones_pendientes_de_rectificativa() is
  'Las devoluciones que NO tienen rectificativa emitida, incluidas las que solo devolvieron el porte (083 §9). Extraída literalmente de emitir_rectificativas_pendientes, que ya la tenía bien, para que liquidacion_iva deje de tener su propia versión SIN la rama del porte: el aviso del 303 y el botón de «emitir las que faltan» tienen que contar lo mismo o el panel se contradice (regla de la 075).';

revoke execute on function public.devoluciones_pendientes_de_rectificativa() from public, anon, authenticated;
`;

/**
 * Parches estructurales sobre funciones vivas: reemplazos por expresión regular
 * con el número de coincidencias VERIFICADO. Se prefiere a retranscribir miles de
 * caracteres de SQL fiscal para cambiar un CTE o añadir un guardia.
 */
const PARCHES = [
  {
    nombre: "emitir_rectificativa",
    args: "p_pedido_id uuid, p_refund_id text, p_actor_id uuid",
    titulo: "el dinero devuelto lo da una funcion",
    reemplazos: [
      {
        que: "el CTE `esto`, que calculaba el desglose de la devolución por su cuenta",
        de: /with esto as \(\s*select u\.iva_pct, sum\(u\.con_iva\) as con_iva\s*from \([\s\S]*?\) u\s*group by u\.iva_pct\s*\),/,
        a: `with esto as (
    -- §9 de la 083: lo da \\\`devolucion_desglose\\\`, que es el único sitio que sabe
    -- valorar una devolución. Antes esto y el \\\`sin_doc\\\` de \\\`liquidacion_iva\\\`
    -- eran dos aritméticas sobre el mismo dinero, y la segunda no veía el porte.
    select g.iva_pct, g.con_iva
    from public.devolucion_desglose(p_pedido_id, p_refund_id) g
  ),`,
        veces: 1,
      },
    ],
  },
  {
    nombre: "emitir_rectificativas_pendientes",
    args: "p_actor_id uuid",
    titulo: "el conjunto lo da una funcion",
    reemplazos: [
      {
        que: "la subconsulta del conjunto, que ahora vive en una función",
        de: /select t\.pedido_id, t\.refund_id, min\(t\.cuando\) as cuando\s*from \([\s\S]*?\) t\s*where not exists \([\s\S]*?\)\s*group by t\.pedido_id, t\.refund_id\s*order by min\(t\.cuando\)/,
        a: `-- §9 de la 083: el conjunto lo da \\\`devoluciones_pendientes_de_rectificativa\\\`,
    -- extraída de aquí para que \\\`liquidacion_iva\\\` cuente EXACTAMENTE lo mismo. El
    -- orden se conserva: la serie tiene que salir en el orden en que ocurrieron.
    select d.pedido_id, d.refund_id, d.cuando
    from public.devoluciones_pendientes_de_rectificativa() d
    order by d.cuando`,
        veces: 1,
      },
    ],
  },
  {
    nombre: "liquidacion_iva",
    args: "p_desde date, p_hasta date",
    titulo: "los tres sitios ven el porte",
    reemplazos: [
      {
        que: "el CTE `sin_doc`: el dinero, que le faltaba el porte",
        de: /sin_doc as \(\s*select rl\.refund_id as ref, i\.iva_pct, sum\(rl\.importe\) as con_iva\s*from public\.reembolso_lineas rl\s*join public\.pedido_items i on i\.id = rl\.pedido_item_id\s*where public\.dia_fiscal\(rl\.created_at\) between p_desde and p_hasta\s*and not exists \([\s\S]*?\)\s*group by rl\.refund_id, i\.iva_pct\s*\),/,
        a: `sin_doc as (
    -- ⭐⭐ §9 de la 083. Antes esto leía \\\`reembolso_lineas\\\` con su propio predicado
    -- y SIN la rama del porte, así que (a) contaba de menos el dinero devuelto y
    -- (b) no veía las devoluciones de solo porte, que el botón de emitir las
    -- pendientes SÍ ve. Ahora el conjunto y el importe salen de las dos funciones
    -- que son el único sitio de cada cosa.
    select d.refund_id as ref, g.iva_pct, g.con_iva
    from public.devoluciones_pendientes_de_rectificativa() d
    cross join lateral public.devolucion_desglose(d.pedido_id, d.refund_id) g
    where public.dia_fiscal(d.cuando) between p_desde and p_hasta
  ),`,
        veces: 1,
      },
      {
        que: "la segunda rama del contador de documentos del bloque rectificado",
        de: /select rl\.refund_id\s*from public\.reembolso_lineas rl\s*where public\.dia_fiscal\(rl\.created_at\) between p_desde and p_hasta\s*and not exists \([\s\S]*?\)\s*\) r;/,
        a: `select d.refund_id
    from public.devoluciones_pendientes_de_rectificativa() d
    where public.dia_fiscal(d.cuando) between p_desde and p_hasta
  ) r;`,
        veces: 1,
      },
      {
        que: "el aviso `devolucion_sin_rectificativa`, que no contaba las de solo porte",
        de: /select count\(distinct rl\.refund_id\), string_agg\(distinct p\.numero_pedido, ', '\)\s*into v_cuantos, v_refs\s*from public\.reembolso_lineas rl\s*join public\.pedidos p on p\.id = rl\.pedido_id\s*where public\.dia_fiscal\(rl\.created_at\) between p_desde and p_hasta\s*and not exists \([\s\S]*?\);/,
        a: `select count(distinct d.refund_id), string_agg(distinct p.numero_pedido, ', ')
  into v_cuantos, v_refs
  from public.devoluciones_pendientes_de_rectificativa() d
  join public.pedidos p on p.id = d.pedido_id
  where public.dia_fiscal(d.cuando) between p_desde and p_hasta;`,
        veces: 1,
      },
    ],
  },
  {
    nombre: "emitir_factura",
    args:
      "p_pedido_id uuid, p_tipo factura_tipo, p_receptor jsonb, p_lineas jsonb, " +
      "p_desglose jsonb, p_rectifica_a uuid, p_sustituye_a uuid, p_actor_id uuid, " +
      "p_fecha_operacion date, p_refund_id text",
    titulo: "la linea del descuento y el guardia del §8",
    reemplazos: [
      {
        que: "la declaración de la variable del guardia nuevo",
        de: /(\n\s+v_total\s+numeric\(12, 2\);)/,
        a: "$1\n  v_suma_lineas numeric(12, 2);",
        veces: 1,
      },
      {
        que: "la rama del `union all` que añade la línea del descuento",
        de: /(select 1, 'Gastos de envío', null::numeric, z\.linea\s*from \(select public\.linea_envio_factura\(p_pedido_id, 1\) as linea\) z\s*where z\.linea is not null)/,
        a: `$1
      union all
      -- §7 de la 083: el descuento, DESPUÉS del porte (orden 2) para que el
      -- documento se lea de arriba abajo: artículos, envío, descuento, total.
      select 2, 'Descuento', null::numeric, z.linea
      from (select public.linea_descuento_factura(p_pedido_id, 1) as linea) z
      where z.linea is not null`,
        veces: 1,
      },
      {
        que: "el guardia del §8: Σ lineas = total del documento",
        de: /('La factura del pedido % sumaría % y se cobraron %\. No se emite un documento que no cuadra\.',\s*v_pedido\.numero_pedido, v_total, v_pedido\.total\s*using errcode = 'P0001';\s*end if;)/,
        a: `$1

  /**
   * ── §8 DE LA 083 · LAS LÍNEAS TIENEN QUE SUMAR EL TOTAL DEL DOCUMENTO ──────
   *
   * ⚠️⚠️ EL GUARDIA DE ARRIBA NO CUBRE ESTO, y por eso hace falta otro. Aquel
   * compara el DESGLOSE contra \\\`pedidos.total\\\`; este compara las LÍNEAS contra el
   * total del documento. Son cosas distintas: una línea con el signo o el importe
   * equivocados deja el desglose intacto, así que el primero pasa, la factura se
   * emite, se encadena y \\\`trg_factura_inmutable\\\` impide corregirla. Para siempre.
   *
   * ⭐ NO HEREDA DEUDA: comprobado contra el remoto el 2026-08-23, las 9 facturas
   * ya emitidas cumplen este invariante una a una, formato viejo y nuevo, ventas y
   * rectificativas. Se puede exigir desde hoy sin arreglar nada antes.
   *
   * ⚠️ Y CUBRE TAMBIÉN LAS RECTIFICATIVAS, que es lo que el otro guardia exime:
   * \\\`emitir_rectificativa\\\` no inserta, DELEGA aquí pasando sus líneas por
   * \\\`p_lineas\\\`. Un solo sitio protege los tres tipos de documento.
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
  end if;`,
        veces: 1,
      },
    ],
  },
  {
    nombre: "registrar_reembolso_lineas",
    args: "p_pedido_id uuid, p_lineas jsonb, p_reponer_stock boolean, p_refund_id text, p_marcar_total boolean, p_actor_id uuid",
    titulo: "deja de calcular el importe y lo pide",
    reemplazos: [
      {
        que: "el CTE `disponible`, que duplicaba el tope y la fórmula del PVP",
        de: /disponible as \(\s*select[\s\S]*?\) y on y\.pedido_item_id = i\.id\s*\),/,
        a: `disponible as (
    -- §6 de la 083: el tope y el importe los da importe_a_devolver, que es el
    -- único sitio que sabe cuánto se le debe al cliente por esas unidades.
    select d.pedido_item_id as id, d.cantidad, d.importe
    from public.importe_a_devolver(p_pedido_id, p_lineas) d
  ),`,
        veces: 1,
      },
      {
        que: "el valor insertado en `importe`, que era PVP de catálogo",
        de: /round\(d\.cantidad \* d\.precio_unitario, 2\)/,
        a: "d.importe",
        veces: 1,
      },
    ],
  },
  {
    nombre: "reembolsar_pedido_total",
    args: "p_pedido_id uuid, p_actor_id uuid, p_refund_id text",
    titulo: "lo pendiente se valora en neto",
    reemplazos: [
      {
        que: "el cuerpo de `pendiente_por_item`, que valoraba a PVP",
        de: /select\s+i\.id as pedido_item_id,\s*i\.producto_id,\s*i\.cantidad - coalesce\(r\.devuelto, 0\) as cantidad,\s*round\(\(i\.cantidad - coalesce\(r\.devuelto, 0\)\) \* i\.precio_unitario, 2\) as importe\s*from public\.pedido_items i\s*left join \([\s\S]*?\) r on r\.pedido_item_id = i\.id\s*where i\.pedido_id = p_pedido_id\s*and i\.cantidad - coalesce\(r\.devuelto, 0\) > 0/,
        a: `-- §6 de la 083: sigue siendo EL conjunto y se lee UNA sola vez, pero el
    -- importe lo valora importe_a_devolver en NETO, no a PVP de catálogo.
    select d.pedido_item_id, i.producto_id, d.cantidad, d.importe
    from public.importe_a_devolver(p_pedido_id, null) d
    join public.pedido_items i on i.id = d.pedido_item_id`,
        veces: 1,
      },
    ],
  },
];

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
trozos.push(DEVOLVER);
trozos.push(LINEA_DESCUENTO);
trozos.push(LIQUIDACION);

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

// 2b. Los parches estructurales: se extrae la función viva y se le cambian los CTEs
//     que calculaban dinero por su cuenta. Cada reemplazo verifica su número de
//     coincidencias: una regex que no casa devolvería el original SIN PROTESTAR, y
//     eso saldría como «migración aplicada» con la función vieja dentro.
for (const f of PARCHES) {
  const { rows } = await cliente.query(
    `select pg_get_functiondef(p.oid) as def, md5(p.prosrc) as md5, length(p.prosrc) as chars
     from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname = $1
       and pg_get_function_identity_arguments(p.oid) = $2`,
    [f.nombre, f.args],
  );
  if (rows.length !== 1) {
    throw new Error(
      `Esperaba 1 ${f.nombre}(${f.args}) y hay ${rows.length}. ` +
        `Firma cambiada o sobrecarga colgando: míralo antes de generar.`,
    );
  }

  let def = rows[0].def;
  const detalle = [];
  for (const r of f.reemplazos) {
    const casan = def.match(new RegExp(r.de.source, r.de.flags.includes("g") ? r.de.flags : r.de.flags + "g"));
    const n = casan ? casan.length : 0;
    if (n !== r.veces) {
      throw new Error(
        `${f.nombre}: el parche «${r.que}» casa ${n} vez/veces y esperaba ${r.veces}. ` +
          `Alguien tocó la función; NO se genera a ciegas.`,
      );
    }
    def = def.replace(r.de, r.a);
    detalle.push(`--     · ${r.que} (${r.veces} reemplazo)`);
  }

  md5s.push(`--   ${f.nombre}(${f.args.replace(/p_\w+\s+/g, "").slice(0, 60)})`);
  md5s.push(`--     md5(prosrc) = ${rows[0].md5}  ·  ${rows[0].chars} caracteres`);

  trozos.push(`
-- ── §6.${PARCHES.indexOf(f) + 1} · ${f.nombre} — ${f.titulo} ${"─".repeat(Math.max(0, 24 - f.titulo.length))}
--
-- Extraída del \`prosrc\` vivo (md5 ${rows[0].md5}) y parcheada por script:
${detalle.join("\n")}
-- Ni una letra más. El resto de la función es literalmente la que está desplegada.

${def};

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
    'public.coste_envio_de(numeric, text)',
    'public.importe_a_devolver(uuid, jsonb)',
    'public.linea_descuento_factura(uuid, integer)',
    'public.devolucion_desglose(uuid, text)',
    'public.devoluciones_pendientes_de_rectificativa()'
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
