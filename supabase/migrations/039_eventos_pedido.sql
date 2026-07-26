-- 039: Historial de todo lo que le pasa a un pedido, con quién lo hizo.
--
-- `pedidos` guarda el estado y el `updated_at`, pero no quién lo movió. Con una
-- sola cuenta daba igual; con varios asesores y directores entrando —y con el
-- reembolso siendo ya una acción que mueve dinero de verdad— hace falta poder
-- responder «¿quién pasó este pedido a enviado y cuándo?» sin entrar a la base.
--
-- POR QUÉ UN TRIGGER Y NO REGISTRARLO DESDE LA API
-- El estado de un pedido se cambia hoy por cuatro caminos, y DOS ocurren dentro
-- de SQL, fuera del alcance de cualquier código en Node:
--   1. PATCH /admin/pedidos/:id/estado   (una persona, desde el panel)
--   2. El webhook, por referencia de pago (el sistema)
--   3. La RPC confirmar_venta             (el sistema, al cobrar el checkout)
--   4. La RPC reembolsar_pedido_total     (una persona, al devolver el dinero)
-- Registrar el historial desde la API dejaría fuera los dos últimos, que son
-- justo los que más cuesta explicar después. Con el trigger no se escapa
-- ninguno, ni hoy ni cuando alguien añada un quinto camino.

-- ---------------------------------------------------------------------------
-- 1. La tabla
-- ---------------------------------------------------------------------------

create table if not exists public.pedido_eventos (
  id              uuid primary key default gen_random_uuid(),
  pedido_id       uuid not null references public.pedidos (id) on delete cascade,
  tipo            text not null check (tipo in ('estado', 'pago', 'reembolso', 'email')),

  -- Quién lo hizo. NULL significa que lo hizo el sistema, no que se perdiera:
  -- el cobro del checkout y los avisos de Stripe no tienen persona detrás.
  actor_user_id   uuid references auth.users (id) on delete set null,
  -- Copia del nombre y el correo en el momento del hecho, no una referencia.
  -- Si mañana se da de baja a un asesor y se borra su cuenta, el historial
  -- tiene que seguir diciendo que fue él. Mismo criterio que pedidos.envio_*.
  actor_nombre    text,
  actor_email     text,

  origen          text not null default 'sistema'
                    check (origen in ('panel', 'checkout', 'webhook', 'sistema')),

  -- Según el tipo. Un evento de estado no tiene importe y uno de pago no tiene
  -- estados; se deja en columnas y no en un jsonb porque son cuatro campos
  -- fijos y así la línea de tiempo se ordena y se lee en SQL.
  estado_anterior public.pedido_estado,
  estado_nuevo    public.pedido_estado,
  importe         numeric(10,2),
  detalle         text,

  -- clock_timestamp() y no now(): now() devuelve la hora de INICIO de la
  -- transacción, así que dos eventos de la misma transacción empatarían y el
  -- orden de la línea de tiempo lo acabaría decidiendo un uuid aleatorio.
  created_at      timestamptz not null default clock_timestamp()
);

create index if not exists idx_pedido_eventos_pedido
  on public.pedido_eventos (pedido_id, created_at);

alter table public.pedido_eventos enable row level security;
-- Sin policies: solo service_role. El historial se sirve por la API, que ya
-- comprueba el nivel en el módulo `pedidos`. El navegador no lo lee directo.

comment on table public.pedido_eventos is
  'Línea de tiempo de un pedido: pagos, cambios de estado, correos y reembolsos, con su autor.';

-- ---------------------------------------------------------------------------
-- 2. El trigger que no se puede esquivar
-- ---------------------------------------------------------------------------

-- El actor viaja en una variable DE TRANSACCIÓN que fijan las RPC que sí saben
-- quién está actuando. Un UPDATE suelto no la trae, y entonces el evento queda
-- como 'sistema' — que es la verdad para el webhook, no un hueco.
create or replace function public.registrar_cambio_estado_pedido()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_origen text;
  v_nombre text;
  v_email text;
  v_anterior public.pedido_estado;
begin
  -- El tercer parámetro `true` de current_setting devuelve NULL en vez de
  -- reventar cuando la variable no está definida.
  v_actor := nullif(current_setting('app.actor_id', true), '')::uuid;

  if tg_op = 'INSERT' then
    v_anterior := null;
    -- El único camino que crea pedidos es la RPC del checkout al cobrar.
    v_origen := coalesce(nullif(current_setting('app.origen', true), ''), 'checkout');
  else
    v_anterior := old.estado;
    v_origen := coalesce(nullif(current_setting('app.origen', true), ''), 'sistema');
  end if;

  if v_actor is not null then
    select p.nombre, p.email into v_nombre, v_email
    from public.profiles p
    where p.id = v_actor;
  end if;

  insert into public.pedido_eventos (
    pedido_id, tipo, actor_user_id, actor_nombre, actor_email, origen,
    estado_anterior, estado_nuevo
  ) values (
    new.id, 'estado', v_actor, v_nombre, v_email, v_origen,
    v_anterior, new.estado
  );

  return new;
end;
$$;

drop trigger if exists trg_pedido_estado_historial on public.pedidos;
drop trigger if exists trg_pedido_creado_historial on public.pedidos;

