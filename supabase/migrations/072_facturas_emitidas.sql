-- ============================================================
-- 072 — Facturas emitidas: la numeración, la cadena y la simplificada
--
-- La Capa 2. Toda venta devengada emite su factura simplificada sola; la
-- completa con los datos del cliente (073) la sustituye cuando la pide.
--
-- ⚠️⚠️ LAS LÍNEAS VAN EN jsonb, NO EN UNA TABLA HIJA — y esto CONTRADICE lo que
-- yo mismo dejé escrito en ESTADO.md («tabla propia … con snapshot de todo»).
-- El motivo apareció al escribir la cadena de hash:
--
--   La huella tiene que cubrir el documento COMPLETO, líneas incluidas. Con una
--   tabla hija el padre se inserta primero —y en ese momento no hay líneas que
--   hashear— y las líneas después. Habría que calcular la huella en un trigger
--   diferido, y entonces la huella de una factura dependería de cuándo se mira.
--
-- Con las líneas dentro, el documento entero existe en el INSERT y la huella se
-- calcula sobre él de una vez. Y encaja con lo que la cosa ES: una factura es
-- un documento congelado, no una relación que se consulta por líneas. Nadie va
-- a preguntar «qué facturas llevan el producto X» — para eso están los pedidos,
-- que siguen normalizados y siguen siendo la verdad de la venta.
--
-- ⭐ LA REGLA DE ORO: la base y la cuota se COPIAN de `pedido_iva`, no se
-- recalculan. La 062 dejó `recalcular_iva_pedido` como el ÚNICO sitio que
-- redondea, porque el orden de las operaciones cambia la base en céntimos.
-- Recalcular aquí daría una factura que no cuadra con el 303 sobre el mismo
-- dinero, que es exactamente el descuadre que un inspector busca.
--
-- Verifactu (RD 1007/2023) va puesto desde el día uno: huella encadenada,
-- append-only y registro de eventos. Se decidió con Jonathan no esperar a la
-- gestoría porque es el diseño que se quiere igualmente y retrofitarlo es
-- horrible. ⚠️ Lo que SIGUE pendiente de ella: si hay que remitir los registros
-- a la AEAT y desde cuándo. Eso no cambia esta tabla, añade un proceso.
-- ============================================================

-- ── §1 · El tipo de documento ────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'factura_tipo') then
    create type public.factura_tipo as enum ('simplificada', 'completa', 'rectificativa');
  end if;
end $$;

-- Una sola definición de qué letra lleva cada tipo. La usan el contador y la
-- columna `serie`, así que no pueden discrepar.
create or replace function public.serie_de_tipo(p_tipo public.factura_tipo)
returns text
language sql
immutable
as $$
  select case p_tipo
    when 'simplificada'  then 'S'
    when 'completa'      then 'F'
    when 'rectificativa' then 'R'
  end;
$$;

-- ── §2 · El contador ─────────────────────────────────────────────────────────
-- ⚠️⚠️ UNA SECUENCIA DE POSTGRES NO SIRVE: no retrocede cuando la transacción
-- aborta, y dejaría huecos en una serie que la ley exige correlativa y sin
-- huecos. Hace falta un contador de verdad, leído con `for update` dentro de la
-- misma transacción — la disciplina de bloqueo de la 056.
--
-- Por (serie, ejercicio): las series son independientes y el número reinicia
-- cada año.
create table if not exists public.factura_contadores (
  serie     text    not null,
  ejercicio integer not null check (ejercicio between 2020 and 2100),
  siguiente integer not null default 1 check (siguiente >= 1),
  primary key (serie, ejercicio)
);

comment on table public.factura_contadores is
  'Correlativo por serie y ejercicio. Se lee con `for update`: una secuencia dejaría huecos al abortar.';

alter table public.factura_contadores enable row level security;

