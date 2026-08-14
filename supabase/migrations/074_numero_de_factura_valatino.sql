-- ============================================================
-- 074 — El número de factura: `VALS202600100`, y el formato en UN SOLO SITIO
--
-- Lo que Jonathan pidió: «quiero VAL202600100, el 2026 es el año en que estemos
-- y me gustaría que empezara en 100 para que no inicie en 00001».
--
-- ⚠️⚠️ Y LO PRIMERO QUE APARECIÓ ES QUE LA LETRA DE SERIE NO PUEDE DESAPARECER.
-- Hay tres series con contador independiente, y sin letra la simplificada y la
-- completa de la MISMA venta imprimirían las dos `VAL202600100`: dos documentos
-- contables distintos con el mismo número. Además el RD 1619/2012 art. 15.2
-- exige que las rectificativas vayan en serie propia, así que esa no se puede
-- fundir con nada. La letra va DENTRO del prefijo: `VALS` · `VALF` · `VALR`.
--
-- ⚠️⚠️ Y LO SEGUNDO, QUE ES UN FALLO LATENTE QUE ESTABA AHÍ: el formato vivía
-- TRIPLICADO — la columna generada (072 §3), el motor (072 §7) y su reescritura
-- (073 §3). Y no eran tres copias inocentes: **la huella se calcula del número
-- que arma el motor, y el que se imprime sale de la columna generada**. Mientras
-- coincidan no pasa nada; el día que difirieran, el hash cubriría un número
-- distinto del impreso y la cadena de Verifactu estaría certificando otra cosa.
-- Nadie lo habría visto, porque las dos expresiones son correctas por separado.
-- Desde aquí hay UNA función y las tres la llaman.
--
-- ⭐ POR QUÉ SE BORRAN LAS TRES FACTURAS QUE HAY, y no se renumeran: una factura
-- emitida NO se modifica (`trg_factura_inmutable`, 072 §6), y aunque se saltara
-- el trigger, el número ENTRA EN LA HUELLA — cambiarlo obliga a recalcular la
-- cadena entera. Borrar es lo honesto y, sobre todo, es lo que se puede hacer
-- HOY: el trigger solo deja borrar antes del arranque fiscal, que es justo la
-- ventana abierta ahora. Después del arranque esta migración se abortaría sola,
-- y eso es la red, no un descuido.
--
-- Se borran las tres, no solo la que Jonathan señaló: las otras dos llevan el
-- formato viejo y no hay forma de corregirles el número. Los pedidos, el stock y
-- las cuentas NO se tocan — esto no es la limpieza de pruebas.
-- ============================================================

-- ── §1 · El formato, y ahora en un solo sitio ────────────────────────────────
-- `VALS` + `2026` + `00100` = `VALS202600100`.
--
-- Immutable porque tiene que poder usarse en una columna generada, y porque lo
-- es de verdad: mismas partes, mismo número, siempre.
create or replace function public.factura_numero(
  p_serie       text,
  p_ejercicio   integer,
  p_correlativo integer
)
returns text
language sql
immutable
as $$
  select p_serie || p_ejercicio::text || lpad(p_correlativo::text, 5, '0');
$$;

comment on function public.factura_numero is
  'El número impreso de una factura. ⚠️ ÚNICA definición del formato: la usan la columna generada Y el motor, y la huella cubre el número — dos copias podrían hashear algo distinto de lo impreso.';

-- ── §2 · Con qué número arranca cada serie ───────────────────────────────────
-- Arrancar en 100 es legal: la ley exige que la numeración sea CORRELATIVA y sin
-- huecos, no que empiece en uno. Una serie que empieza en el 100 no tiene
-- huecos: no existió ninguna factura del 1 al 99.
--
-- ⭐ En una función con nombre y no como un literal suelto, por dos razones:
--   1. cambiarlo mañana es una línea, no una caza de literales;
--   2. **la limpieza de pruebas lo hereda gratis** — borra las filas de
--      `factura_contadores` (073 §6) y el motor las vuelve a crear con este
--      valor. Si el 100 estuviera escrito a mano en el motor, la limpieza
--      seguiría funcionando; si estuviera escrito a mano en la limpieza,
--      algún día discreparían.
create or replace function public.factura_correlativo_inicial()
returns integer
language sql
immutable
as $$
  select 100;
$$;

