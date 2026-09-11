-- ─────────────────────────────────────────────────────────────────────────────
-- El Jugo Hit que se llamaba Lulo y era Mango (11/09/2026)
--
-- Ensayo:  node scripts/aplicar-sql.mjs --dry scripts/datos-jugo-hit-mango.sql
-- De veras: node scripts/aplicar-sql.mjs --go  scripts/datos-jugo-hit-mango.sql
--
-- ── QUÉ ESTABA MAL ──
--
-- `jugo-hit-sabor-lulo-6` se creó el 17/08 duplicando la ficha del lulo —de ahí
-- el sufijo `-6` que Postgres necesitó para no repetir el slug— pero es OTRO
-- producto: su variante dice «Mango» y su foto es un Hit de mango.
--
-- Quedó con dos datos de cada cosa:
--
--     variante  Mango                  ← lo que es
--     foto      Hit Mango, 237 ml      ← lo que es (comprobado mirando la imagen)
--     nombre    Jugo Hit Sabor Lulo    ← heredado del duplicado
--     slug      jugo-hit-sabor-lulo-6  ← heredado del duplicado
--
-- ⚠️ Y no era ambiguo: `jugo-hit-sabor-lulo` EXISTE, con variante «Lulo» y su
-- propia foto de lulo. O sea que el lulo ya está cubierto y a la familia le
-- faltaba justo el mango. Confirmado por Jonathan el 11/09.
--
-- Era el ÚNICO producto activo sin descripción, y estaba vacía a propósito desde
-- el 30/08: escribirle un texto de mango con el nombre diciendo «Lulo» dejaba la
-- página contradiciéndose consigo misma, que es peor que estar vacía.
--
-- ⚠️⚠️ EL SLUG CAMBIA, Y ESA URL YA ESTÁ EN EL SITEMAP QUE GOOGLE LEYÓ. Por eso
-- este fichero va acompañado de un redirect 301 permanente en
-- `apps/web/next.config.mjs`. Sin él, la URL vieja daría un 404 a quien llegue
-- desde el buscador y Google tardaría en enterarse de la nueva. El 301 es lo que
-- traspasa a la ficha nueva lo que la vieja tuviera ganado.
-- ─────────────────────────────────────────────────────────────────────────────

-- ⚠️ Las guardas van ANTES de tocar nada, y son tres porque son tres las formas
-- en que esto podía salir mal. En una sola transacción: si una salta, no entra
-- nada (ver la cabecera de `aplicar-sql.mjs`).
do $$
declare
  v_variante text;
  v_ocupado  int;
begin
  -- 1. Que el producto siga existiendo y siga siendo el que creo que es.
  select variante into v_variante
  from productos
  where slug = 'jugo-hit-sabor-lulo-6';

  if v_variante is null then
    raise exception 'No hay ningún producto con slug jugo-hit-sabor-lulo-6. ¿Ya se corrigió?';
  end if;

  if v_variante <> 'Mango' then
    raise exception 'La variante es «%» y no «Mango». Alguien la cambió: PARAR y mirar.', v_variante;
  end if;

  -- 2. Que el slug nuevo no pise a nadie. Hay UNIQUE, pero un error claro aquí
  --    dice qué pasa; el del índice solo dice que hay un duplicado.
  select count(*) into v_ocupado from productos where slug = 'jugo-hit-sabor-mango';
  if v_ocupado > 0 then
    raise exception 'El slug jugo-hit-sabor-mango ya está ocupado por otra ficha.';
  end if;

  -- 3. Que el lulo de verdad siga en su sitio. Es el dato en el que se apoya
  --    toda la decisión: si no existiera, «el lulo ya está cubierto» sería falso
  --    y habría que volver a preguntar cuál de los dos es cuál.
  if not exists (
    select 1 from productos where slug = 'jugo-hit-sabor-lulo' and variante = 'Lulo'
  ) then
    raise exception 'No encuentro el lulo de verdad (jugo-hit-sabor-lulo / Lulo). PARAR.';
  end if;
end $$;

update productos
set
  nombre = 'Jugo Hit Sabor Mango',
  slug = 'jugo-hit-sabor-mango',
  -- En el tono de sus tres hermanas, sin repetirles las muletillas («bien frío
  -- no necesita nada más» ya está en el lulo y en la mora). Los 237 ml salen de
  -- leer la etiqueta en la foto, no de suponer el formato.
  descripcion = 'El néctar de mango de Hit, espeso y dulce como debe ser, en la botellita de vidrio de 237 ml. El que se compraba a la salida del colegio, y que aquí no hay que encargarle a nadie.'
where slug = 'jugo-hit-sabor-lulo-6';

-- ── Cómo queda la familia entera, para verlo de un vistazo ───────────────────
--
-- Los cuatro sabores con su nombre, su slug y su variante diciendo lo mismo, y
-- ninguno sin descripción.
select
  slug,
  nombre,
  variante,
  case when descripcion is null or descripcion = '' then 'SIN DESCRIPCIÓN' else 'ok' end as texto,
  -- ⭐ La comprobación de verdad: que el sabor de la variante aparezca en el
  -- nombre. Es lo que estaba roto y lo que no puede volver a pasar.
  case when nombre ilike '%' || variante || '%' then 'coherente' else 'CONTRADICE' end as nombre_vs_variante
from productos
where familia = 'Jugo Hit'
order by variante;
