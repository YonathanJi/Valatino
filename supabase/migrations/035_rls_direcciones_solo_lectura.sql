-- 035: Cierra la escritura directa de direcciones_envio vía PostgREST.
--
-- La migración 018 quitó las policies de escritura de carritos, pedidos,
-- pedido_items, transacciones y stock_reservas porque toda la escritura de
-- negocio pasa por NestJS con service_role. Las de direcciones_envio se
-- quedaron sin querer (venían de 003_rls.sql), y `direcciones_update_own` solo
-- tenía USING, sin WITH CHECK: un usuario autenticado podía hacer PATCH con la
-- anon key y cambiar `user_id` para colocarle una dirección a otra cuenta.
--
-- Las direcciones se gestionan por /direcciones en la API (que ya filtra por
-- user_id en cada operación), así que estas policies no habilitaban ningún
-- flujo legítimo. Se conservan las de SELECT: el cliente lee las suyas y el
-- staff las consulta para despachar.

drop policy if exists direcciones_insert_own on public.direcciones_envio;
drop policy if exists direcciones_update_own on public.direcciones_envio;
drop policy if exists direcciones_delete_own on public.direcciones_envio;
