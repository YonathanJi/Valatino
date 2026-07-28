-- ============================================================
-- 043 — El teléfono que el cliente actualiza llega al panel
--
-- Reportado por Jonathan: el cliente cambia su teléfono desde su perfil de la
-- tienda y el equipo sigue viendo el viejo en el módulo Clientes.
--
-- Por qué pasaba: `listar_clientes` leía el teléfono de `profiles` y, si estaba
-- vacío, del SNAPSHOT del pedido (`pedidos.envio_telefono`). Pero el cliente no
-- escribe en ninguno de los dos:
--   · `profiles.telefono` solo lo rellena el personal a mano desde la ficha
--     (no hay ninguna ruta pública que lo toque).
--   · `pedidos.envio_telefono` es una COPIA congelada a propósito (038/040): dice
--     a qué número se avisó para AQUELLA entrega y no debe cambiar nunca.
-- Lo único que el cliente puede editar es `direcciones_envio.telefono` — que la
-- RPC no miraba. Así que su actualización no tenía por dónde llegar: el dato
-- existía en la base, pero el panel no lo leía.
--
-- La regla que se adopta: **gana el teléfono que se tocó más tarde**, lo tocara
-- el cliente en su dirección o el equipo en la ficha. Una prioridad fija rompe
-- uno de los dos lados: si manda `profiles`, el cliente cambia su número y el
-- equipo no se entera (el fallo de hoy); si manda la dirección, el asesor
-- corrige un teléfono, guarda y sigue viendo el de antes (el mismo fallo del
-- revés, y encima con el botón de guardar diciendo que sí).
--
-- El snapshot del pedido se queda como ÚLTIMO recurso, que es su papel: para
-- el invitado sin cuenta es el único teléfono que hay.
--
-- ⚠️ Nota sobre qué teléfono es este: el de la dirección es el «de contacto para
-- la entrega», así que en un envío a un tercero podría no ser el del cliente.
-- Es exactamente la misma clase de dato que ya se mostraba desde
-- `pedidos.envio_telefono` (que se copia de ahí), así que esto no empeora nada:
-- muestra el mismo dato, pero al día.
-- ============================================================

-- ── 0. Marca de tiempo que no empata ───────────────────────────────────────
-- `set_updated_at()` (la de la 002, que usa `pedidos`) pone `now()`, y `now()`
-- devuelve la hora de INICIO de la transacción: si en una misma transacción se
-- tocan el perfil y la dirección, las dos quedan con el MISMO instante, la
-- comparación de abajo empata y el desempate se lo lleva quien esté en el `else`.
-- La prueba en seco de esta migración lo cazó: el cambio del cliente, hecho
-- después, perdía contra el del panel.
--
-- Mismo problema y misma solución que en la corrección de la 039 (los eventos
-- del pedido empataban y el orden lo decidía un UUID al azar): `clock_timestamp()`
-- avanza dentro de la transacción. No se toca `set_updated_at`, que la usan
-- otras tablas.
create or replace function public.set_updated_at_preciso()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  new.updated_at = clock_timestamp();
  return new;
end;
$function$;

comment on function public.set_updated_at_preciso() is
  'updated_at con clock_timestamp(): dos escrituras en la misma transacción no empatan. Para tablas cuya recencia se compara entre sí.';

-- ── 1. direcciones_envio.updated_at ────────────────────────────────────────
-- Hace falta para saber cuál de los dos teléfonos es el más reciente. Era la
-- única tabla editable sin esta columna.
alter table direcciones_envio add column if not exists updated_at timestamptz;

-- Backfill al alta de la fila, NO a now(): las direcciones de antes de esta
-- migración no se han tocado hoy, y fingirlo las haría ganar a cualquier
-- teléfono que el personal hubiera escrito a mano.
update direcciones_envio set updated_at = created_at where updated_at is null;

alter table direcciones_envio
  alter column updated_at set default now(),
  alter column updated_at set not null;

comment on column direcciones_envio.updated_at is
  'Última modificación. La usa listar_clientes para decidir si el teléfono más fresco es este o el de profiles.';

-- El trigger se crea DESPUÉS del backfill: si no, el update de arriba se
-- pisaría a sí mismo con now().
drop trigger if exists trg_direcciones_updated_at on direcciones_envio;
create trigger trg_direcciones_updated_at
  before update on direcciones_envio
  for each row execute function set_updated_at_preciso();

-- ── 2. profiles.updated_at por trigger, no a mano ──────────────────────────
-- Hoy lo escribe la API en el propio update (`clientes.service.ts`). Eso
-- funciona, pero deja la regla de arriba a merced de que la siguiente ruta que
-- edite un perfil se acuerde de ponerlo — y si se olvida, el fallo sería
-- silencioso: el teléfono correcto perdería la comparación sin que nada avise.
drop trigger if exists trg_profiles_updated_at on profiles;
create trigger trg_profiles_updated_at
  before update on profiles
  for each row execute function set_updated_at_preciso();

