-- Migration: 012_fix_rls_pedidos_rpc_search_path
-- Cierra warnings de advisors (Constitución: Principio III - Seguridad en capas)

-- ============================================================
-- A. Policies INSERT inseguras en pedidos/pedido_items/transacciones
--    NestJS inserta con service_role (bypassa RLS), por lo que las
--    policies `*_insert_system` con `WITH CHECK (true)` sólo abrían
--    inserts anónimos ajenos vía PostgREST.
-- ============================================================
DROP POLICY IF EXISTS pedidos_insert_system ON pedidos;
DROP POLICY IF EXISTS pedido_items_insert_system ON pedido_items;
DROP POLICY IF EXISTS transacciones_insert_system ON transacciones_pago;

CREATE POLICY "pedidos_insert_own" ON pedidos
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "pedido_items_insert_own" ON pedido_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM pedidos p
      WHERE p.id = pedido_items.pedido_id
        AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "transacciones_insert_admin" ON transacciones_pago
  FOR INSERT WITH CHECK (get_user_role(auth.uid()) IN ('admin'));

-- ============================================================
-- B. Revocar EXECUTE en funciones SECURITY DEFINER internas
--    Estas funciones están pensadas para uso interno (triggers / policies),
--    no para ser llamadas vía /rest/v1/rpc/...
-- ============================================================
REVOKE EXECUTE ON FUNCTION assign_default_role() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION get_user_role(UUID) FROM PUBLIC, anon, authenticated;

-- vincular_pedidos_por_documento se creó manualmente en remoto antes de
-- quedar versionada (015). Guard para que un rebuild desde cero no falle.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'vincular_pedidos_por_documento'
  ) THEN
    REVOKE EXECUTE ON FUNCTION vincular_pedidos_por_documento() FROM PUBLIC, anon, authenticated;
  END IF;
END $$;

-- ============================================================
-- C. Fijar search_path en SECURITY DEFINER functions
--    Mitiga hijacking de search_path (CSRF-style en DB)
-- ============================================================
ALTER FUNCTION public.set_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.assign_default_role() SET search_path = public, pg_temp;
ALTER FUNCTION public.get_user_role(UUID) SET search_path = public, pg_temp;
ALTER FUNCTION public.reservar_stock(UUID, INTEGER, UUID, UUID) SET search_path = public, pg_temp;
ALTER FUNCTION public.confirmar_stock(UUID, UUID) SET search_path = public, pg_temp;
ALTER FUNCTION public.ajustar_stock(UUID, INTEGER) SET search_path = public, pg_temp;
ALTER FUNCTION public.liberar_reserva(UUID, INTEGER) SET search_path = public, pg_temp;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'vincular_pedidos_por_documento'
  ) THEN
    ALTER FUNCTION public.vincular_pedidos_por_documento() SET search_path = public, pg_temp;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'handle_new_user'
  ) THEN
    ALTER FUNCTION public.handle_new_user() SET search_path = public, pg_temp;
  END IF;
END $$;