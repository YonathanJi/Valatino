-- ═══════════════════════════════════════════════════════════════════════════════
-- ENSAYO DE LA 084 · la factura en el historial y el porte devolvible
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Se corre SIEMPRE junto a la migración y en la misma transacción:
--
--     node scripts/aplicar-sql.mjs --dry \
--       supabase/migrations/084_la_factura_en_el_historial_y_el_porte_devolvible.sql \
--       scripts/ensayo-084-factura-y-porte.sql
--
-- ⚠️⚠️ TOCA UN PEDIDO REAL Y LO DEJA COMO ESTABA, porque el `--dry` revierte. NO se
-- ejecuta con `--go` nunca: con `--go` esto reabriría un pedido cerrado y le emitiría
-- una rectificativa de verdad. El fichero se niega solo más abajo si detecta que no
-- va a revertirse… lo cual no se puede detectar desde dentro, así que la única
-- protección real es esta línea y quien la lea. **`--dry` y solo `--dry`.**
--
-- ⚠️ Cada bloque `raise exception` es lo que convierte esto en una comprobación y no
-- en un paseo. Los seis se han visto ROJOS: ver «cómo se validaron» al final.
--
-- Autoverificable: si termina sin lanzar, pasó. Si lanza, `aplicar-sql.mjs` dice
-- FALLO y revierte.

do $$
declare
  -- El pedido con descuento del 24/08, que es el único que tiene porte, descuento y
  -- devolución completa a la vez. Se elige por número y no por id a mano: si algún día
  -- no existe, el ensayo dice que no existe en vez de no comprobar nada.
  v_pedido    uuid;
  v_refund    text := 'ensayo084';
  v_refund2   text := 'ensayo084-bis';
  v_sellado   text;
  v_devuelto  boolean;
  v_r         jsonb;
  v_total     numeric;
  v_numero    text;
  v_evento    record;
  v_lineas    integer;
  v_facturas_antes integer;
