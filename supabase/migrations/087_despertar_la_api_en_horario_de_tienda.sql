-- ─────────────────────────────────────────────────────────────────────────────
-- 087 · Despertar la API en horario de tienda (17/09/2026)
--
-- Ensayo:  node scripts/aplicar-sql.mjs --dry supabase/migrations/087_despertar_la_api_en_horario_de_tienda.sql
-- De veras: node scripts/aplicar-sql.mjs --go  supabase/migrations/087_despertar_la_api_en_horario_de_tienda.sql
--
-- ── QUÉ HACE Y POR QUÉ ──
--
-- La API vive en el plan Free de Render, que APAGA la instancia tras 15 minutos sin
-- tráfico entrante. Despertarla cuesta entre 32 y 100 s (medido el 12/09 y otra vez
-- el 17/09), y ese rato lo paga entero quien llegue de Google — que ahora llega, con
-- las páginas ya indexadas. Además, `next build` pide la API para la portada, las
-- legales, contacto y las categorías, así que con la API dormida el DESPLIEGUE FALLA.
--
-- Esto la mantiene despierta pidiéndole /health cada 10 minutos, pero SOLO dentro de
-- la ventana en que alguien puede estar comprando.
--
-- ⚠️⚠️ Y LA VENTANA NO ES UN CAPRICHO: ES UN PRESUPUESTO. Render da 750 horas de
-- instancia al mes POR WORKSPACE, y si se agotan SUSPENDE TODOS los servicios free
-- hasta el mes siguiente — o sea, tumbaría la API de la tienda. Un mes de 31 días
-- tiene 744 horas, así que mantenerla despierta 24/7 dejaría 6 HORAS de margen, y el
-- día que alguien creara un segundo servicio free caeríamos los dos.
--
--   ventana 06:00–23:59  =  18 h/día  ×  31 días  =  558 h de 750   (margen 192 h)
--
-- La hora de arranque la eligió Jonathan el 17/09. De 00:00 a 05:59 se deja dormir:
-- es cuando no hay nadie, y es lo que compra el margen.
--
-- ── LAS TRES DECISIONES QUE LLEVA DENTRO ──
--
-- ⚠️⚠️ 1. `timeout_milliseconds` = 120000, Y NO ES OPCIONAL. El defecto de pg_net es
-- de UN SEGUNDO. Y el 12/09 se midió algo que lo convierte en trampa: TRES peticiones
-- cortadas a los 70 s NO despertaron la instancia; solo lo hizo una cuarta sin cortar,
-- que tardó 100 s exactos. O sea que un ping que se rinde antes de tiempo puede NO
-- despertar nada — y tendríamos la tarea en verde cada 10 minutos con la API dormida,
-- que es peor que no tenerla. 120 s cubre los 100 s peores con margen.
--
-- ⭐ 2. La ventana vive en una FUNCIÓN, no en el `cron`. Se podría haber escrito
-- `*/10 6-23 * * *` y ahorrarse todo esto, pero pg_cron programa en UTC y Madrid es
-- UTC+1 en invierno y UTC+2 en verano: la ventana se desplazaría sola una hora en
-- marzo y en octubre, empezando a las 07:00 medio año sin que nadie tocara nada. Con
-- la hora calculada en `Europe/Madrid` el cambio de hora no existe. Y como la guarda
-- de abajo llama a LA MISMA función, el presupuesto se recalcula solo si alguien
-- mueve la ventana.
--
-- ⚠️ 3. Se pide /health y NO /robots.txt ni la raíz. Mientras el servicio duerme,
-- Render RESPONDE ÉL MISMO a /robots.txt con un «disallow all»: la petición no llega
-- a la aplicación y no despierta nada, pero devuelve 200. Apuntar ahí daría una tarea
-- perpetuamente en verde vigilando un servicio dormido. Que /health sí atraviesa está
-- MEDIDO, no supuesto: el 17/09 tardó 32,5 s, y eso solo pasa si levantó el proceso.
-- ─────────────────────────────────────────────────────────────────────────────

-- pg_net: peticiones HTTP desde Postgres. Asíncronas — se encolan y las lanza un
-- worker DESPUÉS del commit, así que no bloquean al cron ni un solo segundo.
create extension if not exists pg_net;

-- ── La ventana ───────────────────────────────────────────────────────────────
create or replace function public.api_debe_estar_despierta(momento timestamptz default now())
returns boolean
language sql
stable
set search_path = pg_catalog
as $fn$
  -- 06:00–23:59 hora de Madrid. Ver el porqué de la hora y del presupuesto arriba.
  select extract(hour from (momento at time zone 'Europe/Madrid')) >= 6;
$fn$;

comment on function public.api_debe_estar_despierta(timestamptz) is
  'Si a esa hora la API debe estar caliente (06:00-23:59 Madrid). Fuente unica de la ventana: la usan el cron despertar-api-en-horario-de-tienda y su guarda de presupuesto.';

-- ⚠️ Una función nueva en Supabase nace con EXECUTE para `public`, y eso incluye a
-- `anon`. Esta no filtra nada —dice si son más de las seis—, pero la costumbre de la
-- casa es no dejar funciones abiertas por omisión.
revoke execute on function public.api_debe_estar_despierta(timestamptz) from public;

