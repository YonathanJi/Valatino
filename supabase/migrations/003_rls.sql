-- Migration: 003_rls.sql
-- Habilita RLS y define políticas de acceso por tabla

-- ============================================================
-- HELPER: obtener el rol del usuario actual
-- ============================================================

CREATE OR REPLACE FUNCTION get_user_role(uid UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  role_name TEXT;
BEGIN
  SELECT r.nombre INTO role_name
  FROM user_roles ur
  JOIN roles r ON r.id = ur.role_id
  WHERE ur.user_id = uid
  LIMIT 1;
  RETURN COALESCE(role_name, 'cliente');
END;
$$;

-- ============================================================
-- PRODUCTOS
-- ============================================================

ALTER TABLE productos ENABLE ROW LEVEL SECURITY;

-- Cualquier usuario puede ver productos activos
CREATE POLICY "productos_select_public" ON productos
  FOR SELECT USING (activo = true);

-- Admin y Asesor pueden ver todos los productos (incluyendo inactivos)
CREATE POLICY "productos_select_staff" ON productos
  FOR SELECT USING (
    get_user_role(auth.uid()) IN ('admin', 'asesor')
  );

-- Solo Admin puede crear, modificar o eliminar productos
CREATE POLICY "productos_insert_admin" ON productos
  FOR INSERT WITH CHECK (get_user_role(auth.uid()) = 'admin');

CREATE POLICY "productos_update_admin" ON productos
  FOR UPDATE USING (get_user_role(auth.uid()) = 'admin');

CREATE POLICY "productos_delete_admin" ON productos
  FOR DELETE USING (get_user_role(auth.uid()) = 'admin');

-- ============================================================
-- STOCK_RESERVAS
-- ============================================================

ALTER TABLE stock_reservas ENABLE ROW LEVEL SECURITY;

-- Usuario puede ver sus propias reservas (por user_id o session_id)
CREATE POLICY "reservas_select_own" ON stock_reservas
  FOR SELECT USING (
    user_id = auth.uid()
    OR session_id::TEXT = current_setting('request.jwt.claims', true)::jsonb->>'session_id'
  );

-- Cualquiera puede crear reservas (controlado por NestJS service_role)
CREATE POLICY "reservas_insert_system" ON stock_reservas
  FOR INSERT WITH CHECK (true);

CREATE POLICY "reservas_delete_system" ON stock_reservas
  FOR DELETE USING (true);

-- ============================================================
-- CARRITOS
-- ============================================================

ALTER TABLE carritos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "carritos_select_own" ON carritos
  FOR SELECT USING (
    user_id = auth.uid()
    OR session_id::TEXT = current_setting('request.jwt.claims', true)::jsonb->>'session_id'
  );

CREATE POLICY "carritos_insert_all" ON carritos
  FOR INSERT WITH CHECK (true);

CREATE POLICY "carritos_update_own" ON carritos
  FOR UPDATE USING (
    user_id = auth.uid()
    OR session_id::TEXT = current_setting('request.jwt.claims', true)::jsonb->>'session_id'
  );

CREATE POLICY "carritos_delete_own" ON carritos
  FOR DELETE USING (
    user_id = auth.uid()
    OR session_id::TEXT = current_setting('request.jwt.claims', true)::jsonb->>'session_id'
  );

-- ============================================================
-- CARRITO_ITEMS
-- ============================================================

ALTER TABLE carrito_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "carrito_items_select_own" ON carrito_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM carritos c
      WHERE c.id = carrito_items.carrito_id
        AND (c.user_id = auth.uid()
          OR c.session_id::TEXT = current_setting('request.jwt.claims', true)::jsonb->>'session_id')
    )
  );

CREATE POLICY "carrito_items_write_own" ON carrito_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM carritos c
      WHERE c.id = carrito_items.carrito_id
        AND (c.user_id = auth.uid()
          OR c.session_id::TEXT = current_setting('request.jwt.claims', true)::jsonb->>'session_id')
    )
  );

-- ============================================================
-- PEDIDOS
-- ============================================================

ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;

-- Clientes ven sus propios pedidos
CREATE POLICY "pedidos_select_own" ON pedidos
  FOR SELECT USING (user_id = auth.uid());

-- Admin y Asesor ven todos los pedidos
CREATE POLICY "pedidos_select_staff" ON pedidos
  FOR SELECT USING (get_user_role(auth.uid()) IN ('admin', 'asesor'));

-- Solo sistema (service_role) puede crear pedidos
CREATE POLICY "pedidos_insert_system" ON pedidos
  FOR INSERT WITH CHECK (true);

-- Admin y Asesor pueden actualizar el estado (NestJS valida las transiciones permitidas)
CREATE POLICY "pedidos_update_staff" ON pedidos
  FOR UPDATE USING (get_user_role(auth.uid()) IN ('admin', 'asesor'));

-- ============================================================
-- PEDIDO_ITEMS
-- ============================================================

ALTER TABLE pedido_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pedido_items_select_own" ON pedido_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM pedidos p
      WHERE p.id = pedido_items.pedido_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "pedido_items_select_staff" ON pedido_items
  FOR SELECT USING (get_user_role(auth.uid()) IN ('admin', 'asesor'));

CREATE POLICY "pedido_items_insert_system" ON pedido_items
  FOR INSERT WITH CHECK (true);

-- ============================================================
-- DIRECCIONES_ENVIO
-- ============================================================

ALTER TABLE direcciones_envio ENABLE ROW LEVEL SECURITY;

CREATE POLICY "direcciones_select_own" ON direcciones_envio
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "direcciones_insert_own" ON direcciones_envio
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "direcciones_update_own" ON direcciones_envio
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "direcciones_delete_own" ON direcciones_envio
  FOR DELETE USING (
    user_id = auth.uid()
    AND NOT EXISTS (
      SELECT 1 FROM pedidos p
      WHERE p.direccion_envio_id = direcciones_envio.id
        AND p.estado NOT IN ('ENTREGADO', 'CANCELADO')
    )
  );

-- ============================================================
-- TRANSACCIONES_PAGO
-- ============================================================

ALTER TABLE transacciones_pago ENABLE ROW LEVEL SECURITY;

CREATE POLICY "transacciones_select_admin" ON transacciones_pago
  FOR SELECT USING (get_user_role(auth.uid()) = 'admin');

CREATE POLICY "transacciones_insert_system" ON transacciones_pago
  FOR INSERT WITH CHECK (true);

-- ============================================================
-- USER_ROLES
-- ============================================================

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_roles_select_own" ON user_roles
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "user_roles_select_admin" ON user_roles
  FOR SELECT USING (get_user_role(auth.uid()) = 'admin');

CREATE POLICY "user_roles_write_admin" ON user_roles
  FOR ALL USING (get_user_role(auth.uid()) = 'admin');

-- ============================================================
-- ROLES (tabla de catálogo — solo lectura pública)
-- ============================================================

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "roles_select_all" ON roles
  FOR SELECT USING (true);

CREATE POLICY "roles_write_admin" ON roles
  FOR ALL USING (get_user_role(auth.uid()) = 'admin');

-- ============================================================
-- REALTIME: Habilitar publicación para Back-Office
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE pedidos;