comment on function public.factura_correlativo_inicial is
  'Número con el que arranca cada serie de facturas. Decisión de negocio (Jonathan, 2026-08-14): no empezar en 1. La limpieza de pruebas lo hereda al borrar los contadores.';

-- ── §3 · Las series pasan a llevar el prefijo de la marca ────────────────────
-- ⚠️ Esta función alimenta el CHECK `facturas_serie_coherente`, así que serie y
-- tipo no pueden discrepar nunca. Y por eso el §4 (borrar) va ANTES de esto en
-- intención aunque el orden del fichero sea este: las filas viejas tienen serie
-- `F`/`S` y con la función nueva quedarían incoherentes. Se borran en el §4.
create or replace function public.serie_de_tipo(p_tipo public.factura_tipo)
returns text
language sql
immutable
as $$
  select case p_tipo
    when 'simplificada'  then 'VALS'
    when 'completa'      then 'VALF'
    when 'rectificativa' then 'VALR'
  end;
$$;

comment on function public.serie_de_tipo is
  'Serie fiscal de cada tipo de factura. La letra NO es adorno: sin ella, la simplificada y la completa de la misma venta imprimirían el mismo número.';

-- ── §4 · Fuera las facturas de prueba ────────────────────────────────────────
-- ⚠️ El orden es de la hoja a la raíz: `factura_eventos.factura_id` referencia
-- las facturas con ON DELETE RESTRICT.
--
-- ⭐ Esto se protege solo: `trg_factura_inmutable` aborta el DELETE si
-- `arranque_fiscal_el` no es NULL. Si alguien reaplicara esta migración con la
-- tienda ya arrancada, no borraría nada — fallaría con el mensaje del trigger.
-- No hace falta un `if` aquí, y ponerlo sería duplicar la regla.
delete from public.factura_eventos    where id is not null;
delete from public.facturas_emitidas  where id is not null;

-- Los contadores también, o la primera factura nueva sería la `VALS202600102`
-- con dos huecos que no existieron. Es la misma razón por la que la limpieza los
-- reinicia (073 §6).
delete from public.factura_contadores where serie is not null;

-- ── §5 · La columna generada llama a la función ──────────────────────────────
-- ⚠️ `SET EXPRESSION` es de PostgreSQL 17 (aquí: 17.6, comprobado). En 15 habría
-- que tirar la columna y recrearla, y eso arrastra la vista
-- `libro_facturas_expedidas`, que la referencia vía `f.*`. Con SET EXPRESSION la
-- columna no desaparece, así que la vista no se entera.
--
-- Reescribe la tabla y recalcula los valores almacenados. Con la tabla vacía por
-- el §4, no hay nada que recalcular.
alter table public.facturas_emitidas
  alter column numero set expression as (
    public.factura_numero(serie, ejercicio, correlativo)
  );