-- ── §3 · Las facturas ────────────────────────────────────────────────────────
create table if not exists public.facturas_emitidas (
  id uuid primary key default gen_random_uuid(),

  -- Orden de la CADENA, no número fiscal: puede tener huecos sin que importe.
  -- Sirve para saber cuál es la factura anterior sin depender de `created_at`,
  -- que empata cuando dos facturas nacen en la misma transacción.
  orden bigint generated always as identity,

  tipo        public.factura_tipo not null,
  serie       text    not null,
  ejercicio   integer not null,
  correlativo integer not null check (correlativo >= 1),

  -- El número impreso. Generado, así que no puede discrepar de sus partes.
  numero text generated always as (
    serie || ejercicio::text || '/' || lpad(correlativo::text, 5, '0')
  ) stored,

  -- ⚠️ RESTRICT y no CASCADE: una factura no desaparece porque alguien borre el
  -- pedido. Al revés — la factura PROTEGE al pedido de ser borrado. La limpieza
  -- de pruebas tiene que quitar las facturas primero, y solo puede antes del
  -- arranque fiscal (ver el trigger de §6).
  pedido_id uuid not null references public.pedidos (id) on delete restrict,

  -- ⚠️⚠️ DOS FECHAS Y HACEN FALTA LAS DOS.
  --   · expedición: cuándo se emite el documento
  --   · operación:  cuándo ocurrió la venta (`dia_fiscal(pedidos.devengado_el)`)
  -- El IVA pertenece al trimestre de la OPERACIÓN. Por eso emitir una completa
  -- en octubre de una venta de julio NO mueve el trimestre: el 303 liquida por
  -- `devengado_el` desde la 068.
  fecha_expedicion date not null,
  fecha_operacion  date not null,

  -- Snapshots. Congelados a propósito: si Hacienda cambia un tipo —pasó con el
  -- aceite, las mascarillas y la luz— un `join` reescribiría facturas emitidas.
  emisor   jsonb not null,
  receptor jsonb,          -- NULL en simplificada: no lleva NIF ni dirección
  lineas   jsonb not null,
  desglose jsonb not null, -- [{iva_pct, base, cuota}] copiado de `pedido_iva`

  base_total  numeric(12, 2) not null,
  cuota_total numeric(12, 2) not null,
  total       numeric(12, 2) not null,

  -- Una completa sustituye a la simplificada de esa venta (el canje). Una
  -- rectificativa rectifica a la que corrige.
  sustituye_a uuid references public.facturas_emitidas (id) on delete restrict,
  rectifica_a uuid references public.facturas_emitidas (id) on delete restrict,

  -- Verifactu: la huella de esta factura y la de la anterior de la cadena.
  huella          text not null,
  huella_anterior text,

  emitida_por uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),

  constraint facturas_serie_coherente check (serie = public.serie_de_tipo(tipo)),
  constraint facturas_numero_unico    unique (serie, ejercicio, correlativo),

  -- El documento tiene que sumar. Si esto salta, la factura no nace.
  constraint facturas_cuadra check (base_total + cuota_total = total),

  -- Una rectificativa dice a quién rectifica; las demás, no.
  constraint facturas_rectifica_coherente check (
    (tipo = 'rectificativa') = (rectifica_a is not null)
  ),
  -- Solo una completa sustituye a otra factura.
  constraint facturas_sustituye_coherente check (
    sustituye_a is null or tipo = 'completa'
  )
);

-- ⚠️ IDEMPOTENCIA, y es la 054/055 otra vez: allí registrar dos veces la misma
-- factura de compra DUPLICABA EL STOCK. Aquí un doble clic en «Emitir» daría
-- dos facturas del mismo pedido, dos números y el IVA duplicado en el libro.
--
-- Parcial porque las rectificativas SÍ pueden ser varias: un pedido admite
-- devoluciones parciales sucesivas, cada una con la suya.
create unique index if not exists idx_factura_una_por_pedido_y_tipo
  on public.facturas_emitidas (pedido_id, tipo)
  where tipo <> 'rectificativa';

create index if not exists idx_facturas_operacion  on public.facturas_emitidas (fecha_operacion);
create index if not exists idx_facturas_pedido     on public.facturas_emitidas (pedido_id);
create unique index if not exists idx_facturas_huella on public.facturas_emitidas (huella);

alter table public.facturas_emitidas enable row level security;

comment on table public.facturas_emitidas is
  'Libro de facturas expedidas. Inmutable y append-only. Las líneas van en jsonb porque la huella cubre el documento completo.';