-- Alta del pedido. Hace falta un trigger propio porque el checkout NO actualiza
-- el estado: inserta el pedido ya en PROCESANDO (ver confirmar_venta, migración
-- 033). Sin esto la línea de tiempo empezaría en blanco y el pedido parecería
-- haber aparecido de la nada.
create trigger trg_pedido_creado_historial
  after insert on public.pedidos
  for each row
  execute function public.registrar_cambio_estado_pedido();

-- `when (old.estado is distinct from new.estado)` evita registrar los updates
-- que solo tocan otras columnas: sin eso, cada reintento del webhook dejaría
-- una línea idéntica en el historial.
create trigger trg_pedido_estado_historial
  after update of estado on public.pedidos
  for each row
  when (old.estado is distinct from new.estado)
  execute function public.registrar_cambio_estado_pedido();

-- ---------------------------------------------------------------------------
-- 3. Las dos RPC que sí saben quién actúa
-- ---------------------------------------------------------------------------

-- Sustituye al UPDATE suelto del panel. Además de dejar constancia del autor,
-- el cambio de estado y su registro pasan a ocurrir en la misma transacción.
--
-- Aquí NO se comprueba si la transición está permitida: eso lo decide
-- transicionesPermitidas en @valatino/types, compartido entre la API y el
-- panel, para que lo que se ofrece y lo que se autoriza no puedan divergir.
create or replace function public.cambiar_estado_pedido(
  p_pedido_id uuid,
  p_estado public.pedido_estado,
  p_actor_id uuid default null
)
returns public.pedidos
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pedido public.pedidos;
begin
  -- Transaction-local (`true`): se descarta al terminar, así que no se filtra
  -- a la siguiente petición que reutilice la conexión del pool.
  perform set_config('app.actor_id', coalesce(p_actor_id::text, ''), true);
  perform set_config('app.origen', 'panel', true);

  update public.pedidos
  set estado = p_estado,
      updated_at = now()
  where id = p_pedido_id
  returning * into v_pedido;

  -- Se limpia en cuanto el update ha pasado: set_config dura toda la
  -- transacción, no solo la sentencia siguiente. Sin esto, cualquier otro
  -- cambio de estado del mismo pedido en la misma transacción heredaría este
  -- autor y el historial atribuiría a una persona algo que hizo el sistema.
  perform set_config('app.actor_id', '', true);
  perform set_config('app.origen', '', true);

  if v_pedido.id is null then
    raise exception 'Pedido % no existe', p_pedido_id using errcode = 'P0002';
  end if;

  return v_pedido;
end;
$$;

revoke execute on function public.cambiar_estado_pedido(uuid, public.pedido_estado, uuid)
  from public, anon, authenticated;

-- El reembolso total gana el autor. El parámetro va al final y con valor por
-- defecto para que la llamada de un solo argumento —la que hace la API actual—
-- siga resolviendo mientras Render termina de desplegar.
--
-- Hay que SOLTAR la versión de un argumento antes de crear esta: `create or
-- replace` distingue las funciones por su lista de parámetros, así que dejaría
-- las dos vivas y una llamada con un solo argumento sería ambigua.
drop function if exists public.reembolsar_pedido_total(uuid);

create or replace function public.reembolsar_pedido_total(
  p_pedido_id uuid,
  p_actor_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_estado public.pedido_estado;
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

  update public.pedidos
  set estado = 'REEMBOLSADO',
      updated_at = now()
  where id = p_pedido_id;

  -- Ver el porqué en cambiar_estado_pedido: la variable dura toda la
  -- transacción y arrastraría el autor a lo que venga después.
  perform set_config('app.actor_id', '', true);
  perform set_config('app.origen', '', true);

  -- Devuelve las unidades a la venta. `stock_reservado` no se toca: la reserva
  -- del checkout ya se consumió al confirmar la venta.
  update public.productos p
  set stock_disponible = p.stock_disponible + i.cantidad,
      updated_at = now()
  from public.pedido_items i
  where i.pedido_id = p_pedido_id
    and p.id = i.producto_id;

  return true;
end;
$$;

revoke execute on function public.reembolsar_pedido_total(uuid, uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. El resto de eventos, que ningún trigger sobre `pedidos` puede ver
-- ---------------------------------------------------------------------------

-- Pagos, reembolsos y correos los registra la API, que es quien sabe que han
-- ocurrido. Va por RPC y no por insert directo para que el nombre del autor se
-- resuelva siempre igual —desde `profiles`— y no dependa de que cada llamada se
-- acuerde de mandarlo.
create or replace function public.registrar_evento_pedido(
  p_pedido_id uuid,
  p_tipo text,
  p_detalle text default null,
  p_importe numeric default null,
  p_actor_id uuid default null,
  p_origen text default 'sistema'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_nombre text;
  v_email text;
  v_id uuid;
begin
  if p_actor_id is not null then
    select p.nombre, p.email into v_nombre, v_email
    from public.profiles p
    where p.id = p_actor_id;
  end if;

  insert into public.pedido_eventos (
    pedido_id, tipo, actor_user_id, actor_nombre, actor_email, origen, importe, detalle
  ) values (
    p_pedido_id, p_tipo, p_actor_id, v_nombre, v_email, p_origen, p_importe, p_detalle
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.registrar_evento_pedido(uuid, text, text, numeric, uuid, text)
  from public, anon, authenticated;
