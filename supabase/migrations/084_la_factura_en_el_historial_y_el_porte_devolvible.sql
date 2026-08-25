-- ═══════════════════════════════════════════════════════════════════════════════
-- 084 · LA FACTURA EN EL HISTORIAL, Y EL PORTE DEVOLVIBLE APARTE
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Petición del dueño, 2026-08-25, dos cosas de la misma sesión:
--
--   «cuando se emite la factura completa no queda en el historial del pedido,
--    diciendo que se emitió y quién la emitió»
--   «en los reembolsos no aparece la opción de reembolsar el envío. me gustaría
--    tenerlo.»
--
-- Son independientes y van juntas porque las dos son de esquema y las dos tienen
-- que estar ANTES de que la API las use.
--
-- ⚠️⚠️ EL ORDEN, Y ESTA CABECERA LO DIJO AL REVÉS. Hay TRES pasos y este es el bueno:
--
--     1º  LA WEB (Vercel)
--     2º  ESTA MIGRACIÓN
--     3º  LA API (Render)
--
-- ⚠️⚠️ LA CORRECCIÓN, QUE HAY QUE DEJAR ESCRITA. Antes esto decía «migración → web →
--   API», y era de cuando el apunte de la factura lo pensaba hacer la API. Al pasarlo
--   al DISPARADOR del §3, **la migración dejó de ser inerte**: en el momento en que se
--   aplica, la siguiente factura que se emita YA escribe un evento `factura`. Así que
--   la migración es ahora el paso que ROMPE la web vieja, no el que la espera.
--
--   `HistorialPedido.tsx` resolvía el icono con `ICONO[e.tipo]` y pintaba `<Icono />`.
--   Un tipo que no conoce da `undefined` y React lanza «Element type is invalid»: no se
--   rompe la fila, **se rompe la ficha entera del pedido**. Con la web vieja y esta
--   migración aplicada, cualquier pedido con una factura nueva no se puede abrir.
--
--   Es el mismo fallo de orden invertido del 0bbe0f6, y se colgó del mismo sitio: un
--   cambio de diseño a mitad del trabajo que invirtió qué depende de qué, sin que la
--   cabecera se releyera después.
--
-- ⚠️ EL PASO 1 ES SEGURO SOLO: la web nueva sabe pintar `factura` y además tolera
--   cualquier tipo desconocido (el `default` de `titulo()` y los `??` del render), así
--   que no necesita ni la migración ni la API para no romperse.
--
-- ⚠️⚠️ Y EL PASO 3 VA DETRÁS DE LA MIGRACIÓN POR DINERO, no por estética. La API nueva
--   manda `p_devolver_envio` a la RPC. Si llegara ANTES de que exista ese parámetro,
--   PostgREST no encontraría la función… **con el reembolso YA cobrado en Stripe**, que
--   es lo primero que hace `reembolsar`. Resultado: el porte fuera de la caja, sin
--   sellar y sin rectificativa que lo declare. La ventana hay que cerrarla, no acortarla.
--
-- ⚠️ Al contrario sí es benigno: la API VIEJA contra esta migración funciona igual,
--   porque llama con seis argumentos por nombre y el séptimo lleva `default false`.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- §1 · UN TIPO DE EVENTO PARA LAS FACTURAS
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `pedido_eventos` cuenta la vida del pedido: estados, cobros, devoluciones y
-- correos. Las facturas no estaban, y el libro sí las sabía: el resultado era una
-- ficha que no decía que se hubiera emitido nada ni quién lo hizo, mientras
-- `facturas_emitidas.emitida_por` lo tenía guardado desde el primer día.
--
-- ⚠️ POR QUÉ UN TIPO NUEVO Y NO UNA `nota`. La nota es texto libre y no se puede
-- consultar: «¿qué facturas se emitieron desde el panel y quién?» sobre notas es
-- un `like`. Con su tipo propio, la línea de tiempo lo pinta con su icono y su
-- color, y la pregunta se contesta con un `where tipo = 'factura'`.
--
-- ⚠️⚠️ ESTE CHECK ES LA RAZÓN DE QUE LA MIGRACIÓN VAYA PRIMERA. El evento se
-- apunta DESPUÉS de emitir, y el libro es append-only e inmutable: si el insert
-- reventara por el CHECK, la factura ya existiría y no habría forma de deshacerla.
-- Por eso, además, en la API ese insert va con su error tragado (ver
-- `contabilidad.service.ts`): una factura emitida no puede fallar porque su
-- apunte en el historial falle.