-- ── La tarea ─────────────────────────────────────────────────────────────────
-- `cron.schedule` con un nombre ya existente lo REEMPLAZA, así que reaplicar esto no
-- duplica la tarea.
select cron.schedule(
  'despertar-api-en-horario-de-tienda',
  '*/10 * * * *',
  $cron$
    do $body$
    begin
      if not public.api_debe_estar_despierta() then
        return;  -- de madrugada se deja dormir: es lo que paga el margen de horas
      end if;

      perform net.http_get(
        url := 'https://api.valatino.es/health',
        timeout_milliseconds := 120000
      );
    end;
    $body$ language plpgsql;
  $cron$
);

-- ── Guardas autoverificantes ─────────────────────────────────────────────────
--
-- ⚠️ Van DESPUÉS y en la misma transacción: si alguna no se cumple, la migración
-- entera se deshace. Es la costumbre desde la 084.
do $guardas$
declare
  v_horas   int;
  v_mes31   int;
  v_tareas  int;
  v_activa  boolean;
  v_horario text;
  v_orden   text;
begin
  -- 1. pg_net está y expone exactamente lo que vamos a llamar.
  if to_regprocedure('net.http_get(text,jsonb,jsonb,int)') is null then
    raise exception 'pg_net no expone net.http_get(text,jsonb,jsonb,int). Revisa en qué esquema se instaló.';
  end if;

  -- 2. ⭐ EL PRESUPUESTO, recorriendo las 24 horas contra LA FUNCIÓN DE VERDAD.
  -- Si alguien mueve la ventana, este número cambia solo y la guarda salta si el
  -- horario nuevo no cabe en las 750 h. Es lo que impide que un cambio de hora
  -- aparentemente inocente suspenda la tienda a final de mes.
  select count(*) into v_horas
  from generate_series(0, 23) as h
  where public.api_debe_estar_despierta(
    (date_trunc('day', now() at time zone 'Europe/Madrid') + make_interval(hours => h))
      at time zone 'Europe/Madrid'
  );

  -- ⚠️ EL ORDEN DE ESTAS DOS IMPORTA, y el primer intento lo tenía al revés. Con la
  -- igualdad a 18 delante, la del presupuesto no podía saltar JAMÁS: si son 18 horas
  -- el gasto siempre da 558, y si no lo son salta la otra antes. Era una guarda que
  -- no comprobaba nada. Con el presupuesto delante, las dos son alcanzables: esta
  -- salta si alguien AMPLÍA la ventana, y la de abajo si alguien la MUEVE.
  v_mes31 := v_horas * 31;
  if v_mes31 > 700 then
    raise exception
      'La ventana gastaría % h en un mes de 31 días. El cupo de Render son 750 y aquí se exigen 50 de margen para el tráfico real de madrugada y los despliegues.',
      v_mes31;
  end if;

  if v_horas <> 18 then
    raise exception 'La ventana cubre % h/día y se esperaban 18 (06:00-23:59). Si el cambio es querido, actualiza también la cabecera de esta migración.', v_horas;
  end if;

  -- 3. La tarea existe una sola vez, activa, y cada 10 min (por debajo de los 15
  -- del apagado de Render).
  select count(*) into v_tareas from cron.job
  where jobname = 'despertar-api-en-horario-de-tienda';
  if v_tareas <> 1 then
    raise exception 'Hay % tareas llamadas despertar-api-en-horario-de-tienda y debe haber exactamente 1.', v_tareas;
  end if;

  select active, schedule, command into v_activa, v_horario, v_orden
  from cron.job where jobname = 'despertar-api-en-horario-de-tienda';

  if not v_activa then
    raise exception 'La tarea existe pero está inactiva.';
  end if;
  if v_horario <> '*/10 * * * *' then
    raise exception 'La tarea corre con horario "%" y debe ser */10 * * * * (por debajo de los 15 min del apagado).', v_horario;
  end if;

  -- 4. ⚠️ El timeout explícito y la ruta. Son las dos guardas contra el fallo MUDO:
  -- sin la primera se hereda el defecto de 1 s y la tarea queda en verde despertando
  -- a nadie; sin la segunda se puede apuntar a una ruta que Render contesta él mismo.
  if v_orden not like '%timeout_milliseconds%' then
    raise exception 'La tarea no fija timeout_milliseconds: heredaría el defecto de 1 s de pg_net, que puede no despertar la instancia.';
  end if;
  if v_orden not like '%/health%' then
    raise exception 'La tarea no pide /health. Con el servicio dormido, Render contesta él mismo otras rutas y el ping no despertaría nada.';
  end if;
end $guardas$;

-- Cómo queda, para verlo al aplicar.
select
  jobname                                                as tarea,
  schedule                                               as horario,
  active                                                 as activa,
  public.api_debe_estar_despierta()                      as toca_ahora,
  to_char(now() at time zone 'Europe/Madrid', 'HH24:MI') as hora_madrid
from cron.job
where jobname = 'despertar-api-en-horario-de-tienda';
