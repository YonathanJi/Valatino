-- ============================================================
-- 069 — La fecha de la factura de compra, ahora obligatoria
--
-- El segundo paso de los dos que anunció el apartado 3 de la 068. Allí la
-- columna nació NULLABLE a propósito, y no por descuido: la API que estaba
-- desplegada en ese momento llamaba a `registrar_factura_compra` sin el
-- parámetro, y exigirla desde el minuto uno habría dejado «Registrar compra»
-- devolviendo error hasta que el despliegue llegara.
--
--   068  la base la ACEPTA nula · la web pasa a pedirla   ← hecho
--   069  la base la EXIGE, con el despliegue ya en pie    ← esto
--
-- ⚠️ ESTA MIGRACIÓN SOLO SE APLICA CON EL DESPLIEGUE HECHO Y COMPROBADO. Antes
-- del deploy, aplicarla convierte la ventana de diez minutos en una avería
-- permanente: la API vieja no manda el campo y no podría registrar ninguna
-- compra. Se comprobó por HTTP que la ruta nueva de la API responde antes de
-- ejecutar esto.
--
-- POR QUÉ SUBIR LA RESTRICCIÓN A LA BASE Y NO DEJARLA EN EL DTO
-- El DTO ya la exige desde la 068, y con eso el formulario no puede colarse. La
-- diferencia es todo lo demás: el editor SQL, un script de importación, y
-- cualquier endpoint que se escriba mañana sin acordarse. Es la lección de la
-- 055 y del guardia de la 064: una restricción que depende de que la aplicación
-- se acuerde no es una restricción.
-- ============================================================

-- ── 1. El guardia, antes de que salte el genérico ──────────────────────────
--
-- «column contains null values» no dice CUÁL, y con dos facturas se adivina
-- pero con doscientas no. Se avisa con el número de factura, igual que hizo la
-- 062 con los productos sin tipo de IVA.
--
-- No se rellena nada aquí: una fecha inventada en el libro registro de facturas
-- recibidas es peor que un hueco, porque parece puesta. Se coge del PDF y se
-- pone desde la ficha de la compra («Poner fecha»), que es lo que se hizo con
-- las dos que existían (202521188 → 15/07/2026, 202521893 → 05/08/2026).
do $sin_fecha$
declare
  v_faltan text;
begin
  select string_agg(numero_factura, ', ' order by numero_factura)
  into v_faltan
  from public.facturas_compra
  where fecha_factura is null;

  if v_faltan is not null then
    raise exception
      'Estas facturas de compra no tienen fecha de expedición: %. Cógela del PDF y '
      'ponla en Compras → la factura → «Poner fecha» antes de aplicar esta migración. '
      'No se rellena a dedo: es un dato del libro registro.',
      v_faltan;
  end if;
end
$sin_fecha$;

alter table public.facturas_compra
  alter column fecha_factura set not null;

-- El comentario de la 068 sigue siendo el bueno; solo se le añade que ya es
-- obligatoria, para que quien lea la columna no tenga que buscar dos migraciones.
comment on column public.facturas_compra.fecha_factura is
  'Fecha de EXPEDICIÓN de la factura del proveedor, la que exige el libro registro '
  'de facturas recibidas. Obligatoria desde la 069. NO decide el trimestre en que se '
  'deduce: eso lo hace created_at (la fecha de registro). Ver la 068.';

