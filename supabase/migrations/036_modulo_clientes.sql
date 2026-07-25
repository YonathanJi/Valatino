-- 036: Módulo de Clientes en el backoffice.
--
-- Ver, editar y eliminar clientes de la tienda. Dos particularidades del
-- negocio que la RPC resuelve:
--
--   1. `profiles` está casi vacío: el registro es por OTP y solo captura el
--      email. El nombre y el documento reales del cliente viven en el pedido
--      (`envio_nombre`, `documento_cliente`), así que se toman de ahí —del más
--      reciente— cuando el perfil no los tiene. Sin esto el listado saldría
--      con emails y nada más.
--   2. Hay clientes sin cuenta: quien compró como invitado y nunca se registró.
--      Son clientes del negocio igual, así que aparecen agrupados por email y
--      marcados con `tiene_cuenta = false`.
--
-- La agregación va en SQL a propósito: hacerla en Node obligaría a traerse
-- todos los pedidos y PostgREST corta en 1000 filas en silencio.

alter table public.staff_modulos
  drop constraint staff_modulos_modulo_check;

alter table public.staff_modulos
  add constraint staff_modulos_modulo_check
  check (modulo in (
    'pedidos', 'catalogo', 'inventario', 'dashboard', 'compras',
    'gestion_humana', 'ti', 'clientes'
  ));

-- ============================================================
-- listar_clientes: una fila por cliente, con sus métricas
-- ============================================================

create or replace function public.listar_clientes()
returns table (
  user_id       uuid,
  email         text,
  nombre        text,
  telefono      text,
  documento     text,
  tiene_cuenta  boolean,
  cliente_desde timestamptz,
  pedidos       int,
  total_gastado numeric,
  ultimo_pedido timestamptz
)
language sql
security definer
set search_path = public, pg_temp
as $$
  with
  -- Métricas de los pedidos ya vinculados a una cuenta
  por_cuenta as (
    select
      p.user_id,
      count(*)::int as pedidos,
      coalesce(sum(p.total) filter (
        where p.estado in ('PROCESANDO', 'ENVIADO', 'ENTREGADO')
      ), 0) as total_gastado,
      max(p.created_at) as ultimo_pedido,
      -- Datos del pedido más reciente que los tenga: suplen el perfil vacío
      (array_agg(p.envio_nombre order by p.created_at desc)
        filter (where p.envio_nombre is not null))[1] as nombre_pedido,
      (array_agg(p.documento_cliente order by p.created_at desc)
        filter (where p.documento_cliente is not null))[1] as documento_pedido
    from pedidos p
    where p.user_id is not null
    group by p.user_id
  ),
  -- Clientes con cuenta: los que tienen rol 'cliente'
  con_cuenta as (
    select
      u.id as user_id,
      lower(coalesce(pr.email, u.email))::text as email,
      coalesce(pr.nombre, pc.nombre_pedido)::text as nombre,
      pr.telefono::text as telefono,
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
  ),
  -- Clientes sin cuenta: compraron como invitados y nunca se registraron.
  -- Se agrupan por email porque es lo único que los identifica.
  sin_cuenta as (
    select
      null::uuid as user_id,
      lower(p.email_cliente)::text as email,
      (array_agg(p.envio_nombre order by p.created_at desc)
        filter (where p.envio_nombre is not null))[1]::text as nombre,
      null::text as telefono,
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
$$;

revoke execute on function public.listar_clientes() from public, anon, authenticated;