alter table public.pedido_eventos
  drop constraint if exists pedido_eventos_tipo_check;

alter table public.pedido_eventos
  add constraint pedido_eventos_tipo_check
  check (tipo = any (array['estado', 'pago', 'reembolso', 'email', 'nota', 'factura']));

comment on column public.pedido_eventos.tipo is
  'Qué clase de hecho es. `factura` (084) es la emisión de un documento de esta venta —simplificada, completa o rectificativa—; el número va en `detalle` y quién la emitió en `actor_user_id`.';

-- ─────────────────────────────────────────────────────────────────────────────
-- §2 · DEVOLVER EL PORTE SIN CERRAR EL PEDIDO
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Hasta hoy el porte se devolvía en un solo momento y sin poder elegir: al cerrar
-- el pedido por completo (`reembolsar_pedido_total`, 080). En una devolución
-- PARCIAL no había forma de devolverlo, y es un caso real —el pedido llegó tarde,
-- o llegó mal, y se le compensa el envío sin que devuelva la mercancía.
--
-- ⭐⭐ LO QUE **NO** HAY QUE TOCAR, Y ES LA MITAD DEL TRABAJO YA HECHA. La
-- rectificativa ya cuelga la línea del envío de `pedidos.envio_devuelto_en_refund`
-- (080 §, y la 082 la dejó en UNA sola línea):
--
--     select p.envio_devuelto_en_refund = p_refund_id, ...
--
-- O sea que **basta con sellar esa columna con el refund correcto** y la factura
-- rectificativa se emite con el porte en negativo ella sola. Nada de la cadena
-- fiscal, ni de las huellas, ni del desglose de IVA se toca en esta migración.
--
-- ⚠️⚠️ Y AQUÍ ESTÁ LA DECISIÓN DE DISEÑO QUE IMPORTA, porque la alternativa obvia
-- ESTÁ MAL. Lo natural sería una RPC nueva —«marcar el porte como devuelto»— que
-- la API llamara después de registrar las líneas. **No funciona**, y el motivo hay
-- que dejarlo escrito para que nadie lo «simplifique» así más adelante:
--
--   El trigger que emite la rectificativa (077) es DIFERIDO: corre al final de la
--   transacción que inserta en `reembolso_lineas`. Si el sellado fuera una llamada
--   aparte, iría en OTRA transacción y llegaría TARDE: el trigger ya habría emitido
--   la rectificativa sin la línea del porte. Y como `emitir_rectificativa` es
--   idempotente por refund, la segunda llamada no la corregiría — no haría nada.
--   Resultado: el dinero del porte devuelto y ninguna rectificativa que lo declare.
--
-- Por eso el sellado va DENTRO de `registrar_reembolso_lineas`, antes del insert,
-- en la misma transacción. Cuando el trigger diferido corre, ya lo ve.
--
-- ⚠️⚠️ Y LA OTRA TRAMPA, que este proyecto ya se ha comido dos veces (la 080 la
-- comprobó y la nota de `cancelar_transferencia_reemplazada` sigue viva en la cola):
-- **añadir un parámetro con `default` NO reemplaza la función, CREA UNA SOBRECARGA.**
-- Quedarían las dos, la vieja sin saber del porte, y cuál corre depende de cómo
-- PostgREST resuelva los nombres. Así que la vieja se DROPEA explícitamente por su
-- firma exacta, y al final de este fichero se comprueba que solo queda una.
--
-- ⚠️ Dropear la de 6 argumentos NO deja ciega a la API desplegada: llama con seis
-- argumentos POR NOMBRE, y la firma nueva los admite todos porque el séptimo lleva
-- `default false`. Es el mismo razonamiento comprobado en los dos sentidos en la
-- cabecera de la 083.

drop function if exists public.registrar_reembolso_lineas(uuid, jsonb, boolean, text, boolean, uuid);

