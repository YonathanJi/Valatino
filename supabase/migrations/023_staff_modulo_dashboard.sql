-- 023: 'dashboard' pasa a ser un módulo asignable del backoffice.
-- El admin lo ve siempre; a los asesores se les otorga desde /backoffice/usuarios.

alter table public.staff_modulos
  drop constraint staff_modulos_modulo_check;

alter table public.staff_modulos
  add constraint staff_modulos_modulo_check
  check (modulo in ('pedidos', 'catalogo', 'inventario', 'dashboard'));
