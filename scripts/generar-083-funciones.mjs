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
-- ⚠️⚠️ LOS DOS CONCEPTOS COMPARTEN LA MISMA VENTANA, Y NO ES ESTÉTICA. El porte y
-- el descuento se ponderan por el MISMO acumulado de artículos, con el MISMO
-- \`order by iva_pct\`. Es lo que hace que la suma de los netos por artículo de un
-- tipo sea EXACTAMENTE \`articulos(t) - descuento(t)\`, o sea que el universo
-- devolvible y el universo declarado vuelvan a ser el mismo conjunto — la
-- precondición que la 078 escribió en su cabecera. Con dos ventanas distintas
-- (por ejemplo ordenando una por \`iva_pct\` y otra por otra cosa) los dos números
-- dejarían de coincidir y el descuadre saldría en el 303, no aquí.
--
-- ⭐ EL ACUMULADO SE ESCRIBE UNA SOLA VEZ, a diferencia de la 080, que repetía la
-- ventana. Con dos conceptos habría que escribirla dos veces, y dos ventanas que
-- tienen que ser idénticas y están escritas por separado son un sitio donde
-- divergir en silencio. Se saca a su propio CTE (\`acum.art_acum\`).
--
-- ⚠️ EL REDONDEO ACUMULADO ES LO QUE HACE QUE LA SUMA SEA EXACTA POR
-- CONSTRUCCIÓN, para los dos conceptos y por la misma razón:
--
--     concepto_acum(i) = round(concepto × Σ_{j≤i} articulos(j) / articulos_total, 2)
--     concepto(i)      = concepto_acum(i) − concepto_acum(i−1)
--
-- El último acumulado es \`round(concepto × 1, 2)\` = el concepto entero, y los
-- trozos son sus diferencias: telescopan. Redondear cada trozo por su cuenta NO
-- suma (falla en 24 de 64 combinaciones, medido en la 080).

create or replace function public.${NUEVO}(p_pedido_id uuid)
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
    -- la 080, y no como un \`cross join\` a la fila del pedido. Se intentó lo
    -- segundo el 2026-08-23 «para leerlos en una pasada» y el ensayo revertido lo
    -- tumbó: con \`sum(g.articulos)\` en el mismo SELECT, las columnas del join
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
           -- El \`case\` no es defensivo por si acaso: un catálogo con precio 0 daría
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

trozos.push(REPARTO);
trozos.push(DESGLOSE);

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
`);

// La cabecera con los md5, ya conocidos.
trozos[0] += md5s.join("\n") + "\n-- ═══════════════════════════════════════════════════════════════════════════════\n";

fs.writeFileSync(SALIDA, trozos.join("\n"), "utf8");
await cliente.end();

console.log(`✅ generado ${path.relative(raiz, SALIDA)}`);
console.log(`   ${fs.readFileSync(SALIDA, "utf8").length} caracteres`);
for (const l of md5s) console.log("   " + l.replace(/^--\s*/, ""));