comment on column public.facturas_emitidas.orden is
  'Orden de la cadena de huellas. NO es el número fiscal y puede tener huecos.';

-- ── §4 · El registro de eventos (Verifactu) ──────────────────────────────────
-- Lo exige el RD: el sistema tiene que dejar rastro de lo que hace, incluido lo
-- que RECHAZA. Un intento fallido de emitir es información: dice que alguien
-- pulsó y que el sistema dijo no.
create table if not exists public.factura_eventos (
  id          uuid primary key default gen_random_uuid(),
  factura_id  uuid references public.facturas_emitidas (id) on delete restrict,
  evento      text not null,
  detalle     jsonb,
  actor_id    uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_factura_eventos_factura on public.factura_eventos (factura_id);
alter table public.factura_eventos enable row level security;

-- ── §5 · La huella ───────────────────────────────────────────────────────────
-- El encadenado: cada factura incluye la huella de la anterior, así que cambiar
-- una rompe todas las siguientes de forma detectable.
--
-- ⚠️ EL FORMATO DE LOS NÚMEROS ES PARTE DE LA HUELLA. Un `numeric` a texto
-- puede salir «1.5» o «1.50» según la escala, y eso daría dos huellas distintas
-- para la misma factura. `to_char` con formato fijo lo clava.
--
-- ⚠️ El orden exacto de los campos que exige la AEAT está pendiente de la
-- gestoría. El encadenado es correcto y detecta manipulación igual; si el orden
-- oficial resulta ser otro, se recalcula la cadena ANTES del arranque fiscal,
-- que es justo la ventana que hay ahora.
create or replace function public.factura_huella(
  p_nif_emisor      text,
  p_numero          text,
  p_fecha           date,
  p_tipo            public.factura_tipo,
  p_cuota           numeric,
  p_total           numeric,
  p_huella_anterior text
)
returns text
language sql
immutable
as $$
  select upper(encode(sha256(convert_to(
    p_nif_emisor
      || '|' || p_numero
      || '|' || to_char(p_fecha, 'YYYY-MM-DD')
      || '|' || p_tipo::text
      || '|' || to_char(p_cuota, 'FM99999999990.00')
      || '|' || to_char(p_total, 'FM99999999990.00')
      || '|' || coalesce(p_huella_anterior, ''),
    'UTF8')), 'hex'));
$$;

comment on function public.factura_huella is
  'Huella SHA-256 de una factura, encadenada con la anterior. El formato numérico es parte de la huella: to_char fijo, no ::text.';

-- ── §6 · Inmutable, y el único caso en que no ────────────────────────────────
-- Se hace con un TRIGGER y no solo con revokes porque un revoke no alcanza a
-- quien es dueño de la tabla, y esto tiene que valer para todos.
--
-- ⭐ La regla de borrado vive AQUÍ y no en la limpieza: antes del arranque
-- fiscal (064) los datos son de prueba y se pueden tirar; después, una factura
-- es un registro contable y no se borra jamás. Ponerlo en el trigger significa
-- que la limpieza no tiene que acordarse — y que ninguna limpieza futura podrá
-- olvidarlo.
create or replace function public.factura_emitida_es_inmutable()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_arranque timestamptz;
begin
  if tg_op = 'UPDATE' then
    raise exception
      'Una factura emitida no se modifica jamás (%). Para corregirla se emite una rectificativa.',
      old.numero
      using errcode = 'P0001';
  end if;

  select arranque_fiscal_el into v_arranque from public.ajustes_tienda where id;

  if v_arranque is not null then
    raise exception
      'La tienda arrancó de verdad el % y la factura % es un registro contable: no se borra.',
      v_arranque, old.numero
      using errcode = 'P0001';
  end if;

  -- Modo pruebas: se deja borrar. Y NO se anota el borrado en `factura_eventos`,
  -- a propósito: lo único que puede borrarse es una factura de prueba, y el
  -- sentido de la limpieza es que no quede rastro de las pruebas. Un evento
  -- superviviente de algo que ya no existe es basura que alguien tendría que
  -- interpretar. Después del arranque no hace falta rastro porque no hay borrado.
  return old;
end;
$$;

drop trigger if exists trg_factura_inmutable on public.facturas_emitidas;
create trigger trg_factura_inmutable
  before update or delete on public.facturas_emitidas
  for each row execute function public.factura_emitida_es_inmutable();

-- ── §7 · El motor ────────────────────────────────────────────────────────────
-- La firma se escribe COMPLETA ahora, aunque la 072 solo use la simplificada.
-- Es la lección de la 068: ampliar una firma obliga a `drop function` para
-- evitar la ambigüedad, y quitar un `default` da «function does not exist», que
-- es el error que menos ayuda. Se diseña una vez.
create or replace function public.emitir_factura(
  p_pedido_id   uuid,
  p_tipo        public.factura_tipo,
  p_receptor    jsonb default null,
  p_lineas      jsonb default null,   -- NULL = todas las líneas del pedido
  p_desglose    jsonb default null,   -- NULL = el desglose de `pedido_iva`
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

  -- ── El cerrojo de la cadena, y va AQUÍ ARRIBA a propósito ──
  -- ⚠️ Lo que serializa NO lo da el `for update` del contador: ese es por serie,
  -- y dos series distintas podrían emitir a la vez, leer las dos la misma
  -- «factura anterior» y BIFURCAR la cadena. La cadena es global, su cerrojo
  -- también.
  --
  -- Y se toma ANTES de la comprobación de idempotencia, no justo antes de leer
  -- la huella anterior. Si se tomara después, dos llamadas concurrentes para el
  -- mismo pedido podrían pasar las dos por el `return v_ya` sin ver nada y
  -- chocar luego contra el índice único. El índice seguiría salvando el dato
  -- —para eso está— pero una de las dos se llevaría un error de clave duplicada
  -- en vez de la factura que ya existía. Con el cerrojo arriba, la segunda
  -- espera, ve la primera y devuelve su id, que es lo que pidió.
  --
  -- Serializa toda la emisión. A este volumen no cuesta nada, y la cadena
  -- obliga a serializar de todas formas: no se pierde nada que se tuviera.
  --
  -- El número es el del RD 1007/2023, para reconocerlo de un vistazo y no
  -- colisionar con otro préstamo del mismo recurso.
  perform pg_advisory_xact_lock(10072023);

  -- Idempotencia. Un pedido tiene como mucho una simplificada y una completa;
  -- rectificativas puede tener varias.
  if p_tipo <> 'rectificativa' then
    select id into v_ya from facturas_emitidas
    where pedido_id = p_pedido_id and tipo = p_tipo;
    if v_ya is not null then return v_ya; end if;
  end if;

  -- ⚠️ El emisor es el guardia. Sin datos fiscales no se emite nada, y NO se
  -- lanza excepción: esto corre en la ruta del dinero (el trigger de §8), y una
  -- casilla sin rellenar en Ajustes no puede tumbar una venta. Se deja sin
  -- emitir y lo canta el aviso del 303, que cuenta los pedidos sin factura.
  v_emisor := emisor_fiscal();
  if v_emisor is null then
    insert into factura_eventos (evento, detalle, actor_id)
    values ('emision_sin_emisor',
            jsonb_build_object('pedido_id', p_pedido_id, 'tipo', p_tipo),
            p_actor_id);
    return null;
  end if;

  -- Las líneas: las del pedido, salvo que se pasen otras (una rectificativa
  -- parcial pasa solo lo devuelto).
  -- ⚠️ Los precios son PVP CON IVA INCLUIDO, como en todo el catálogo. El
  -- desglose es quien separa base y cuota.
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

  -- ⚠️⚠️ EL DESGLOSE SE COPIA, NO SE CALCULA. Ver la cabecera: la 062 es el
  -- único sitio que redondea.
  v_desglose := coalesce(p_desglose, (
    select jsonb_agg(jsonb_build_object(
             'iva_pct', pv.iva_pct, 'base', pv.base, 'cuota', pv.cuota
           ) order by pv.iva_pct)
    from pedido_iva pv where pv.pedido_id = p_pedido_id
  ));

  -- Sin desglose no hay factura posible. Pasa si `pedido_iva` todavía no está
  -- (el trigger de §8 puede correr antes que el desglose de la 062). Mismo
  -- criterio que con el emisor: se deja constancia y el aviso lo recoge.
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

  -- El guardia del invariante, como el de `recalcular_iva_pedido`: una factura
  -- completa de una venta tiene que cuadrar con lo cobrado. Si la 062 hizo su
  -- trabajo esto no puede saltar nunca; que esté es lo que lo garantiza.
  if p_tipo <> 'rectificativa' and p_lineas is null
     and v_total <> v_pedido.total then
    raise exception
      'La factura del pedido % sumaría % y se cobraron %. No se emite un documento que no cuadra.',
      v_pedido.numero_pedido, v_total, v_pedido.total
      using errcode = 'P0001';
  end if;

  v_operacion  := dia_fiscal(v_pedido.devengado_el);
  -- La expedición de una simplificada automática es el día de la operación,
  -- porque se emite en el acto. Los demás tipos se expiden hoy.
  v_expedicion := case
    when p_tipo = 'simplificada' then v_operacion
    else dia_fiscal(now())
  end;

  v_serie     := serie_de_tipo(p_tipo);
  v_ejercicio := extract(year from v_expedicion)::integer;

  -- ── El número: contador con `for update`, no secuencia ──
  insert into factura_contadores (serie, ejercicio, siguiente)
  values (v_serie, v_ejercicio, 1)
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

  v_numero := v_serie || v_ejercicio::text || '/' || lpad(v_correlativo::text, 5, '0');
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

-- ── §8 · La simplificada se emite sola ───────────────────────────────────────
-- Un TRIGGER y no una llamada explícita, por el argumento de la 039 y la 062:
-- garantiza que ningún camino futuro cree una venta devengada sin su factura.
--
-- ⚠️⚠️ Y ES UN CONSTRAINT TRIGGER DIFERIDO, que es la parte que importa. El
-- trigger de devengo (068) es BEFORE INSERT en `pedidos`, y en ese momento
-- todavía NO EXISTEN ni las líneas ni `pedido_iva` — el desglose lo rellena un
-- trigger de sentencia sobre `pedido_items`, que corre después. Emitir ahí
-- daría siempre una factura sin líneas.
--
-- Diferido hasta el COMMIT, todo está en su sitio, y no hay que depender del
-- orden alfabético de los triggers de `pedido_items`, que es el tipo de
-- acoplamiento invisible que se rompe cuando alguien renombra algo.
--
-- Cubre los dos caminos de venta con una sola definición:
--   · tarjeta      — el pedido nace PROCESANDO (INSERT)
--   · transferencia— nace PENDIENTE_PAGO y pasa a PROCESANDO después (UPDATE)
create or replace function public.pedido_emite_simplificada()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_devengado timestamptz;
begin
  -- Se relee de la tabla en vez de confiar en NEW: en un trigger diferido NEW
  -- es la foto del momento del evento, y entre entonces y el commit el pedido
  -- ha podido cambiar.
  select devengado_el into v_devengado from pedidos where id = new.id;
  if v_devengado is null then return null; end if;

  perform emitir_factura(new.id, 'simplificada');
  return null;
end;
$$;

drop trigger if exists trg_pedido_simplificada on public.pedidos;
create constraint trigger trg_pedido_simplificada
  after insert or update of estado, devengado_el on public.pedidos
  deferrable initially deferred
  for each row execute function public.pedido_emite_simplificada();

-- ── §9 · Ponerse al día ──────────────────────────────────────────────────────
-- El trigger solo actúa sobre ventas nuevas. Esta función es para el arranque:
-- Jonathan rellena el emisor en Ajustes y las ventas ya devengadas se quedan
-- sin factura hasta que alguien las emita.
--
-- ⚠️ Emite en orden de DEVENGO, no de id: así los números de la serie salen en
-- el mismo orden que las ventas. Y expide con la fecha de la operación, porque
-- reconstruye una simplificada que debió emitirse en el acto.
--
-- ⚠️ No es una herramienta de uso corriente. Si hace falta a menudo significa
-- que el trigger no está emitiendo, y eso es un fallo, no una tarea.
create or replace function public.emitir_facturas_pendientes(p_actor_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_pedido   record;
  v_emitidas int := 0;
  v_saltadas int := 0;
  v_id       uuid;
begin
  if emisor_fiscal() is null then
    raise exception
      'Faltan los datos fiscales del emisor (TI → Ajustes). Sin NIF, nombre y domicilio no hay factura que emitir.'
      using errcode = 'P0001';
  end if;

  for v_pedido in
    select p.id from pedidos p
    where p.devengado_el is not null
      and not exists (
        select 1 from facturas_emitidas f
        where f.pedido_id = p.id and f.tipo = 'simplificada'
      )
    order by p.devengado_el, p.created_at
  loop
    v_id := emitir_factura(v_pedido.id, 'simplificada', p_actor_id => p_actor_id);
    if v_id is null then v_saltadas := v_saltadas + 1;
    else v_emitidas := v_emitidas + 1;
    end if;
  end loop;

  return jsonb_build_object('emitidas', v_emitidas, 'saltadas', v_saltadas);
end;
$$;

-- ── §10 · Comprobar la cadena ────────────────────────────────────────────────
-- Verifactu pide poder demostrar que nadie ha tocado nada. Recalcula cada
-- huella y comprueba que enlaza con la anterior.
create or replace function public.verificar_cadena_facturas()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_f        record;
  v_esperada text;
  v_anterior text := null;
  v_total    int := 0;
  v_rotas    text[] := '{}';
begin
  for v_f in
    select * from facturas_emitidas order by orden
  loop
    v_total := v_total + 1;

    v_esperada := factura_huella(
      v_f.emisor->>'nif', v_f.numero, v_f.fecha_expedicion,
      v_f.tipo, v_f.cuota_total, v_f.total, v_anterior
    );

    if v_f.huella <> v_esperada or coalesce(v_f.huella_anterior, '') <> coalesce(v_anterior, '') then
      v_rotas := v_rotas || v_f.numero;
    end if;

    v_anterior := v_f.huella;
  end loop;

  return jsonb_build_object(
    'facturas', v_total,
    'intacta',  cardinality(v_rotas) = 0,
    'rotas',    to_jsonb(v_rotas)
  );
end;
$$;

-- ── §11 · Permisos ───────────────────────────────────────────────────────────
-- ⚠️ LAS DOS FUENTES (059/060): la herencia de PUBLIC y el grant que Supabase
-- pone a anon y authenticated. Quitar una no cierra nada y el REVOKE no
-- protesta. Aquí importa más que en ningún sitio: `emitir_factura` quema un
-- número correlativo, y eso no se deshace.
do $$
declare
  v_fn text;
  v_fns text[] := array[
    'public.serie_de_tipo(public.factura_tipo)',
    'public.factura_huella(text,text,date,public.factura_tipo,numeric,numeric,text)',
    'public.emitir_factura(uuid,public.factura_tipo,jsonb,jsonb,jsonb,uuid,uuid,uuid)',
    'public.emitir_facturas_pendientes(uuid)',
    'public.verificar_cadena_facturas()',
    'public.factura_emitida_es_inmutable()',
    'public.pedido_emite_simplificada()'
  ];
begin
  foreach v_fn in array v_fns loop
    execute format('revoke all on function %s from public', v_fn);
    execute format('revoke all on function %s from anon', v_fn);
    execute format('revoke all on function %s from authenticated', v_fn);
  end loop;
end $$;

do $$
declare v_mal text;
begin
  select string_agg(f || ' → ' || r, E'\n') into v_mal
  from (
    select unnest(array[
      'public.serie_de_tipo(public.factura_tipo)',
      'public.factura_huella(text,text,date,public.factura_tipo,numeric,numeric,text)',
      'public.emitir_factura(uuid,public.factura_tipo,jsonb,jsonb,jsonb,uuid,uuid,uuid)',
      'public.emitir_facturas_pendientes(uuid)',
      'public.verificar_cadena_facturas()'
    ]) f
  ) fns
  cross join (select unnest(array['anon', 'authenticated']) r) roles
  where has_function_privilege(roles.r, fns.f, 'execute');

  if v_mal is not null then
    raise exception E'Funciones de facturación ejecutables por anon/authenticated:\n%', v_mal;
  end if;
end $$;
