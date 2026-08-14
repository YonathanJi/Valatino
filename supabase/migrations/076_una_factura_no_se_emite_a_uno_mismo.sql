-- ============================================================
-- 076 — Una factura no se emite a uno mismo
--
-- Salió al revisar la primera operación completa con el formato nuevo
-- (`VALF202600100`, 2026-08-14): **emisor y receptor llevaban el MISMO NIF**,
-- `Z4194001W`, y la misma dirección. El nombre era distinto —«Leydy Jhoanna
-- Mendoza Sanchez» vendiendo a «Yonathan Jimenez Duque»— y eso es justo lo que
-- lo hace fácil de pasar por alto: **el NIF es la identidad, no el nombre**. Ese
-- documento dice que Z4194001W se vendió a sí mismo.
--
-- En pruebas es inofensivo. Lo que importa es que **nada lo impedía**: la 073
-- valida que el NIF del receptor tenga forma válida (`nif_forma_valida`), no que
-- sea de otra persona.
--
-- ── Por qué va en DOS sitios, y no es duplicar la regla ───────────────────────
-- Es la forma de la 069 con `fecha_factura`, que funcionó:
--
--   · el CHECK es el SUELO — vale para cualquier vía, incluida una inserción a
--     mano por SQL, y ninguna función futura puede olvidarlo;
--   · el `raise` en `emitir_factura_completa` es el MENSAJE — un CHECK da
--     «violates check constraint "facturas_receptor_no_es_el_emisor"», que no
--     dice a nadie qué hacer.
--
-- ⚠️⚠️ Y POR QUÉ EL CHECK VA `NOT VALID`, que es lo que hay que entender aquí:
-- **la factura `VALF202600100` que ya existe viola esta regla**, así que un CHECK
-- normal no se podría ni crear — `ALTER TABLE` valida las filas existentes y
-- fallaría. `NOT VALID` prohíbe todo lo nuevo y exime lo que ya está.
--
-- Se eligió eso en vez de borrar la factura de Jonathan sin preguntárselo. Cuando
-- esa factura desaparezca —con `limpiar_datos_de_prueba`, o borrándola a mano,
-- que hoy se puede porque no hay arranque fiscal— la validación se cierra con:
--
--     alter table public.facturas_emitidas validate constraint facturas_receptor_no_es_el_emisor;
--
-- Eso queda apuntado en ESTADO.md. Mientras tanto la regla ya está en pie para
-- todo lo que se emita a partir de ahora, que es lo que de verdad hacía falta.
-- ============================================================

-- ── §1 · El suelo ────────────────────────────────────────────────────────────
-- Se compara en MAYÚSCULAS y sin espacios porque así se guarda el NIF en los dos
-- lados (`normalizarNif` en la API, `upper(trim(...))` en la 073), pero no se da
-- por hecho: si algún día entrara uno sin normalizar, la comparación laxa sigue
-- cazándolo y la estricta lo habría dejado pasar.
--
-- El `nullif` no es adorno: una simplificada tiene `receptor` NULL, y un receptor
-- a medias podría traer el NIF vacío. Ninguno de los dos casos es «se facturó a
-- uno mismo», así que ninguno debe abortar.
alter table public.facturas_emitidas
  drop constraint if exists facturas_receptor_no_es_el_emisor;

alter table public.facturas_emitidas
  add constraint facturas_receptor_no_es_el_emisor check (
    receptor is null
    or nullif(trim(receptor->>'nif'), '') is null
    or upper(trim(receptor->>'nif')) <> upper(trim(emisor->>'nif'))
  ) not valid;