create or replace function public.registrar_reembolso_lineas(
  p_pedido_id      uuid,
  p_lineas         jsonb,
  p_reponer_stock  boolean,
  p_refund_id      text,
  p_marcar_total   boolean default false,
  p_actor_id       uuid    default null,
  /**
   * Si esta devolución incluye además los gastos de envío (084).
   *
   * ⚠️ `default false` y no `null`: el porte NO se devuelve salvo que alguien lo
   * pida a mano. En el cierre total sí se devuelve solo, y eso lo sigue haciendo
   * `reembolsar_pedido_total` — no se toca.
   */
  p_devolver_envio boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_pedidas     integer := 0;
  v_registradas integer := 0;
  v_unidades    integer := 0;
  v_importe     numeric(10,2) := 0;
  v_repuestas   integer := 0;
  v_pendientes  integer := 0;
  v_total       boolean := false;
  -- Si el porte queda sellado a ESTE refund por esta llamada. Distinto de
  -- `p_devolver_envio`: se pidió devolverlo pero ya estaba devuelto, y entonces
  -- esto es false y no se cobra ni se rectifica nada de nuevo.
  v_envio_sellado boolean := false;
begin
  perform pg_advisory_xact_lock(hashtext('reembolsar_pedido:' || p_pedido_id::text));

  /**
   * ⬇️ EL SELLADO DEL PORTE (084). VA ANTES DEL INSERT, y el porqué está en la
   * cabecera: el trigger de la 077 es diferido y tiene que encontrarse la columna
   * ya escrita cuando corra al final de la transacción.
   *
   * ⚠️ El `where envio_devuelto_en_refund is null` ES EL GUARDIA CONTRA DEVOLVER
   * EL PORTE DOS VECES, y es el único que hay a este nivel. Sin él, dos parciales
   * seguidos con la casilla marcada cobrarían el porte dos veces y reatribuirían
   * la línea a la segunda rectificativa, dejando la primera cobrada y sin declarar.
   * El `returning` es lo que le dice a quien llama si el porte era suyo: la API lo
   * usa para NO sumarlo al importe que manda a Stripe cuando ya estaba devuelto.
   *
   * ⚠️ `coste_envio > 0` porque un pedido sin porte no tiene porte que devolver, y
   * sellar la columna igualmente haría que la rectificativa buscara una línea de
   * cero euros.
   */
  if coalesce(p_devolver_envio, false) then
    update public.pedidos
    set envio_devuelto_en_refund = p_refund_id,
        envio_devuelto_el        = public.dia_fiscal(now()),
        updated_at               = now()
    where id = p_pedido_id
      and coalesce(coste_envio, 0) > 0
      and envio_devuelto_en_refund is null;

    v_envio_sellado := found;
  end if;

  with entrada as (
    select
      (l->>'pedido_item_id')::uuid as pedido_item_id,
      (l->>'cantidad')::integer    as cantidad
    from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) l
  ),
  disponible as (
    /**
     * §6 de la 083: el tope y el importe los da importe_a_devolver, que es el
     * único sitio que sabe cuánto se le debe al cliente por esas unidades.
     *
     * ⚠️⚠️ EL `coalesce` ES NUEVO EN LA 084 Y NO ES COSMÉTICO. `importe_a_devolver`
     * interpreta `p_lineas IS NULL` como **TODO LO PENDIENTE** —así lo usa
     * `reembolsar_pedido_total` para cerrar un pedido— y hasta ahora daba igual
     * porque esta función solo se llamaba con una selección de artículos.
     *
     * Desde la 084 se la puede llamar SIN artículos, para devolver solo el porte.
     * Quien escriba esa llamada tiene `null` a un dedo de distancia de `'[]'`, y
     * con `null` esto registraría como devueltas TODAS las unidades que quedaran,
     * repondría su stock y emitiría una rectificativa por el pedido ENTERO —
     * habiendo devuelto 3,40 € de porte por la pasarela. En un libro append-only
     * eso no se deshace.
     *
     * Así que el `null` se convierte aquí en «ninguna línea», que es lo que
     * significa para esta función. Quien quiera «todo lo pendiente» tiene
     * `p_marcar_total`, que es el camino con nombre.
     */
    select d.pedido_item_id as id, d.cantidad, d.importe
    from public.importe_a_devolver(p_pedido_id, coalesce(p_lineas, '[]'::jsonb)) d
  ),
  insertada as (
    insert into public.reembolso_lineas (
      pedido_id, pedido_item_id, cantidad, importe,
      repuesto_al_stock, refund_id, actor_user_id
    )
    select
      p_pedido_id, d.id, d.cantidad, d.importe,
      coalesce(p_reponer_stock, false), p_refund_id, p_actor_id
    from disponible d
    where d.cantidad > 0
    on conflict (refund_id, pedido_item_id) do nothing
    returning pedido_item_id, cantidad, importe
  ),
  a_reponer as (
    select i.producto_id, sum(ins.cantidad) as unidades
    from insertada ins
    join public.pedido_items i on i.id = ins.pedido_item_id
    group by i.producto_id
  ),
  repuesta as (
    update public.productos p
    set stock_disponible = p.stock_disponible + ar.unidades,
        updated_at = now()
    from a_reponer ar
    where p.id = ar.producto_id
      and coalesce(p_reponer_stock, false)
    returning p.id
  )
  select
    (select count(*) from entrada),
    (select count(*) from insertada),
    (select coalesce(sum(cantidad), 0) from insertada),
    (select coalesce(sum(importe), 0) from insertada)
  into v_pedidas, v_registradas, v_unidades, v_importe;

  if coalesce(p_reponer_stock, false) then
    v_repuestas := v_unidades;
  end if;

  if p_marcar_total then
    select coalesce(sum(i.cantidad - coalesce(r.devuelto, 0)), 0)
    into v_pendientes
    from public.pedido_items i
    left join (
      select pedido_item_id, sum(cantidad) as devuelto
      from public.reembolso_lineas
      group by pedido_item_id
    ) r on r.pedido_item_id = i.id
    where i.pedido_id = p_pedido_id
      and i.cantidad - coalesce(r.devuelto, 0) > 0;

    -- El tercer argumento es lo único que cambia respecto a la 044.
    v_total := public.reembolsar_pedido_total(p_pedido_id, p_actor_id, p_refund_id);
    if v_total then
      v_repuestas := v_repuestas + v_pendientes;
    end if;
  end if;

  /**
   * ⬇️ EL PORTE SIN ARTÍCULOS (084). Es el mismo hueco que la 080 §6.3 tapó en
   * `reembolsar_pedido_total`, y por la misma razón: si esta devolución solo
   * devolvió el porte, NO hay filas nuevas en `reembolso_lineas` y el trigger
   * diferido de la 077 no se dispara. Nadie emitiría la rectificativa.
   *
   * ⚠️ La condición es «no hay NINGUNA línea de este refund», no «no se insertó
   * ninguna ahora»: si `p_marcar_total` cerró el pedido, `reembolsar_pedido_total`
   * ya insertó las pendientes con este mismo refund y el trigger las verá todas.
   * Emitir aquí también se adelantaría a esas líneas y saldría un documento por
   * menos importe del debido — es palabra por palabra el aviso de la 080 §6.3.
   *
   * ⚠️⚠️ Y EL `EXCEPTION` ES LA REGLA DE ESTA RUTA. Cuando esto corre, el dinero
   * YA salió de Stripe: dejar que un fallo aborte la transacción convertiría una
   * devolución hecha en un error en pantalla, y encima perdería el sellado del
   * porte. No queda en silencio — se anota con el mismo evento que usa el trigger,
   * así que lo recoge la misma revisión del 303.
   */
  if v_envio_sellado
     and not exists (
       select 1 from public.reembolso_lineas rl
       where rl.pedido_id = p_pedido_id and rl.refund_id = p_refund_id
     ) then
    begin
      perform public.emitir_rectificativa(p_pedido_id, p_refund_id, p_actor_id);
    exception
      when others then
        insert into public.factura_eventos (evento, detalle, actor_id)
        values ('rectificativa_fallida',
                jsonb_build_object(
                  'pedido_id', p_pedido_id,
                  'refund_id', p_refund_id,
                  'motivo',    'devolucion de solo los gastos de envio desde el panel',
                  'error',     sqlerrm,
                  'sqlstate',  sqlstate),
                p_actor_id);
    end;
  end if;

  return jsonb_build_object(
    'registradas', v_registradas,
    'pedidas',     v_pedidas,
    'unidades',    v_unidades,
    'importe',     v_importe,
    'unidades_repuestas', v_repuestas,
    'repuesto',    v_repuestas > 0,
    'marcado_total', v_total,
    -- Nuevo en la 084. `false` con `p_devolver_envio = true` significa «ya estaba
    -- devuelto»: quien llama tiene que dejar de contarlo en el importe.
    'envio_devuelto', v_envio_sellado
  );
