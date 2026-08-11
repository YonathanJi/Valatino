-- Migration: 059_rpc_internas_fuera_de_la_api_publica
--
-- Las RPC internas dejan de estar al alcance de la clave pública.
--
-- ⚠️ EL HALLAZGO, y no es teórico: se comprobó contra producción.
--
-- `desempaquetar_producto` es SECURITY DEFINER y quedó con EXECUTE para `anon`
-- y `authenticated`, así que se podía llamar desde internet por
-- `/rest/v1/rpc/desempaquetar_producto` con la clave anon — que **es pública**:
-- va dentro del bundle de la web, se lee con ver el código fuente.
--
-- Y esa función MUEVE INVENTARIO: −1 caja → +N unidades. Los UUID de producto
-- también son públicos (los sirve el catálogo), así que cualquiera podía
-- deshacer cajas hasta dejar el stock descuadrado. Al ser SECURITY DEFINER
-- corre con los permisos del dueño, de modo que el RLS no la frenaba.
--
-- Se verificó llamándola con `p_bultos = 0`, que la propia función rechaza
-- antes de tocar nada: respondió con su mensaje de validación, no con un error
-- de permisos. Es decir, el permiso estaba y se entraba en el cuerpo.
--
-- La práctica de revocar EXECUTE ya existía en este proyecto para las RPC
-- internas; lo que pasó es que las funciones nuevas (la 056 de desempaquetar y
-- la 042 de calificaciones) no la heredaron. Por eso aquí se revoca por lista
-- explícita y se deja dicho que toda RPC nueva que no llame el navegador tiene
-- que terminar igual.

-- ── Solo las llama la API con service_role, que ignora estos permisos ──

REVOKE EXECUTE ON FUNCTION public.desempaquetar_producto(uuid, uuid, integer, integer, uuid)
  FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.resumen_calificaciones(integer)
  FROM anon, authenticated;

-- Función de TRIGGER: se invoca por el disparador, que no comprueba el EXECUTE
-- de quien hizo el INSERT. Estaba expuesta por descuido y llamarla por REST no
-- serviría de nada, pero no tiene por qué figurar en la API pública.
REVOKE EXECUTE ON FUNCTION public.registrar_cambio_estado_pedido()
  FROM anon, authenticated;

-- ── `mi_cargo` sí la llama el navegador, pero solo con sesión ──
--
-- lib/auth/staff.ts la usa para el nombre del cargo, y únicamente cuando ya hay
-- usuario y es admin o asesor. `authenticated` la conserva; `anon` no la
-- necesita para nada (le devolvería vacío) y no pinta en la API pública.
REVOKE EXECUTE ON FUNCTION public.mi_cargo() FROM anon;

-- ── Lo que NO se toca, y por qué ──
--
-- `get_user_role(uuid)` se queda con sus permisos A PROPÓSITO.
--
-- La usan ONCE POLÍTICAS RLS de ocho tablas (productos, pedidos, pedido_items,
-- direcciones_envio, transacciones_pago, roles, user_roles). Las políticas se
-- evalúan con el rol de quien consulta, así que si `authenticated` pierde el
-- EXECUTE, cualquier lectura de esas tablas desde el navegador —y la web lee
-- `user_roles` y `profiles` con la sesión del usuario— puede reventar con un
-- error de permisos al evaluar la política.
--
-- Y sería peor que un fallo limpio: Postgres no garantiza el orden de
-- evaluación de las políticas permisivas, así que con un cortocircuito
-- funcionaría a veces y a veces no.
--
-- Lo que expone es acotado: hay que conocer ya el UUID de una cuenta y solo
-- devuelve el nombre de su rol. Quitarlo bien exige repasar cada consulta que
-- la web hace contra Supabase, y eso es trabajo aparte y con su propia prueba.

COMMENT ON FUNCTION public.desempaquetar_producto(uuid, uuid, integer, integer, uuid) IS
  'Solo para la API (service_role). EXECUTE revocado a anon/authenticated en la 059: mueve inventario y la clave anon es publica.';