-- ── 2. Y que la RPC lo diga con palabras ───────────────────────────────────
--
-- ⚠️ La firma NO cambia: `p_fecha_factura date default null` se queda tal cual,
-- y es deliberado. Quitar el `default` haría que una llamada sin el parámetro
-- fallara con «function does not exist», que es lo que menos ayuda a
-- diagnosticar. Con el default y un `raise` explícito, el error dice qué falta.
--
-- Y como la firma es la misma, aquí NO hay que hacer `drop function`: no se crea
-- una segunda versión y no hay llamada ambigua que evitar (la trampa de la 039,
-- que la 068 sí tuvo que sortear porque añadía un parámetro).
--
-- El `raise exception` sin `using errcode` da P0001, que es lo que la API
-- reconoce como «escrito por una persona» y publica tal cual (ver
-- `esMensajeParaElUsuario`). El NOT NULL de arriba daría un 23502 del motor, y
-- eso se traduce en un 422 genérico.
create or replace function public.registrar_factura_compra(
  p_pdf_path       text,
  p_items          jsonb,
  p_numero_factura text default null,
  p_proveedor_id   uuid default null,
  p_notas          text default null,
  p_creado_por     uuid default null,
  p_fecha_factura  date default null
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_factura_id       uuid;
  v_proveedor_nombre varchar(200);
  v_item             jsonb;
  v_producto_id      uuid;
  v_cantidad         integer;
  v_costo            numeric(10,4);
  v_iva_pct          numeric(4,2);
  v_nombre           varchar(200);
  v_total_unidades   integer := 0;
  -- acumuladores sin redondear; se redondean a 2 decimales al final
  v_base             numeric := 0;
  v_iva              numeric := 0;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La compra debe tener al menos una línea';
  end if;

  -- Lo único nuevo de la 069.
  if p_fecha_factura is null then
    raise exception 'La fecha de la factura es obligatoria: es un dato del libro registro de facturas recibidas';
  end if;

  -- Una factura del futuro es un error de tecleo, no un caso de negocio. Se
  -- rechaza aquí y no solo en el formulario porque una fecha mal puesta imputa
  -- el IVA soportado a otro trimestre.
  if p_fecha_factura > (now() at time zone 'Europe/Madrid')::date then
    raise exception 'La fecha de la factura no puede ser futura';
  end if;

  if p_proveedor_id is not null then
    select nombre into v_proveedor_nombre from proveedores where id = p_proveedor_id;
    if not found then
      raise exception 'Proveedor no encontrado';
    end if;
  end if;

  insert into facturas_compra (
    numero_factura, proveedor, proveedor_id, notas, pdf_path, creado_por, fecha_factura
  )
  values (
    p_numero_factura, v_proveedor_nombre, p_proveedor_id, p_notas, p_pdf_path,
    p_creado_por, p_fecha_factura
  )
  returning id into v_factura_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_producto_id := (v_item->>'producto_id')::uuid;
    v_cantidad    := (v_item->>'cantidad')::integer;
    v_costo       := (v_item->>'costo_unitario')::numeric;
    v_iva_pct     := (v_item->>'iva_pct')::numeric;

    if v_cantidad is null or v_cantidad <= 0 then
      raise exception 'Cantidad inválida en una línea de la compra';
    end if;
    if v_costo is null or v_costo < 0 then
      raise exception 'Costo unitario inválido en una línea de la compra';
    end if;
    if v_iva_pct is null or v_iva_pct not in (4, 10, 21) then
      raise exception 'El IVA de cada línea debe ser 4, 10 o 21';
    end if;

    update productos
    set stock_disponible = stock_disponible + v_cantidad,
        updated_at       = now()
    where id = v_producto_id
    returning nombre into v_nombre;

    if not found then
      raise exception 'Producto % no encontrado', v_producto_id;
    end if;

    insert into factura_compra_items (factura_id, producto_id, nombre_producto, cantidad, costo_unitario, iva_pct)
    values (v_factura_id, v_producto_id, v_nombre, v_cantidad, v_costo, v_iva_pct);

    v_total_unidades := v_total_unidades + v_cantidad;
    v_base           := v_base + (v_cantidad * v_costo);
    v_iva            := v_iva + (v_cantidad * v_costo * v_iva_pct / 100);
  end loop;

  update facturas_compra
  set total_unidades = v_total_unidades,
      total          = round(v_base, 2),
      total_iva      = round(v_iva, 2),
      total_con_iva  = round(v_base + v_iva, 2)
  where id = v_factura_id;

  return v_factura_id;
end;
$$;

-- `create or replace` no restablece los grants, pero se repite el revoke por
-- disciplina: la regla de la 062 es revocar a los tres y COMPROBARLO, sin dar
-- por hecho lo que hizo el REVOKE anterior.
revoke execute on function public.registrar_factura_compra(text, jsonb, text, uuid, text, uuid, date)
  from public, anon, authenticated;

do $comprobar$
begin
  if has_function_privilege('anon', 'public.registrar_factura_compra(text, jsonb, text, uuid, text, uuid, date)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.registrar_factura_compra(text, jsonb, text, uuid, text, uuid, date)', 'EXECUTE') then
    raise exception 'registrar_factura_compra sigue siendo ejecutable desde internet';
  end if;
end
$comprobar$;