end;
$function$;

comment on function public.registrar_reembolso_lineas(uuid, jsonb, boolean, text, boolean, uuid, boolean) is
  'Apunta qué artículos se devolvieron, repone su stock y cierra el pedido si procede. Desde la 084 puede sellar además los gastos de envío como devueltos en ESTE refund (p_devolver_envio), que es lo que hace que la rectificativa los lleve en negativo. Idempotente por (refund_id, pedido_item_id) y, para el porte, por envio_devuelto_en_refund is null.';

/**
 * La constitución: nada de EXECUTE público en funciones SECURITY DEFINER.
 *
 * ⚠️⚠️ Y `revoke … from public` NO BASTA. Se descubrió A LA MALA aplicando esta misma
 * migración el 2026-08-25: al confirmarla, la función quedó con
 *
 *     postgres=X | anon=X | authenticated=X | service_role=X
 *
 * cuando la firma dropeada solo tenía `postgres` y `service_role`. O sea que durante
 * un minuto **cualquiera sin sesión podía llamar por PostgREST a una función SECURITY
 * DEFINER que devuelve dinero, repone stock y emite rectificativas.**
 *
 * El motivo: `create function` con una firma NUEVA nace con los *default privileges*
 * del proyecto, y en Supabase esos conceden EXECUTE a `anon` y `authenticated`. Eso es
 * una concesión a roles CONCRETOS, y `revoke … from public` no la toca — PUBLIC es el
 * pseudo-rol, no «todo el mundo».
 *
 * ⚠️ Es una trampa de las MISMAS FAMILIA que la de las sobrecargas: las dos vienen de
 * que cambiar la firma crea un objeto nuevo, no de que se modifique el viejo. Cada vez
 * que en este proyecto se añada un parámetro a una función SECURITY DEFINER hay que
 * revocar a `anon` y `authenticated` POR NOMBRE, y comprobarlo. Ver el §4.
 */
