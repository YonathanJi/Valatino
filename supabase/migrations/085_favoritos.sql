-- ═══════════════════════════════════════════════════════════════════════════════
-- 085 · FAVORITOS
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Petición del dueño, 2026-08-30:
--
--   «deseo que arriba de cada imagen de producto tener un corazoncito para que
--    cada cliente pueda guardar en favoritos y en la parte de arriba al lado de
--    iniciar seccion aparezca el mismo corazon con los que el cliente guarde, sin
--    tener que iniciar seccion, pero si desea guardarlo en su login que inicie
--    seccion y se guarde.»
--
-- Llega justo cuando la tienda ha empezado a salir en Google por consultas de
-- PRODUCTO («nucita», «caja de nucita»): entra gente que no conoce la marca y no
-- tiene forma de guardar nada sin comprarlo.
--
-- ⚠️⚠️ ESTA TABLA NO TIENE `session_id`, Y ES LA DECISIÓN DE DISEÑO, NO UN OLVIDO.
--
-- Lo natural era copiar el carrito, que resuelve «invitado + fusión al entrar» con
-- una cookie de sesión (`carritos.session_id`) y `fusionarCarrito`. **Aquí el
-- invitado no toca la base:** sus favoritos viven en el `localStorage` del
-- navegador y solo suben cuando inicia sesión. Tres motivos, los tres medidos:
--
--   1. El carrito NECESITA servidor —reserva de stock, precio congelado, checkout—.
--      Favoritos es una lista de ids y no necesita nada de eso.
--   2. **La API duerme.** El 28/08 se midieron 42,5 s de arranque en frío. El
--      carrito lo aguanta porque añadir es un acto deliberado con su spinner; un
--      corazón es un microgesto y 42 segundos es estar roto. Y como el catálogo se
--      sirve de caché ISR, un visitante puede llegar al corazón sin haber
--      despertado la API.
--   3. La cookie de invitado **tampoco cruza dispositivos**: vive en ESE navegador,
--      igual que `localStorage`. Hacerlo en servidor no compraría durabilidad
--      ninguna y costaría toda la latencia.
--
-- ⚠️ ORDEN DE DESPLIEGUE: **esta migración → API → web.** Es inerte por sí sola —no
-- hay disparadores ni funciones, solo una tabla que nadie usa todavía—, así que no
-- puede romper nada al aplicarse. La API es quien empieza a escribir en ella y la
-- web quien la llama. Al revés dejaría la fusión perdiendo favoritos en silencio.
-- (Ver `0bbe0f6` y la cabecera de la 084: aquí el orden ya se ha escrito al revés
-- dos veces.)

-- ═══════════════════════════════════════════════════════════════════════════════
-- §1 · LA TABLA
-- ═══════════════════════════════════════════════════════════════════════════════

create table if not exists public.favoritos (
  id          uuid primary key default gen_random_uuid(),

  -- ⚠️ `on delete cascade`: si se borra la cuenta, sus favoritos se van con ella.
  -- No son un documento comercial —a diferencia de un pedido, que se conserva por
  -- obligación fiscal—: son una preferencia y no sobreviven a su dueño.
  user_id     uuid not null references auth.users(id) on delete cascade,

  -- ⚠️ También en cascada. Hoy los productos se DESACTIVAN en vez de borrarse, así
  -- que en la práctica no salta; está para que el día que alguien borre uno de
  -- verdad no queden filas apuntando a la nada.
  producto_id uuid not null references public.productos(id) on delete cascade,

  created_at  timestamptz not null default now(),

  -- ⭐⭐ ESTE UNIQUE ES LO QUE HACE QUE GUARDAR SEA IDEMPOTENTE SIN LEER ANTES.
  -- Con él, la API hace `upsert` y da igual que lleguen dos toques seguidos desde
  -- un móvil o que la fusión al iniciar sesión mande algo que ya estaba. Sin él
  -- habría que consultar-y-luego-insertar, que es una carrera — la misma que costó
  -- el correo duplicado de los reembolsos el 26/08: decidir leyendo en vez de
  -- dejar que lo decida la base.
  constraint favoritos_uno_por_producto unique (user_id, producto_id)
);

-- Para pintar la página: «dame los favoritos de este usuario, los últimos arriba».
create index if not exists favoritos_user_id_idx
  on public.favoritos (user_id, created_at desc);

comment on table public.favoritos is
  'Lista de deseos de un cliente CON CUENTA. Los favoritos de invitado viven en el localStorage del navegador y solo llegan aquí al iniciar sesión (ver POST /favoritos/fusionar). Por eso no hay session_id.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- §2 · RLS
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- ⚠️ Se sigue el modelo de la 011 (`011_fix_rls_reservas_carritos_inseguras.sql`),
-- que existió para cerrar policies `USING (true)`. Aquí sale más simple que en el
-- carrito justamente por no tener `session_id`: no hace falta mirar el claim de la
-- sesión, basta el dueño. **Una policy por comando, ninguna con `true`.**