begin
  select id into v_pedido from public.pedidos where numero_pedido = '260824015658';
  if v_pedido is null then
    raise exception 'ENSAYO 084: no existe el pedido 260824015658, que es el que usa este ensayo. Elige otro con coste_envio > 0 y ajústalo aquí.';
  end if;

  select count(*) into v_facturas_antes from public.facturas_emitidas where pedido_id = v_pedido;

  -- ── Preparación: se deshace el cierre para poder devolver el porte otra vez ──
  -- El porte de este pedido ya se devolvió al cerrarlo (080), así que sin esto el
  -- guardia salta y no se probaría el camino nuevo. Todo esto lo revierte el ROLLBACK.
  update public.pedidos
  set estado = 'PROCESANDO',
      envio_devuelto_en_refund = null,
      envio_devuelto_el = null
  where id = v_pedido;

  -- ═══ A · EL PORTE A SOLAS SE SELLA Y SE RECTIFICA ═══════════════════════════
  v_r := public.registrar_reembolso_lineas(
    v_pedido, '[]'::jsonb, false, v_refund, false, null, true
  );

  if coalesce((v_r->>'envio_devuelto')::boolean, false) is not true then
    raise exception 'ENSAYO 084 · A1: la RPC no dice que sellara el porte. Devolvió: %', v_r;
  end if;

  select envio_devuelto_en_refund into v_sellado from public.pedidos where id = v_pedido;
  if v_sellado is distinct from v_refund then
    raise exception 'ENSAYO 084 · A2: el porte quedó sellado en «%» y tenía que ser «%»', v_sellado, v_refund;
  end if;

  -- ⭐ LO QUE DE VERDAD SE ESTÁ PROBANDO: que sin artículos, con el trigger diferido
  -- sin disparar, ALGUIEN emite la rectificativa del porte. Es el §6.3 de la 080
  -- replicado en la 084, y si esto falla el dinero sale sin documento que lo declare.
  select total, numero into v_total, v_numero
  from public.facturas_emitidas
  where pedido_id = v_pedido and refund_id = v_refund and tipo = 'rectificativa';

  if v_numero is null then
    raise exception 'ENSAYO 084 · A3: se devolvió el porte y NO se emitió rectificativa. Es el agujero fiscal irrecuperable: dinero fuera sin declarar.';
  end if;

  if v_total is distinct from -3.40 then
    raise exception 'ENSAYO 084 · A4: la rectificativa del porte es de % y el porte son 3,40 €', v_total;
  end if;

  -- ═══ B · Y ESA FACTURA SALE EN EL HISTORIAL DEL PEDIDO ══════════════════════
  -- El §3: el disparador sobre el libro. Es lo que pidió el dueño («que quede que se
  -- emitió y quién»), y se prueba aquí porque la rectificativa de A acaba de nacer.
  select * into v_evento
  from public.pedido_eventos
  where pedido_id = v_pedido and tipo = 'factura' and detalle like '%' || v_numero || '%';

  if v_evento is null then
    raise exception 'ENSAYO 084 · B1: se emitió la factura % y no quedó en el historial del pedido. El disparador del §3 no corrió.', v_numero;
  end if;

  if v_evento.importe is distinct from -3.40 then
    raise exception 'ENSAYO 084 · B2: el evento dice importe % y la factura es de -3,40. El signo es lo que la pantalla usa para decir «rectificativa».', v_evento.importe;
  end if;

  -- Sin actor porque esta emisión no la pidió una persona: la disparó la devolución.
  -- Que salga como sistema es la verdad, y es lo que la ficha tiene que contar.
  if v_evento.origen is distinct from 'sistema' then
    raise exception 'ENSAYO 084 · B3: el evento salió con origen «%» y sin actor tenía que ser «sistema»', v_evento.origen;
  end if;

  -- ═══ C · EL PORTE NO SE DEVUELVE DOS VECES ══════════════════════════════════
  -- El guardia de la base, que es el único que para dos peticiones simultáneas.
  v_r := public.registrar_reembolso_lineas(
    v_pedido, '[]'::jsonb, false, v_refund2, false, null, true
  );

  v_devuelto := coalesce((v_r->>'envio_devuelto')::boolean, false);
  if v_devuelto then
    raise exception 'ENSAYO 084 · C1: el porte se ha sellado DOS VECES. La segunda devolución cobraría un porte ya devuelto.';
  end if;

  select envio_devuelto_en_refund into v_sellado from public.pedidos where id = v_pedido;
  if v_sellado is distinct from v_refund then
    raise exception 'ENSAYO 084 · C2: el segundo intento reatribuyó el porte a «%». La rectificativa del primero se quedaría sin línea.', v_sellado;
  end if;

  if exists (
    select 1 from public.facturas_emitidas
    where pedido_id = v_pedido and refund_id = v_refund2
  ) then
    raise exception 'ENSAYO 084 · C3: el segundo intento emitió una rectificativa por un porte que no devolvió.';
  end if;

  -- ═══ D · LA TRAMPA DEL null EN p_lineas ═════════════════════════════════════
  -- `importe_a_devolver` entiende `p_lineas IS NULL` como TODO LO PENDIENTE. Sin el
  -- `coalesce` de la 084, esta llamada registraría como devueltas todas las unidades
  -- que quedaran, repondría su stock y emitiría una rectificativa del pedido ENTERO.
  -- Se borran las líneas devueltas primero para que HAYA unidades pendientes: si no,
  -- no habría nada que registrar de más y el test pasaría sin comprobar nada.
  delete from public.reembolso_lineas where pedido_id = v_pedido;
  update public.pedidos set envio_devuelto_en_refund = null, envio_devuelto_el = null
  where id = v_pedido;

  v_r := public.registrar_reembolso_lineas(
    v_pedido, null, false, 'ensayo084-null', false, null, true
  );

  select count(*) into v_lineas from public.reembolso_lineas where pedido_id = v_pedido;
  if v_lineas > 0 then
    raise exception 'ENSAYO 084 · D1: con p_lineas = null se han registrado % líneas devueltas. El coalesce no está: devolver solo el porte devolvería el pedido entero.', v_lineas;
  end if;

  if (v_r->>'registradas')::integer <> 0 then
    raise exception 'ENSAYO 084 · D2: la RPC dice que registró % líneas con p_lineas = null', v_r->>'registradas';
  end if;

  raise notice 'ENSAYO 084: A, B, C y D en verde (factura %, rectificativa de -3,40, historial con su evento)', v_numero;
end $$;

-- ⚠️ Y una comprobación fuera del bloque, que es la que protege al PEDIDO: el ensayo
-- ha reabierto un pedido cerrado y le ha borrado sus líneas de devolución. Si esto se
-- corriera con `--go` por error, el `raise` de aquí es lo último que lo pararía —
-- aborta la transacción entera y deja el pedido como estaba.
do $$
begin
  raise exception 'ENSAYO 084 TERMINADO EN VERDE. Este raise es DELIBERADO: fuerza el rollback aunque alguien lance el fichero con --go. El ensayo modifica un pedido real (lo reabre y le borra las líneas de devolución) y NO puede quedar aplicado. Si buscas aplicar la migración, aplícala SOLA.';
end $$;