-- ── 3. listar_clientes: el teléfono, al día ────────────────────────────────
-- Firma idéntica a la de la 040 (la API no cambia). Solo cambia de dónde sale
-- el teléfono; nombre, documento y métricas se quedan como estaban.
create or replace function public.listar_clientes()
returns table(
  user_id uuid,
  email text,
  nombre text,
  telefono text,
  documento text,
  tiene_cuenta boolean,
  cliente_desde timestamptz,
  pedidos integer,
  total_gastado numeric,
  ultimo_pedido timestamptz
)
language sql
security definer
set search_path to 'public', 'pg_temp'
as $function$
  with
  por_cuenta as (
    select
      p.user_id,
      count(*)::int as pedidos,
      coalesce(sum(p.total) filter (
        where p.estado in ('PROCESANDO', 'ENVIADO', 'ENTREGADO')
      ), 0) as total_gastado,
      max(p.created_at) as ultimo_pedido,
      (array_agg(p.envio_nombre order by p.created_at desc)
        filter (where p.envio_nombre is not null))[1] as nombre_pedido,
      (array_agg(p.documento_cliente order by p.created_at desc)
        filter (where p.documento_cliente is not null))[1] as documento_pedido,
      (array_agg(p.envio_telefono order by p.created_at desc)
        filter (where p.envio_telefono is not null))[1] as telefono_pedido
    from pedidos p
    where p.user_id is not null
    group by p.user_id
  ),
  -- Un solo teléfono por cliente: el de su dirección predeterminada y, entre
  -- varias, el de la última que tocó. Las direcciones sin teléfono (anteriores
  -- a la 040) no cuentan: no tienen nada que aportar.
  contacto_direccion as (
    select distinct on (d.user_id)
      d.user_id,
      d.telefono,
      d.updated_at
    from direcciones_envio d
    where d.telefono is not null
      and d.telefono <> ''
      and d.user_id is not null
    order by d.user_id, d.es_predeterminada desc, d.updated_at desc
  ),
  con_cuenta as (
    select
      u.id as user_id,
      lower(coalesce(pr.email, u.email))::text as email,
      coalesce(pr.nombre, pc.nombre_pedido)::text as nombre,
      -- El más reciente de los dos que se pueden editar; si no hay ninguno,
      -- el del último pedido.
      coalesce(
        case
          when pr.telefono is null or pr.telefono = '' then cd.telefono
          when cd.telefono is null then pr.telefono
          when coalesce(cd.updated_at, '-infinity'::timestamptz)
             > coalesce(pr.updated_at, '-infinity'::timestamptz) then cd.telefono
          else pr.telefono
        end,
        pc.telefono_pedido
      )::text as telefono,
      coalesce(pr.documento, pc.documento_pedido)::text as documento,
      true as tiene_cuenta,
      u.created_at as cliente_desde,
      coalesce(pc.pedidos, 0) as pedidos,
      coalesce(pc.total_gastado, 0) as total_gastado,
      pc.ultimo_pedido
    from auth.users u
    join user_roles ur on ur.user_id = u.id
    join roles r on r.id = ur.role_id and r.nombre = 'cliente'
    left join profiles pr on pr.id = u.id
    left join por_cuenta pc on pc.user_id = u.id
    left join contacto_direccion cd on cd.user_id = u.id
  ),
  -- Sin cuenta no hay direcciones guardadas (`direcciones_envio.user_id` es
  -- obligatorio), así que aquí el snapshot del pedido sigue siendo la única
  -- fuente posible.
  sin_cuenta as (
    select
      null::uuid as user_id,
      lower(p.email_cliente)::text as email,
      (array_agg(p.envio_nombre order by p.created_at desc)
        filter (where p.envio_nombre is not null))[1]::text as nombre,
      (array_agg(p.envio_telefono order by p.created_at desc)
        filter (where p.envio_telefono is not null))[1]::text as telefono,
      (array_agg(p.documento_cliente order by p.created_at desc)
        filter (where p.documento_cliente is not null))[1]::text as documento,
      false as tiene_cuenta,
      min(p.created_at) as cliente_desde,
      count(*)::int as pedidos,
      coalesce(sum(p.total) filter (
        where p.estado in ('PROCESANDO', 'ENVIADO', 'ENTREGADO')
      ), 0) as total_gastado,
      max(p.created_at) as ultimo_pedido
    from pedidos p
    where p.user_id is null
      and p.email_cliente is not null
    group by lower(p.email_cliente)
  )
  select * from con_cuenta
  union all
  select * from sin_cuenta
  order by ultimo_pedido desc nulls last, cliente_desde desc;
$function$;
