-- ============================================================
-- 071 — Los datos fiscales del emisor
--
-- Una factura tiene que llevar impresos el NIF, el nombre o razón social y el
-- domicilio de quien la emite. En esta base de datos NO EXISTE NINGUNO de los
-- tres: `ajustes_tienda` (046) solo guarda el IBAN de cobro, y eso es un dato
-- para que el cliente pague, no la identidad fiscal del negocio.
--
-- Así que esto es el prerrequisito de la Capa 2, y va en su propia migración
-- porque es lo único que Jonathan tiene que rellenar a mano: yo puedo escribir
-- la tabla de facturas, la numeración y la cadena de hash, pero no me puedo
-- inventar un NIF.
--
-- ⚠️ Y por eso NO se siembra nada, ni siquiera copiando `transferencia_titular`.
-- El titular de la cuenta bancaria y la razón social se parecen lo suficiente
-- para que copiarlo pareciera un acierto, y son cosas distintas: un autónomo
-- puede cobrar en una cuenta a su nombre y facturar como sociedad. Es el mismo
-- criterio que `productos.iva_pct` sin valor por defecto (062): **un dato que
-- parece puesto es un dato que nadie revisa**, y este acaba impreso en un
-- documento contable.
--
-- Las columnas nacen NULL a propósito. Lo que decide que no se emita una
-- factura a medias es `emisor_fiscal()`, que devuelve NULL mientras falte algo,
-- y el aviso del 303 que contará los pedidos devengados sin factura.
--
-- Dónde vive: TI → Ajustes, junto al IBAN. Es dato de negocio editable desde el
-- panel, no un secreto de entorno — la razón de ser de la 046.
-- ============================================================

alter table public.ajustes_tienda
  add column if not exists emisor_nif           text,
  add column if not exists emisor_nombre        text,
  add column if not exists emisor_direccion     text,
  add column if not exists emisor_codigo_postal text,
  add column if not exists emisor_ciudad        text,
  add column if not exists emisor_provincia     text,
  -- Este sí lleva valor por defecto, y no es inventarse un dato fiscal: es el
  -- país de una tienda que solo vende en España y cuyo catálogo de municipios
  -- (`municipios.generado.ts`) es español.
  add column if not exists emisor_pais          char(2) not null default 'ES';

comment on column public.ajustes_tienda.emisor_nif is
  'NIF/CIF de quien emite las facturas. En mayúsculas y sin espacios. NULL = todavía no se puede facturar.';
comment on column public.ajustes_tienda.emisor_nombre is
  'Razón social, o nombre y apellidos si es autónomo. NO es el titular de la cuenta bancaria.';

-- ── La forma del NIF, no su dígito de control ────────────────────────────────
-- El dígito de control se valida en la API, donde el mensaje puede explicar qué
-- pasa y donde se puede probar en TypeScript. Aquí solo la forma, que es lo que
-- protege contra un valor imposible entrando por otra puerta.
--
-- ⚠️ La expresión exige MAYÚSCULAS, y eso es la normalización: un `12345678z`
-- en minúscula no entra. Quien escribe es la API, que lo sube antes.
alter table public.ajustes_tienda drop constraint if exists ajustes_emisor_nif_forma;
alter table public.ajustes_tienda add constraint ajustes_emisor_nif_forma check (
  emisor_nif is null or emisor_nif ~ '^([0-9]{8}[A-Z]|[XYZ][0-9]{7}[A-Z]|[A-HJNP-SUVW][0-9]{7}[0-9A-J])$'
);

alter table public.ajustes_tienda drop constraint if exists ajustes_emisor_cp_forma;
alter table public.ajustes_tienda add constraint ajustes_emisor_cp_forma check (
  emisor_codigo_postal is null or emisor_codigo_postal ~ '^[0-9]{5}$'
);

-- Nada de cadenas vacías: un `''` pasa cualquier `is not null` y luego sale
-- impreso como un hueco en la factura. Se guarda el dato o se guarda NULL.
alter table public.ajustes_tienda drop constraint if exists ajustes_emisor_sin_vacios;
alter table public.ajustes_tienda add constraint ajustes_emisor_sin_vacios check (
  coalesce(emisor_nombre, 'x')    <> ''
  and coalesce(emisor_direccion, 'x') <> ''
  and coalesce(emisor_ciudad, 'x')    <> ''
  and coalesce(emisor_provincia, 'x') <> ''
);

-- ── El emisor como una sola pieza ────────────────────────────────────────────
-- Devuelve NULL mientras falte cualquier dato obligatorio, y el jsonb completo
-- cuando está. Dos usos con una sola definición:
--
--   1. el guardia — ¿se puede emitir una factura ahora mismo?
--   2. el SNAPSHOT que la factura congela
--
-- Que sean la misma función es deliberado: si fueran dos, podría dar por bueno
-- un emisor que luego se congela incompleto.
--
-- `provincia` queda fuera de los obligatorios: el código postal ya la
-- determina, y exigir un campo más solo añade una casilla donde atascarse.
create or replace function public.emisor_fiscal()
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select case
    when a.emisor_nif is null
      or a.emisor_nombre is null
      or a.emisor_direccion is null
      or a.emisor_codigo_postal is null
      or a.emisor_ciudad is null
    then null
    else jsonb_build_object(
      'nif',           a.emisor_nif,
      'nombre',        a.emisor_nombre,
      'direccion',     a.emisor_direccion,
      'codigo_postal', a.emisor_codigo_postal,
      'ciudad',        a.emisor_ciudad,
      'provincia',     a.emisor_provincia,
      'pais',          a.emisor_pais
    )
  end
  from public.ajustes_tienda a
  where a.id;
$$;

comment on function public.emisor_fiscal() is
  'Datos fiscales del emisor como jsonb, o NULL si falta alguno. Es a la vez el guardia y el snapshot que congela cada factura.';

-- ── Permisos ─────────────────────────────────────────────────────────────────
-- ⚠️ LAS DOS FUENTES, que es la lección de la 059/060: quitar solo la herencia
-- de PUBLIC deja vivo el grant que Supabase pone a anon y authenticated con
-- `alter default privileges`, y el REVOKE no protesta.
revoke all on function public.emisor_fiscal() from public;
revoke all on function public.emisor_fiscal() from anon;
revoke all on function public.emisor_fiscal() from authenticated;

do $$
declare v_mal text;
begin
  select string_agg(r, ', ') into v_mal
  from (select unnest(array['anon', 'authenticated']) r) x
  where has_function_privilege(x.r, 'public.emisor_fiscal()', 'execute');

  if v_mal is not null then
    raise exception 'emisor_fiscal() sigue siendo ejecutable por: %', v_mal;
  end if;
end $$;
