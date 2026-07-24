-- 032: Flujo por capas RRHH → TI.
-- Gestión Humana contrata a la persona (empleado + cargo) SIN cuenta; después
-- TI le asigna correo/contraseña/módulos y vincula la cuenta. Por tanto:
--  - empleados.user_id pasa a ser OPCIONAL (empleado sin cuenta = pendiente de TI).
--  - la FK a auth.users pasa a ON DELETE SET NULL: borrar la cuenta desvincula al
--    empleado (la persona sigue en RRHH), no lo elimina.
--  - nuevo módulo 'ti' (dentro de él vive Usuarios).

alter table public.empleados
  drop constraint empleados_user_id_fkey;

alter table public.empleados
  alter column user_id drop not null;

alter table public.empleados
  add constraint empleados_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete set null;

alter table public.staff_modulos
  drop constraint staff_modulos_modulo_check;

alter table public.staff_modulos
  add constraint staff_modulos_modulo_check
  check (modulo in (
    'pedidos', 'catalogo', 'inventario', 'dashboard', 'compras', 'gestion_humana', 'ti'
  ));
