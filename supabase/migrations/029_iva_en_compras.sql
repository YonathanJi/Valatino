-- 029: IVA por línea en las compras de mercancía.
-- Cada línea lleva su tipo de IVA (4, 10 o 21). La RPC calcula base
-- imponible, cuota de IVA y total con IVA en la misma transacción.
-- `total` conserva su semántica (base sin IVA); compras anteriores quedan
-- con iva_pct/total_iva/total_con_iva a NULL.

alter table public.factura_compra_items
  add column iva_pct numeric(4,2) check (iva_pct in (4, 10, 21));

alter table public.facturas_compra
  add column total_iva numeric(12,2),
  add column total_con_iva numeric(12,2);

create or replace function public.registrar_factura_compra(
  p_pdf_path       text,
  p_items          jsonb,
  p_numero_factura text default null,
  p_proveedor_id   uuid default null,
  p_notas          text default null,
  p_creado_por     uuid default null
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

  if p_proveedor_id is not null then
    select nombre into v_proveedor_nombre from proveedores where id = p_proveedor_id;
    if not found then
      raise exception 'Proveedor no encontrado';
    end if;
  end if;

  insert into facturas_compra (numero_factura, proveedor, proveedor_id, notas, pdf_path, creado_por)
  values (p_numero_factura, v_proveedor_nombre, p_proveedor_id, p_notas, p_pdf_path, p_creado_por)
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

revoke execute on function public.registrar_factura_compra(text, jsonb, text, uuid, text, uuid)
  from public, anon, authenticated;
