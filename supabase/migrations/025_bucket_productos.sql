-- 025: Bucket para imágenes de producto del catálogo.
-- Público en lectura (el storefront las muestra a cualquier visitante con la
-- URL pública, compatible con el optimizador de Next). Escritura sin policies:
-- solo el backend (service_role) sube imágenes vía POST /productos/imagen.

insert into storage.buckets (id, name, public)
values ('productos', 'productos', true)
on conflict (id) do nothing;
