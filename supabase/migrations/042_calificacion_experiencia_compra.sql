-- ============================================================
-- 042 — Calificación de la experiencia de compra
--
-- Dos preguntas al terminar el pago: cuánto esfuerzo costó comprar (CES) y qué
-- nota le pone (CSAT). Son métricas DISTINTAS a propósito: se puede quedar muy
-- satisfecho con una compra que costó trabajo, y al revés.
--
-- ⚠️ NO se toca `confirmar_venta`. El token del pedido es un DEFAULT de columna,
-- así que no hay que volver a abrir la función que corre dentro de la
-- transacción de un pago ya cobrado — cada vez que se abre existe el riesgo de
-- convertir un cobro en un pedido que no existe.
-- ============================================================

-- ── El token: cómo califica quien no tiene cuenta ───────────────────────────
-- El registro es por OTP y se compra como invitado, así que la calificación no
-- puede exigir sesión. Se ata al pedido con un token opaco que solo conoce quien
-- pagó, entregado por la misma puerta que ya acredita eso:
-- `GET /pedidos/por-referencia/:ref`.
alter table pedidos
  add column if not exists token_calificacion uuid not null default gen_random_uuid();

comment on column pedidos.token_calificacion is
  'Llave para calificar el pedido sin sesión. Se entrega a quien acredita haber pagado (conoce la referencia de pago).';

-- Búsqueda por token en la ruta pública: sin índice sería un seq scan por cada
-- visita a la página de confirmación.
create unique index if not exists pedidos_token_calificacion_idx
  on pedidos (token_calificacion);

-- ── La calificación ────────────────────────────────────────────────────────
create table if not exists pedido_calificaciones (
  -- PK = pedido_id: «una calificación por pedido» sale gratis, sin lógica que
  -- mantener ni carrera que resolver.
  pedido_id    uuid primary key references pedidos (id) on delete cascade,

  -- 1 fácil · 2 regular · 3 difícil (CES). Tres niveles porque la pregunta es
  -- «¿fácil o difícil?», y con forma distinta a la de satisfacción para que
  -- nadie marque el mismo número dos veces sin pensarlo.
  esfuerzo     smallint not null check (esfuerzo between 1 and 3),

  -- 1 a 5 (CSAT).
  satisfaccion smallint not null check (satisfaccion between 1 and 5),

  -- Texto libre del cliente. Es donde está lo accionable; las medias solo dicen
  -- si vas bien o mal.
  comentario   text check (comentario is null or length(comentario) <= 2000),

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table pedido_calificaciones is
  'Opinión del cliente sobre el proceso de compra. Opcional: la mayoría de los pedidos no la tendrán, y por eso la tasa de respuesta se muestra siempre junto a las medias.';

-- RLS activa y CERO policies: escribe solo la API con el token, igual que
-- `direcciones_envio` desde la 035. Un cliente no llega aquí por PostgREST.
alter table pedido_calificaciones enable row level security;

-- Para ordenar por fecha en el panel y para la ventana de corrección.
create index if not exists pedido_calificaciones_created_at_idx
  on pedido_calificaciones (created_at desc);

-- ── Resumen para el panel ──────────────────────────────────────────────────
-- En SQL y no en Node: la tasa de respuesta necesita contar TODOS los pedidos
-- pagados del periodo, y traérselos para contarlos en memoria chocaría con el
-- límite de 1000 filas de PostgREST sin avisar (la misma razón por la que
-- `listar_clientes` es una RPC).
create or replace function public.resumen_calificaciones(p_dias int default 90)
returns table(
  respuestas          int,
  pedidos_calificables int,
  esfuerzo_medio      numeric,
  satisfaccion_medio  numeric,
  faciles             int,
  regulares           int,
  dificiles           int,
  detractores         int
)
language sql
security definer
set search_path to 'public', 'pg_temp'
as $function$
  with ventana as (
    select (now() - make_interval(days => p_dias)) as desde
  ),
  -- Denominador: pedidos que PUDIERON calificarse, no todos los pedidos. Un
  -- pedido pendiente de pago nunca llegó a la página de confirmación.
  calificables as (
    select p.id
    from pedidos p, ventana v
    where p.created_at >= v.desde
      and p.estado in ('PROCESANDO', 'ENVIADO', 'ENTREGADO', 'REEMBOLSADO')
  ),
  respuestas as (
    select c.*
    from pedido_calificaciones c
    join calificables k on k.id = c.pedido_id
  )
  select
    (select count(*) from respuestas)::int,
    (select count(*) from calificables)::int,
    (select round(avg(esfuerzo), 2) from respuestas),
    (select round(avg(satisfaccion), 2) from respuestas),
    (select count(*) from respuestas where esfuerzo = 1)::int,
    (select count(*) from respuestas where esfuerzo = 2)::int,
    (select count(*) from respuestas where esfuerzo = 3)::int,
    -- Satisfacción 1 o 2: los que hay que leer primero.
    (select count(*) from respuestas where satisfaccion <= 2)::int;
$function$;

comment on function public.resumen_calificaciones is
  'Medias y reparto de las calificaciones de los últimos N días, con el denominador de pedidos calificables para poder mostrar la tasa de respuesta. Una media sin su tasa de respuesta miente.';
