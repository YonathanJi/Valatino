-- Migration: 011_fix_rls_reservas_carritos_inseguras
-- Cierra policies RLS inseguras (USING true / WITH CHECK true)
-- Constitución: Principio III - Seguridad en capas (RLS sin excepciones)

-- ============================================================
-- 1. STOCK_RESERVAS: reemplazar policies true
-- ============================================================
DROP POLICY IF EXISTS reservas_insert_system ON stock_reservas;
DROP POLICY IF EXISTS reservas_delete_system ON stock_reservas;

CREATE POLICY "reservas_insert_own" ON stock_reservas
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    OR session_id::TEXT = current_setting('request.jwt.claims', true)::jsonb->>'session_id'
  );

CREATE POLICY "reservas_delete_own" ON stock_reservas
  FOR DELETE USING (
    user_id = auth.uid()
    OR session_id::TEXT = current_setting('request.jwt.claims', true)::jsonb->>'session_id'
  );

CREATE POLICY "reservas_update_own" ON stock_reservas
  FOR UPDATE USING (
    user_id = auth.uid()
    OR session_id::TEXT = current_setting('request.jwt.claims', true)::jsonb->>'session_id'
  );

-- ============================================================
-- 2. CARRITOS: reemplazar carritos_insert_all insegura
-- ============================================================
DROP POLICY IF EXISTS carritos_insert_all ON carritos;

CREATE POLICY "carritos_insert_own" ON carritos
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    OR session_id::TEXT = current_setting('request.jwt.claims', true)::jsonb->>'session_id'
  );

-- ============================================================
-- 3. CARRITO_ITEMS: partir `carrito_items_write_own` en comandos separados
--    manteniendo `carrito_items_select_own` existente
-- ============================================================
DROP POLICY IF EXISTS carrito_items_write_own ON carrito_items;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'carrito_items'::regclass AND polname = 'carrito_items_insert_own'
  ) THEN
    CREATE POLICY "carrito_items_insert_own" ON carrito_items
      FOR INSERT WITH CHECK (
        EXISTS (
          SELECT 1 FROM carritos c
          WHERE c.id = carrito_items.carrito_id
            AND (c.user_id = auth.uid()
              OR c.session_id::TEXT = current_setting('request.jwt.claims', true)::jsonb->>'session_id')
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'carrito_items'::regclass AND polname = 'carrito_items_update_own'
  ) THEN
    CREATE POLICY "carrito_items_update_own" ON carrito_items
      FOR UPDATE USING (
        EXISTS (
          SELECT 1 FROM carritos c
          WHERE c.id = carrito_items.carrito_id
            AND (c.user_id = auth.uid()
              OR c.session_id::TEXT = current_setting('request.jwt.claims', true)::jsonb->>'session_id')
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'carrito_items'::regclass AND polname = 'carrito_items_delete_own'
  ) THEN
    CREATE POLICY "carrito_items_delete_own" ON carrito_items
      FOR DELETE USING (
        EXISTS (
          SELECT 1 FROM carritos c
          WHERE c.id = carrito_items.carrito_id
            AND (c.user_id = auth.uid()
              OR c.session_id::TEXT = current_setting('request.jwt.claims', true)::jsonb->>'session_id')
        )
      );
  END IF;
END $$;