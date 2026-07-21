-- 024: Facturas de compra — entrada de mercancía documentada.
-- Se sube el PDF de la factura del proveedor, se registran sus líneas
-- (producto + cantidad) y el stock se incrementa de forma atómica.
-- Queda un histórico consultable factura a factura desde el backoffice.

-- ============================================================
-- 1. 'facturas' pasa a ser un módulo asignable del backoffice
--    (admin siempre; asesores solo si se les otorga)
-- ============================================================

alter table public.staff_modulos
  drop constraint staff_modulos_modulo_check;

alter table public.staff_modulos
  add constraint staff_modulos_modulo_check
  check (modulo in ('pedidos', 'catalogo', 'inventario', 'dashboard', 'facturas'));

-- ============================================================
-- 2. Tablas del histórico
-- ============================================================

create table public.facturas_compra (
  id             uuid primary key default gen_random_uuid(),
  numero_factura varchar(100),
  proveedor      varchar(200),
  notas          text,
  -- ruta del PDF dentro del bucket privado 'facturas'
  pdf_path       text not null,
  total_unidades integer not null default 0,
  creado_por     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now()
);

create index facturas_compra_created_at_idx
  on public.facturas_compra (created_at desc);

create table public.factura_compra_items (
  id              uuid primary key default gen_random_uuid(),
  factura_id      uuid not null references public.facturas_compra (id) on delete cascade,
  producto_id     uuid not null references public.productos (id),
  -- snapshot del nombre: el histórico sobrevive a renombrados del catálogo
  nombre_producto varchar(200) not null,
  cantidad        integer not null check (cantidad > 0)
);

create index factura_compra_items_factura_idx
  on public.factura_compra_items (factura_id);

-- RLS sin policies: solo lee/escribe el backend (service_role vía NestJS)
alter table public.facturas_compra enable row level security;
alter table public.factura_compra_items enable row level security;

-- ============================================================
-- 3. RPC transaccional: factura + líneas + incremento de stock,
--    todo o nada (si una línea falla no queda nada a medias)
-- ============================================================

create or replace function public.registrar_factura_compra(
  p_pdf_path       text,
  p_items          jsonb,
  p_numero_factura text default null,
  p_proveedor      text default null,
  p_notas          text default null,
  p_creado_por     uuid default null
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_factura_id  uuid;
  v_item        jsonb;
  v_producto_id uuid;
  v_cantidad    integer;
  v_nombre      varchar(200);
  v_total       integer := 0;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La factura debe tener al menos una línea';
  end if;

  insert into facturas_compra (numero_factura, proveedor, notas, pdf_path, creado_por)
  values (p_numero_factura, p_proveedor, p_notas, p_pdf_path, p_creado_por)
  returning id into v_factura_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_producto_id := (v_item->>'producto_id')::uuid;
    v_cantidad    := (v_item->>'cantidad')::integer;

    if v_cantidad is null or v_cantidad <= 0 then
      raise exception 'Cantidad inválida en una línea de la factura';
    end if;

    -- Incremento atómico; falla (y revierte todo) si el producto no existe
    update productos
    set stock_disponible = stock_disponible + v_cantidad,
        updated_at       = now()
    where id = v_producto_id
    returning nombre into v_nombre;

    if not found then
      raise exception 'Producto % no encontrado', v_producto_id;
    end if;

    insert into factura_compra_items (factura_id, producto_id, nombre_producto, cantidad)
    values (v_factura_id, v_producto_id, v_nombre, v_cantidad);

    v_total := v_total + v_cantidad;
  end loop;

  update facturas_compra set total_unidades = v_total where id = v_factura_id;

  return v_factura_id;
end;
$$;

revoke execute on function public.registrar_factura_compra(text, jsonb, text, text, text, uuid)
  from public, anon, authenticated;

-- ============================================================
-- 4. Bucket privado para los PDF (idempotente). Sin policies en
--    storage.objects: solo service_role sube y firma URLs.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('facturas', 'facturas', false)
on conflict (id) do nothing;