alter table public.favoritos enable row level security;

drop policy if exists favoritos_select_own on public.favoritos;
create policy "favoritos_select_own" on public.favoritos
  for select using (user_id = auth.uid());

drop policy if exists favoritos_insert_own on public.favoritos;
create policy "favoritos_insert_own" on public.favoritos
  for insert with check (user_id = auth.uid());

drop policy if exists favoritos_update_own on public.favoritos;
create policy "favoritos_update_own" on public.favoritos
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists favoritos_delete_own on public.favoritos;
create policy "favoritos_delete_own" on public.favoritos
  for delete using (user_id = auth.uid());

-- ═══════════════════════════════════════════════════════════════════════════════
-- §3 · PERMISOS
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- ⚠️⚠️ A `anon` SE LE QUITA TODO, y esto se aparta a propósito de las demás tablas.
--
-- Supabase concede por defecto a `anon` y `authenticated` sobre cada tabla nueva, y
-- deja que la RLS haga el trabajo. Con la policy de arriba un `anon` no casaría
-- ninguna fila igualmente, porque `auth.uid()` es null. Pero el diseño dice que **un
-- invitado NO TOCA ESTA TABLA NUNCA**, y una regla que solo vive en un comentario no
-- es una regla: se hace cumplir.
--
-- Es la lección del 25/08, que costó un agujero en producción: al aplicar la 084
-- una firma nueva heredó EXECUTE para `anon` y estuvo invocable sin sesión. Lo que
-- se aprendió es que **lo peligroso es quién SOBRA**, y que los permisos por defecto
-- de Supabase hay que mirarlos, no suponerlos.
revoke all on public.favoritos from anon;

-- El cliente con sesión sí, y la RLS lo deja en lo suyo. `service_role` (la API)
-- conserva lo que ya tiene por defecto.
grant select, insert, update, delete on public.favoritos to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- §4 · GUARDAS — que esta migración se comprueba a sí misma
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- ⚠️ Van aquí y no en un test aparte porque lo que comprueban es el estado que deja
-- ESTA migración. Si algo no quedó, se levanta ahora y no dentro de una semana.

do $$
declare
  v_policies int;
  v_abiertas int;
begin
  -- 1. La tabla existe y tiene RLS puesta.
  if not exists (
    select 1 from pg_class c
    where c.relnamespace = 'public'::regnamespace
      and c.relname = 'favoritos'
      and c.relrowsecurity
  ) then
    raise exception 'La 085 no dejó la tabla favoritos con RLS activa: cualquiera con la clave anónima podría leer las listas de todos los clientes.';
  end if;

  -- 2. Las cuatro policies, una por comando.
  select count(*) into v_policies
  from pg_policy where polrelid = 'public.favoritos'::regclass;

  if v_policies <> 4 then
    raise exception 'La 085 esperaba 4 policies en favoritos y hay %. Falta alguna operación sin cubrir, y una tabla con RLS activa y sin policy para un comando lo NIEGA en silencio.', v_policies;
  end if;

  -- 3. ⚠️ Ninguna abierta. Es lo que la 011 vino a cerrar en otras tablas, y es el
  --    fallo que no se ve: una policy `true` pasa todos los tests funcionales.
  select count(*) into v_abiertas
  from pg_policy p
  where p.polrelid = 'public.favoritos'::regclass
    and (
      coalesce(pg_get_expr(p.polqual, p.polrelid), '') in ('true')
      or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') in ('true')
    );

  if v_abiertas > 0 then
    raise exception 'La 085 dejó % policy(s) con USING/WITH CHECK true en favoritos: eso es no tener RLS con más pasos.', v_abiertas;
  end if;

  -- 4. El unique, que es de lo que depende la idempotencia de guardar y de fusionar.
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.favoritos'::regclass
      and conname = 'favoritos_uno_por_producto'
      and contype = 'u'
  ) then
    raise exception 'La 085 no dejó el unique (user_id, producto_id): guardar dos veces duplicaría, y la fusión al iniciar sesión tendría que leer antes de escribir — que es la carrera que costó el correo duplicado del 26/08.';
  end if;

  -- 5. ⚠️⚠️ Que a `anon` NO le quede nada. Se comprueba por AUSENCIA del rol y no
  --    por presencia de los otros: lo peligroso es quién sobra.
  if exists (
    select 1
    from pg_class c
    cross join lateral aclexplode(c.relacl) a
    join pg_roles r on r.oid = a.grantee
    where c.relnamespace = 'public'::regnamespace
      and c.relname = 'favoritos'
      and r.rolname = 'anon'
  ) then
    raise exception 'La 085 ha dejado permisos a anon sobre favoritos. Supabase los concede por defecto a cada tabla nueva y hay que quitarlos a mano: es lo mismo que abrió el agujero de la 084 el 25/08.';
  end if;
end $$;