revoke all on function public.registrar_reembolso_lineas(uuid, jsonb, boolean, text, boolean, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.registrar_reembolso_lineas(uuid, jsonb, boolean, text, boolean, uuid, boolean)
  to service_role;

-- ⚠️ El revoke de `factura_emitida_al_historial()` NO va aquí: esa función se crea en
-- el §3, más abajo. Estaba aquí y la migración pasaba —porque en producción la función
-- ya existía de un aplicado anterior— pero en una base LIMPIA reventaba con «function
-- does not exist». Lo destapó el ensayo de la copia rota, no el aplicado real.

-- ─────────────────────────────────────────────────────────────────────────────
-- §3 · LA FACTURA, EN LA LÍNEA DE TIEMPO DEL PEDIDO
-- ─────────────────────────────────────────────────────────────────────────────
--
-- El §1 abrió el hueco para el tipo de evento; esto es lo que lo escribe.
--
-- ⚠️⚠️ POR QUÉ UN DISPARADOR Y NO UNA LLAMADA DESDE LA API, que era lo obvio.
-- Porque una factura nace por CUATRO caminos distintos, y desde la API se veía
-- uno:
--
--     1. La simplificada de cada venta         → un trigger, al devengar
--     2. La rectificativa de cada devolución   → otro trigger (077), diferido
--     3. La completa que pide el cliente       → `emitirFacturaCompleta` (API)
--     4. Las de arranque, en lote             → `emitir_*_pendientes`, que
--                                                devuelven un RECUENTO y no la
--                                                lista de pedidos que anotar
--
-- Apuntarlo desde `contabilidad.service.ts` habría cubierto el 3 y dejado la
-- ficha de una venta normal —el caso corriente, el 1— igual de muda que antes.
-- El libro es append-only: su INSERT es el único sitio por el que pasan los
-- cuatro. Uno solo, y cubre todo.
--
-- ⚠️⚠️ Y EL `EXCEPTION` NO ES OPCIONAL, ES LA RAZÓN DE QUE ESTO SEA SEGURO. El
-- trigger corre DENTRO de la transacción que emite la factura. Sin el bloque, un
-- fallo al apuntar el evento —un pedido borrado, un CHECK, cualquier cosa—
-- ABORTARÍA LA EMISIÓN DE LA FACTURA. Sería exactamente al revés de lo que se
-- quiere: el historial es la consecuencia del hecho, no el hecho, y aquí el hecho
-- es un documento fiscal. Así que se traga y deja rastro en `factura_eventos`,
-- que es donde se mira lo que le pasó a una factura.
--
-- ⚠️ `emitida_por` es null en las automáticas (1 y 2), y entonces el evento sale
-- como sistema — que es la verdad: nadie las pidió, las emitió el devengo.

create or replace function public.factura_emitida_al_historial()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  begin
    perform public.registrar_evento_pedido(
      new.pedido_id,
      'factura',
      -- El número es lo que se viene a buscar aquí: es lo que se le dice al
      -- cliente y lo que se teclea en Contabilidad para dar con el documento.
      'Factura ' || lower(new.tipo::text) || ' ' || coalesce(new.numero, '(sin número)'),
      -- Con su signo: las rectificativas son negativas y la pantalla lo usa para
      -- decir «rectificativa» sin leer el tipo.
      new.total,
      new.emitida_por,
      case when new.emitida_por is not null then 'panel' else 'sistema' end
    );
  exception
    when others then
      -- Ver la cabecera del §3: una factura emitida NO puede caerse porque su
      -- apunte en el historial se caiga.
      insert into public.factura_eventos (factura_id, evento, detalle, actor_id)
      values (new.id, 'evento_pedido_fallido',
              jsonb_build_object(
                'pedido_id', new.pedido_id,
                'numero',    new.numero,
                'error',     sqlerrm,
                'sqlstate',  sqlstate),
              new.emitida_por);
  end;

  return null;
end;
$function$;

comment on function public.factura_emitida_al_historial() is
  'Apunta en pedido_eventos que se emitió una factura de esa venta, con su número y quién la emitió (084). Sobre el INSERT del libro porque es el único punto por el que pasan los cuatro caminos de emisión. Nunca aborta la emisión: los fallos van a factura_eventos.';

-- `after insert` y `for each row`. No hay `update` ni `delete` que cubrir: el
-- trigger de inmutabilidad de la 072 los prohíbe, así que una factura solo se
-- inserta una vez y este evento no se puede duplicar por esa vía.
drop trigger if exists trg_factura_al_historial on public.facturas_emitidas;

create trigger trg_factura_al_historial
after insert on public.facturas_emitidas
for each row
execute function public.factura_emitida_al_historial();

-- No la puede llamar PostgREST —devuelve `trigger`— pero se cierra igual: la excepción
-- de hoy es el descuido de mañana. Y va DESPUÉS de crearla, ver la nota del §2.
revoke all on function public.factura_emitida_al_historial() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- §4 · LAS TRES COMPROBACIONES, QUE ABORTAN SI NO SE CUMPLEN
-- ─────────────────────────────────────────────────────────────────────────────
--
-- ⚠️ No son adorno: las dos cosas que esta migración podía romper en silencio son
-- «quedó una sobrecarga viva» y «el CHECK no admite el tipo nuevo». Un `raise` aquí
-- deshace la transacción entera; un comentario no habría deshecho nada.

do $$
declare
  v_sobrecargas integer;
begin
  select count(*) into v_sobrecargas
  from pg_proc
  where proname = 'registrar_reembolso_lineas'
    and pronamespace = 'public'::regnamespace;

  if v_sobrecargas <> 1 then
    raise exception
      'La 084 dejó % sobrecargas de registrar_reembolso_lineas y tiene que quedar 1. Es el fallo clásico de los defaults: la vieja no sabe del porte.',
      v_sobrecargas;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'pedido_eventos_tipo_check'
      and pg_get_constraintdef(oid) like '%factura%'
  ) then
    raise exception 'La 084 no amplió pedido_eventos_tipo_check: el disparador del §3 no podría escribir y todas las facturas nuevas se quedarían sin apunte.';
  end if;

  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    where c.relname = 'facturas_emitidas'
      and t.tgname = 'trg_factura_al_historial'
      and not t.tgisinternal
  ) then
    raise exception 'La 084 no dejó vivo trg_factura_al_historial: las facturas seguirían sin salir en la ficha del pedido.';
  end if;

  /**
   * ⚠️⚠️ EL TERCER GUARDIA, Y ESTÁ AQUÍ PORQUE FALTABA. La primera vez que se aplicó
   * esta migración pasó los otros dos y dejó `anon` y `authenticated` con EXECUTE sobre
   * una función que devuelve dinero. Los dos guardias de arriba dieron el visto bueno a
   * una migración con un agujero de seguridad, que es exactamente lo que una
   * comprobación incompleta hace: dar confianza.
   *
   * Se comprueba por AUSENCIA de los roles y no por presencia de `service_role`: lo
   * peligroso es quién SOBRA, no quién falta.
   */
  if exists (
    select 1
    from pg_proc p
    cross join lateral aclexplode(p.proacl) a
    join pg_roles r on r.oid = a.grantee
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('registrar_reembolso_lineas', 'factura_emitida_al_historial')
      and r.rolname in ('anon', 'authenticated')
      and a.privilege_type = 'EXECUTE'
  ) then
    raise exception
      'La 084 ha dejado EXECUTE a anon/authenticated en una función SECURITY DEFINER que mueve dinero. Es lo que pasa por defecto al crear una firma NUEVA en Supabase, y `revoke from public` no lo quita: hay que revocar a esos roles por nombre.';
  end if;
end $$;
