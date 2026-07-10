-- Migration: 018_endurecer_rls_escrituras
-- Toda la escritura de negocio (carritos, reservas, pedidos, transacciones)
-- pasa exclusivamente por NestJS con service_role (que bypassa RLS).
-- Las policies de INSERT/UPDATE/DELETE para anon/authenticated no protegían
-- ningún flujo legítimo y sí abrían vías de fraude vía PostgREST:
--   - crear pedidos falsos ya "ENTREGADOS" sin pagar,
--   - inyectar pedido_items con precios arbitrarios,
--   - manipular stock_reservas sin tocar productos.stock_*.
-- Se eliminan todas; se conservan las policies de SELECT.

-- ============================================================
-- 1. PEDIDOS / PEDIDO_ITEMS / TRANSACCIONES: sin escritura de cliente
-- ============================================================

DROP POLICY IF EXISTS pedidos_insert_own ON pedidos;
DROP POLICY IF EXISTS pedidos_update_staff ON pedidos;
DROP POLICY IF EXISTS pedido_items_insert_own ON pedido_items;
DROP POLICY IF EXISTS transacciones_insert_admin ON transacciones_pago;

-- ============================================================
-- 2. STOCK_RESERVAS: sin escritura de cliente (solo RPC vía backend)
-- ============================================================

DROP POLICY IF EXISTS reservas_insert_own ON stock_reservas;
DROP POLICY IF EXISTS reservas_update_own ON stock_reservas;
DROP POLICY IF EXISTS reservas_delete_own ON stock_reservas;

-- ============================================================
-- 3. CARRITOS / CARRITO_ITEMS: sin escritura de cliente
--    (el carrito se gestiona 100% vía API NestJS con cookie de sesión)
-- ============================================================

DROP POLICY IF EXISTS carritos_insert_own ON carritos;
DROP POLICY IF EXISTS carritos_update_own ON carritos;
DROP POLICY IF EXISTS carritos_delete_own ON carritos;
DROP POLICY IF EXISTS carrito_items_insert_own ON carrito_items;
DROP POLICY IF EXISTS carrito_items_update_own ON carrito_items;
DROP POLICY IF EXISTS carrito_items_delete_own ON carrito_items;

-- ============================================================
-- 4. DIRECCIONES: staff puede consultar direcciones para despachar pedidos
-- ============================================================

DROP POLICY IF EXISTS direcciones_select_staff ON direcciones_envio;
CREATE POLICY "direcciones_select_staff" ON direcciones_envio
  FOR SELECT USING (get_user_role(auth.uid()) IN ('admin', 'asesor'));

-- ============================================================
-- 5. ROLES: restringir lectura del catálogo a usuarios autenticados
-- ============================================================

DROP POLICY IF EXISTS roles_select_all ON roles;
CREATE POLICY "roles_select_authenticated" ON roles
  FOR SELECT TO authenticated USING (true);
