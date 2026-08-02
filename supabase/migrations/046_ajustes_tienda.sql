-- ============================================================
-- 046 — Los datos bancarios se editan desde el panel, no en Render
--
-- Nacieron como variables de entorno (045) y Jonathan preguntó si hacía falta.
-- La respuesta honesta es que no: las variables de entorno son para SECRETOS
-- —la clave de Stripe, la contraseña del SMTP—, cosas que nadie debe poder leer
-- ni cambiar desde la aplicación. Un IBAN de cobro no es un secreto: se le
-- enseña a cada cliente que compra. Es un dato del negocio, como los cargos o
-- las plantillas de permisos, que en este proyecto ya se editan desde el panel.
--
-- Y tenía un coste real: cambiar de cuenta obligaba a entrar en Render y
-- esperar un redespliegue, con los tokens revocados desde el 2026-07-25.
--
-- Las variables de entorno se conservan como RESPALDO (ver TransferenciaService):
-- si la tabla está vacía se usan ellas. Así la 045 sigue funcionando y quien
-- prefiera configurarlo por entorno puede hacerlo.
-- ============================================================

-- Una sola fila, garantizado por el tipo de la clave: `id` es booleano y el
-- CHECK obliga a que sea `true`, así que no puede haber una segunda.
create table if not exists public.ajustes_tienda (
  id boolean primary key default true check (id),

  transferencia_iban        text,
  transferencia_titular     text,
  transferencia_banco       text,
  -- Días laborables para pagar. Es también lo que el pedido retiene su stock,
  -- así que el tope existe: un plazo largo inmoviliza inventario.
  transferencia_dias_plazo  integer not null default 3
    check (transferencia_dias_plazo between 1 and 30),

  actualizado_por uuid references auth.users (id) on delete set null,
  updated_at      timestamptz not null default now()
);

comment on table public.ajustes_tienda is
  'Configuración del negocio editable desde el panel (TI → Ajustes). Una sola fila.';
comment on column public.ajustes_tienda.transferencia_iban is
  'Sin espacios y en mayúsculas. Vacío o NULL = no se ofrece el pago por transferencia.';

-- Solo la API con service_role. El IBAN se entrega al cliente por la ruta de
-- pago, ya con el concepto y el importe; no hace falta que nadie lo lea suelto.
alter table public.ajustes_tienda enable row level security;

drop trigger if exists trg_ajustes_tienda_updated_at on public.ajustes_tienda;
create trigger trg_ajustes_tienda_updated_at
  before update on public.ajustes_tienda
  for each row execute function set_updated_at();

-- La fila existe siempre, aunque vacía: así el panel edita en vez de tener que
-- decidir entre crear y actualizar, y la lectura nunca se encuentra sin nada.
insert into public.ajustes_tienda (id) values (true)
on conflict (id) do nothing;
