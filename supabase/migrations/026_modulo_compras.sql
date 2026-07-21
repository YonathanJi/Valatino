-- 026: El módulo 'facturas' pasa a llamarse 'compras' (compras de mercancía).
-- 'facturas' queda reservado para un futuro módulo de facturas de proveedores.
-- Las tablas facturas_compra / factura_compra_items y el bucket 'facturas'
-- conservan su nombre (una compra se documenta con su factura).

update public.staff_modulos set modulo = 'compras' where modulo = 'facturas';

alter table public.staff_modulos
  drop constraint staff_modulos_modulo_check;

alter table public.staff_modulos
  add constraint staff_modulos_modulo_check
  check (modulo in ('pedidos', 'catalogo', 'inventario', 'dashboard', 'compras'));