-- ── §2 · El mensaje ──────────────────────────────────────────────────────────
-- Se reescribe entera porque `create or replace` lo exige. Respecto a la 073
-- cambia UN bloque: el guardia del NIF propio, puesto DESPUÉS de comprobar la
-- forma —para que quien teclee un NIF mal escrito lea eso primero, que es el
-- error más probable— y ANTES de construir el receptor.
create or replace function public.emitir_factura_completa(
  p_pedido_id uuid,
  p_receptor  jsonb,
  p_actor_id  uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_receptor      jsonb;
  v_nif           text;
  v_simplificada  uuid;
  v_falta         text[] := '{}';
  v_emisor        jsonb;
begin
  v_emisor := emisor_fiscal();
  if v_emisor is null then
    raise exception
      'Faltan los datos fiscales del emisor (TI → Ajustes). Sin NIF, nombre y domicilio propios no se puede emitir una factura.'
      using errcode = 'P0001';
  end if;

  -- Nombrar lo que falta, no decir «datos incompletos». Es la lección del
  -- guardia de la 069, que nombra las facturas sin fecha.
  --
  -- ⚠️ El `::text` NO es adorno: sin él, `text[] || 'NIF'` hace que Postgres
  -- resuelva el operador como `anyarray || anyarray` e intente convertir la
  -- cadena a un array, y esto revienta con «malformed array literal: NIF».
  if coalesce(trim(p_receptor->>'nif'), '')           = '' then v_falta := v_falta || 'NIF'::text; end if;
  if coalesce(trim(p_receptor->>'nombre'), '')        = '' then v_falta := v_falta || 'nombre o razón social'::text; end if;
  if coalesce(trim(p_receptor->>'direccion'), '')     = '' then v_falta := v_falta || 'dirección'::text; end if;
  if coalesce(trim(p_receptor->>'codigo_postal'), '') = '' then v_falta := v_falta || 'código postal'::text; end if;
  if coalesce(trim(p_receptor->>'ciudad'), '')        = '' then v_falta := v_falta || 'población'::text; end if;

  if cardinality(v_falta) > 0 then
    raise exception
      'Una factura completa necesita los datos fiscales del cliente. Falta: %.',
      array_to_string(v_falta, ', ')
      using errcode = 'P0001';
  end if;

  v_nif := upper(trim(p_receptor->>'nif'));
  if not nif_forma_valida(v_nif) then
    raise exception
      'El NIF «%» no tiene una forma válida (8 cifras y letra, NIE, o CIF).', v_nif
      using errcode = 'P0001';
  end if;

  -- ⭐ EL GUARDIA NUEVO DE LA 076. Se explica el porqué en el mensaje, porque
  -- quien lo vea va a estar seguro de haber escrito bien el NIF: lo copió del
  -- documento que el checkout pidió, y la pantalla lo ofrece como pista.
  if v_nif = upper(trim(v_emisor->>'nif')) then
    raise exception
      'El NIF % es el del propio negocio: una factura no se emite a uno mismo. '
      'Si el cliente es otra persona, pon SU NIF; el documento que se pidió en el '
      'checkout puede no ser el que va en la factura.',
      v_nif
      using errcode = 'P0001';
  end if;

  -- ⚠️ El receptor NO se guarda tal como llega: se reconstruye clave por clave,
  -- porque lo que entra por aquí acaba impreso en un documento contable.
  v_receptor := jsonb_build_object(
    'nif',           v_nif,
    'nombre',        trim(p_receptor->>'nombre'),
    'direccion',     trim(p_receptor->>'direccion'),
    'codigo_postal', trim(p_receptor->>'codigo_postal'),
    'ciudad',        trim(p_receptor->>'ciudad'),
    'provincia',     nullif(trim(coalesce(p_receptor->>'provincia', '')), ''),
    'pais',          coalesce(nullif(trim(coalesce(p_receptor->>'pais', '')), ''), 'ES')
  );

  -- La simplificada a la que sustituye, si la hubo. Puede no haberla: una venta
  -- anterior a que el emisor estuviera configurado no llegó a tener ninguna, y
  -- entonces la completa no sustituye a nada — no es un error.
  select id into v_simplificada
  from facturas_emitidas
  where pedido_id = p_pedido_id and tipo = 'simplificada';

  return emitir_factura(
    p_pedido_id   => p_pedido_id,
    p_tipo        => 'completa',
    p_receptor    => v_receptor,
    p_sustituye_a => v_simplificada,
    p_actor_id    => p_actor_id
  );
end;
$$;

comment on function public.emitir_factura_completa is
  'La factura completa a petición del cliente. Sustituye a la simplificada de esa venta si existía. Idempotente: dos clics devuelven la misma. Desde la 076 se niega si el NIF del receptor es el del emisor.';

-- ⚠️ La 073 no dejó `revoke` para esta función y la 059/060 dicen que hay que
-- revocar a los TRES y comprobarlo. `create or replace` no restablece grants, así
-- que esto no cambia nada hoy — pero deja el estado afirmado en vez de supuesto.
revoke execute on function public.emitir_factura_completa(uuid, jsonb, uuid) from public, anon, authenticated;

do $comprobar$
begin
  if has_function_privilege('anon', 'public.emitir_factura_completa(uuid, jsonb, uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.emitir_factura_completa(uuid, jsonb, uuid)', 'EXECUTE') then
    raise exception 'emitir_factura_completa sigue siendo ejecutable desde internet';
  end if;
end
$comprobar$;