-- ── §6 · El motor deja de armar el número a mano ─────────────────────────────
-- Se reescribe entera porque `create or replace` lo exige. Respecto a la 073
-- cambian DOS LÍNEAS y nada más: el arranque del contador (§2) y el número (§1).
-- Todo lo demás —el cerrojo arriba, la idempotencia asimétrica, el emisor que no
-- lanza excepción, el desglose copiado— se mantiene palabra por palabra.
create or replace function public.emitir_factura(
  p_pedido_id   uuid,
  p_tipo        public.factura_tipo,
  p_receptor    jsonb default null,
  p_lineas      jsonb default null,
  p_desglose    jsonb default null,
  p_rectifica_a uuid  default null,
  p_sustituye_a uuid  default null,
  p_actor_id    uuid  default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_pedido      pedidos;
  v_emisor      jsonb;
  v_lineas      jsonb;
  v_desglose    jsonb;
  v_base        numeric(12, 2);
  v_cuota       numeric(12, 2);
  v_total       numeric(12, 2);
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

  -- ⚠️⚠️ IDEMPOTENCIA ASIMÉTRICA, y la asimetría es el arreglo:
  --
  --   · Pedir una SIMPLIFICADA cuando ya hay una completa devuelve la completa.
  --     La venta ya está facturada, y con más detalle. Emitir además una
  --     simplificada duplicaría el IVA en el libro.
  --
  --   · Pedir una COMPLETA cuando hay una simplificada SÍ sigue adelante: ese
  --     es el canje, el caso normal. Lo que se bloquea es una segunda completa.
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
  -- dinero (trigger diferido de la 072 §8) y una casilla sin rellenar en Ajustes
  -- no puede tumbar una venta. Lo canta el aviso del 303.
  v_emisor := emisor_fiscal();
  if v_emisor is null then
    insert into factura_eventos (evento, detalle, actor_id)
    values ('emision_sin_emisor',
            jsonb_build_object('pedido_id', p_pedido_id, 'tipo', p_tipo),
            p_actor_id);
    return null;
  end if;

  -- ⚠️ Los precios son PVP CON IVA INCLUIDO. El desglose separa base y cuota.
  v_lineas := coalesce(p_lineas, (
    select jsonb_agg(jsonb_build_object(
             'nombre',          pi.nombre_producto,
             'cantidad',        pi.cantidad,
             'precio_unitario', pi.precio_unitario,
             'iva_pct',         pi.iva_pct,
             'importe',         round(pi.cantidad * pi.precio_unitario, 2)
           ) order by pi.nombre_producto)
    from pedido_items pi where pi.pedido_id = p_pedido_id
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

  if p_tipo <> 'rectificativa' and p_lineas is null
     and v_total <> v_pedido.total then
    raise exception
      'La factura del pedido % sumaría % y se cobraron %. No se emite un documento que no cuadra.',
      v_pedido.numero_pedido, v_total, v_pedido.total
      using errcode = 'P0001';
  end if;

  v_operacion  := dia_fiscal(v_pedido.devengado_el);
  v_expedicion := case
    when p_tipo = 'simplificada' then v_operacion
    else dia_fiscal(now())
  end;

  v_serie     := serie_de_tipo(p_tipo);
  v_ejercicio := extract(year from v_expedicion)::integer;

  -- ── El número: contador con `for update`, no secuencia ──
  -- ⬇️ CAMBIO 1/2 de esta migración: el arranque sale de la función del §2.
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

  -- ⬇️ CAMBIO 2/2: el formato ya no se escribe aquí. Es la MISMA función que usa
  -- la columna generada, así que el número que se hashea y el que se imprime no
  -- pueden discrepar ni por un carácter.
  v_numero := factura_numero(v_serie, v_ejercicio, v_correlativo);
  v_huella := factura_huella(
    v_emisor->>'nif', v_numero, v_expedicion, p_tipo, v_cuota, v_total, v_anterior
  );

  insert into facturas_emitidas (
    tipo, serie, ejercicio, correlativo, pedido_id,
    fecha_expedicion, fecha_operacion,
    emisor, receptor, lineas, desglose,
    base_total, cuota_total, total,
    sustituye_a, rectifica_a,
    huella, huella_anterior, emitida_por
  ) values (
    p_tipo, v_serie, v_ejercicio, v_correlativo, p_pedido_id,
    v_expedicion, v_operacion,
    v_emisor, p_receptor, v_lineas, v_desglose,
    v_base, v_cuota, v_total,
    p_sustituye_a, p_rectifica_a,
    v_huella, v_anterior, p_actor_id
  )
  returning id into v_id;

  insert into factura_eventos (factura_id, evento, detalle, actor_id)
  values (v_id, 'emitida',
          jsonb_build_object('numero', v_numero, 'tipo', p_tipo, 'total', v_total),
          p_actor_id);

  return v_id;
end;
$$;

comment on function public.emitir_factura is
  'Motor de emisión. Devuelve el id, o NULL si falta el emisor o el desglose (lo recoge el aviso del 303). Idempotente salvo en rectificativas.';

-- ── §7 · El domicilio del emisor: la población, no el país ───────────────────
-- ⚠️ El fallo que destapó la primera factura real: `emisor_ciudad` decía
-- «españa», así que el domicilio salió impreso como
-- `Calle del Arco, 9 · 28840 españa (Madrid)`.
--
-- `Mejorada del Campo` NO es de memoria: es lo que da el diccionario del INE del
-- propio repo para el 28840 (`porCP['28840']` → `Mejorada del Campo`), la misma
-- fuente que valida las direcciones de envío desde la 041. Un dato fiscal no se
-- rellena a ojo — es la lección de la 069 con `fecha_factura`.
--
-- Se corrige aquí y no solo en la pantalla porque la factura que se emita a
-- continuación congela este valor en su snapshot, y entonces ya no habría vuelta.
update public.ajustes_tienda
   set emisor_ciudad = 'Mejorada del Campo'
 where emisor_codigo_postal = '28840'
   and lower(trim(coalesce(emisor_ciudad, ''))) in ('españa', 'espana', 'spain');
