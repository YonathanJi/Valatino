-- 028: el costo unitario de compra admite 4 decimales (costos por unidad
-- derivados de precios por caja/lote). El total de la compra sigue en 2
-- decimales (importe monetario), redondeado al final de la suma.

alter table public.factura_compra_items
  alter column costo_unitario type numeric(10,4);

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
  v_nombre           varchar(200);
  v_total_unidades   integer := 0;
  -- acumulador sin redondear; se redondea a 2 decimales al final
  v_total            numeric := 0;
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

    if v_cantidad is null or v_cantidad <= 0 then
      raise exception 'Cantidad inválida en una línea de la compra';
    end if;
    if v_costo is null or v_costo < 0 then
      raise exception 'Costo unitario inválido en una línea de la compra';
    end if;

    update productos
    set stock_disponible = stock_disponible + v_cantidad,
        updated_at       = now()
    where id = v_producto_id
    returning nombre into v_nombre;

    if not found then
      raise exception 'Producto % no encontrado', v_producto_id;
    end if;

    insert into factura_compra_items (factura_id, producto_id, nombre_producto, cantidad, costo_unitario)
    values (v_factura_id, v_producto_id, v_nombre, v_cantidad, v_costo);

    v_total_unidades := v_total_unidades + v_cantidad;
    v_total          := v_total + (v_cantidad * v_costo);
  end loop;

  update facturas_compra
  set total_unidades = v_total_unidades,
      total          = round(v_total, 2)
  where id = v_factura_id;

  return v_factura_id;
end;
$$;

revoke execute on function public.registrar_factura_compra(text, jsonb, text, uuid, text, uuid)
  from public, anon, authenticated;
