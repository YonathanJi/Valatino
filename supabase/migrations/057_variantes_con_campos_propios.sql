-- ============================================================
-- 057 — Las variantes dejan de vivir en el nombre del producto
--
-- Rechazado por Jonathan al ir a usarlo, y con razón: sus productos se llaman
-- **«Quipitos Pops Caja 24 Unidades»** y **«Quipitos Pops C/U»**, no «Quipitos
-- Formato Caja 24».
--
-- ⚠️ EL PRINCIPIO: **forzar el nombre del producto para que el código pueda
-- parsearlo es hacerlo al revés.** El nombre es del negocio; que dos productos
-- sean el mismo artículo en dos presentaciones es un dato del sistema y tiene
-- que ser explícito. La convención `"Base Sabor X"` fue un atajo razonable
-- cuando solo había sabores y encajaba en el nombre; con los formatos dejó de
-- encajar, y eso era la señal.
--
--   familia       → qué los hace hermanos, y el título que ve el cliente
--                   ("Quipitos Pops")
--   variante      → la etiqueta de la pastilla que elige ("C/U", "Caja 24 unidades")
--   variante_tipo → solo decide si la ficha dice "Formato:" o "Sabor:"
--
-- Se agrupa **solo por familia**, sin exigir la misma categoría: si alguien
-- escribió la familia es que lo dijo a propósito, y obligar a que coincida la
-- categoría solo daría sorpresas silenciosas.
--
-- ⚠️ Siguen siendo PRODUCTOS INDEPENDIENTES con su stock. Esto cambia **cómo se
-- declara** el parentesco, no el modelo: un stock único con factores de
-- conversión seguiría entrando en `reservar_carrito`, `confirmar_venta` y los
-- reembolsos, y sigue descartado. La consecuencia también sigue: con 2 cajas y 0
-- unidades sueltas no se venden unidades hasta desempaquetar (056).
-- ============================================================

alter table public.productos
  add column if not exists familia       varchar(200),
  add column if not exists variante      varchar(100),
  add column if not exists variante_tipo varchar(20);

comment on column public.productos.familia is
  'Agrupa presentaciones del mismo articulo. Es el titulo que ve el cliente en la tarjeta y en la ficha. NULL = producto suelto.';
comment on column public.productos.variante is
  'Etiqueta de esta presentacion en el selector ("C/U", "Caja 24 unidades", "Fresa").';
comment on column public.productos.variante_tipo is
  'Solo afecta al texto del selector: "Formato: C/U" o "Sabor: Fresa".';

-- Los tres van juntos o ninguno: una familia sin variante pintaría una pastilla
-- vacía, y una variante sin familia no tiene con quién agruparse.
alter table public.productos
  drop constraint if exists productos_variante_completa_check;

alter table public.productos
  add constraint productos_variante_completa_check check (
    (familia is null and variante is null and variante_tipo is null)
    or (
      familia is not null and trim(familia) <> ''
      and variante is not null and trim(variante) <> ''
      and variante_tipo in ('sabor', 'formato')
    )
  );

-- Buscar los hermanos por familia, ignorando mayúsculas y espacios: «Quipitos
-- Pops» y «quipitos pops » son la misma familia, y admitir las dos partiría el
-- grupo en dos sin que nadie entendiera por qué.
create index if not exists productos_familia_idx
  on public.productos (lower(trim(familia)))
  where familia is not null;

-- ── Backfill de los que hoy siguen la convención en el nombre ───────────────
-- Se hace aquí y no se deja el parseo como respaldo: dos mecanismos para lo
-- mismo acaban divergiendo, y el que se olvida es el que falla.
--
-- Solo los que parten en DOS trozos con la palabra clave en medio, que es lo que
-- hacía `partirNombrePorVariante`. Los demás se quedan como productos sueltos,
-- igual que antes.
update public.productos p
set familia       = btrim(split_part(p.nombre, m.palabra, 1)),
    variante      = btrim(split_part(p.nombre, m.palabra, 2)),
    variante_tipo = m.tipo
from (values (' Sabor ', 'sabor'), (' Formato ', 'formato')) as m(palabra, tipo)
where p.familia is null
  and p.nombre ilike '%' || m.palabra || '%'
  and btrim(split_part(p.nombre, m.palabra, 1)) <> ''
  and btrim(split_part(p.nombre, m.palabra, 2)) <> ''
  and split_part(p.nombre, m.palabra, 3) = '';
