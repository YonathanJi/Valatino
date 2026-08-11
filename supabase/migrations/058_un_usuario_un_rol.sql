-- Migration: 058_un_usuario_un_rol
--
-- Un usuario, un rol — y que lo garantice la BD, no la aplicación.
--
-- POR QUÉ
--
-- La PK era (user_id, role_id), así que la tabla ADMITE que un usuario tenga
-- 'cliente' y 'admin' a la vez. Lo único que lo impedía era que la aplicación
-- borrase antes de insertar (usuarios.controller.ts: «reemplazar = borrar +
-- insertar garantiza un único rol por usuario»).
--
-- Es la misma lección de la 055 con el número de factura: una restricción que
-- depende de que la aplicación se acuerde NO es una restricción. Aquí además
-- el borrado previo no comprobaba su error, así que un delete fallido dejaba
-- dos filas y nadie se enteraba.
--
-- Y con dos filas el rol se volvía indeterminado: tanto get_user_role() como
-- JwtStrategy leían con LIMIT 1 SIN ORDER BY, o sea, el rol que devolviera
-- Postgres primero. Un usuario con dos roles podía entrar como admin.
--
-- QUÉ CAMBIA
--
-- PRIMARY KEY (user_id, role_id) -> PRIMARY KEY (user_id).
-- A partir de aquí, un segundo rol para el mismo usuario es un 23505.
--
-- SEGURO DE APLICAR: nada referencia a user_roles por FK, y las tres políticas
-- RLS filtran por user_id / get_user_role(), no por la PK.

-- Si alguien ya tuviera dos roles, esto NO elige uno: aborta y lo deja ver.
-- Escoger por nosotros sería adivinar cuál de los dos era el bueno.
DO $$
DECLARE
  v_duplicados INT;
  v_detalle    TEXT;
BEGIN
  SELECT count(*), string_agg(user_id::text, ', ')
    INTO v_duplicados, v_detalle
  FROM (
    SELECT user_id FROM public.user_roles GROUP BY user_id HAVING count(*) > 1
  ) d;

  IF v_duplicados > 0 THEN
    RAISE EXCEPTION
      'Hay % usuario(s) con más de un rol (%). Déjalos con uno solo antes de aplicar la 058.',
      v_duplicados, v_detalle;
  END IF;
END $$;

ALTER TABLE public.user_roles DROP CONSTRAINT user_roles_pkey;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_pkey PRIMARY KEY (user_id);

COMMENT ON CONSTRAINT user_roles_pkey ON public.user_roles IS
  'Un usuario, un rol. La autorización se decide con esta fila: dos filas harían '
  'el rol indeterminado (ver 058).';
