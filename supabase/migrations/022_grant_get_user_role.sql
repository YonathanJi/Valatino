-- 022: Restaurar EXECUTE de get_user_role para anon/authenticated
--
-- El endurecimiento de la migración 016 revocó EXECUTE de las funciones
-- SECURITY DEFINER a anon/authenticated, pero get_user_role se usa dentro
-- de las policies RLS (user_roles, roles, etc.), que se evalúan con los
-- permisos del rol que consulta. Sin el grant, cualquier SELECT de un
-- usuario autenticado sobre esas tablas falla con:
--   42501 permission denied for function get_user_role
-- (p.ej. el login del panel /admin no podía leer el rol y rechazaba al admin).
--
-- La función solo lee el nombre del rol de un uid; concederla es seguro.

grant execute on function public.get_user_role(uuid) to authenticated, anon;
