-- Migration: 060_revocar_tambien_a_public
--
-- La 059 no bastaba, y el motivo es el que hay que recordar.
--
-- ⚠️⚠️ EN POSTGRES, UNA FUNCIÓN NACE CON `EXECUTE` PARA **PUBLIC**.
--
-- `anon` y `authenticated` no tenían un permiso propio que quitar: lo heredaban
-- de PUBLIC. Así que `REVOKE ... FROM anon, authenticated` no revocó nada —
-- borró permisos que no existían— y las funciones siguieron llamándose igual
-- desde internet.
--
-- Se vio porque se PROBÓ después de aplicarla: la llamada anónima a
-- `desempaquetar_producto` seguía entrando en el cuerpo de la función. En el
-- ACL se lee a simple vista, y por eso conviene mirarlo y no fiarse del REVOKE:
--
--   desempaquetar_producto -> =X/postgres | postgres=X/... | service_role=X/...
--                             ^^^^^^^^^^^ ese "=X" sin nombre delante ES PUBLIC
--
--   reservar_carrito       -> postgres=X/... | service_role=X/...
--                             (sin "=X": aquí sí se revocó a PUBLIC en su día)
--
-- Las RPC antiguas del proyecto (reservar_carrito, confirmar_venta,
-- ajustar_stock, registrar_factura_compra) están bien: se les revocó a PUBLIC.
-- Lo que falló es que las funciones nuevas no heredaron la costumbre.
--
-- ⚠️ REGLA PARA LA PRÓXIMA RPC que no llame el navegador:
--    REVOKE EXECUTE ON FUNCTION <nombre>(<tipos>) FROM PUBLIC;
--    y comprobarlo con has_function_privilege('anon', ...), no dando por hecho
--    que el REVOKE hizo algo.

REVOKE EXECUTE ON FUNCTION public.desempaquetar_producto(uuid, uuid, integer, integer, uuid)
  FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.resumen_calificaciones(integer)
  FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.registrar_cambio_estado_pedido()
  FROM PUBLIC;

-- `mi_cargo` conserva su GRANT EXPLÍCITO a `authenticated` (lo llama
-- lib/auth/staff.ts con sesión iniciada). Al quitar el de PUBLIC, `anon` se
-- queda fuera y el staff sigue viendo su cargo.
REVOKE EXECUTE ON FUNCTION public.mi_cargo() FROM PUBLIC;
