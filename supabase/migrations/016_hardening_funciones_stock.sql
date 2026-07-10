-- Migration: 016_hardening_funciones_stock
-- Asegura las funciones RPC de inventario:
--   1. reservar_stock ahora valida cantidad > 0, comprueba FOUND y devuelve
--      el UUID de la reserva creada (rollback preciso en checkout).
--   2. confirmar_stock acotado a los productos del pedido que se confirma
--      (evita fugas de inventario con reservas huérfanas de otros intentos).
--   3. ajustar_stock valida que el ajuste no deje stock negativo con un
--      mensaje claro.
--   4. REVOKE EXECUTE de anon/authenticated en las 4 funciones: solo el
--      backend (service_role) puede invocarlas. Antes eran invocables vía
--      /rest/v1/rpc/... con la anon key pública.

-- ============================================================
-- 1. reservar_stock: RETURNS UUID (id de la reserva) o NULL sin stock
-- ============================================================

DROP FUNCTION IF EXISTS reservar_stock(UUID, INTEGER, UUID, UUID);

CREATE FUNCTION reservar_stock(
  p_producto_id UUID,
  p_cantidad     INTEGER,
  p_session_id   UUID,
  p_user_id      UUID DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql
SET search_path = public, pg_temp AS $$
DECLARE
  v_stock_disponible INTEGER;
  v_reserva_id       UUID;
BEGIN
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RAISE EXCEPTION 'La cantidad a reservar debe ser mayor que cero';
  END IF;

  -- Bloquear la fila del producto para evitar race conditions
  SELECT stock_disponible INTO v_stock_disponible
  FROM productos
  WHERE id = p_producto_id AND activo = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto % no encontrado o inactivo', p_producto_id;
  END IF;

  IF v_stock_disponible < p_cantidad THEN
    RETURN NULL;
  END IF;

  -- Descontar del stock disponible y añadir a reservado
  UPDATE productos
  SET
    stock_disponible = stock_disponible - p_cantidad,
    stock_reservado  = stock_reservado + p_cantidad,
    updated_at       = now()
  WHERE id = p_producto_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se pudo actualizar el stock del producto %', p_producto_id;
  END IF;

  -- Crear la reserva temporal (TTL: 15 minutos)
  INSERT INTO stock_reservas (producto_id, user_id, session_id, cantidad, expires_at)
  VALUES (
    p_producto_id,
    p_user_id,
    p_session_id,
    p_cantidad,
    now() + INTERVAL '15 minutes'
  )
  RETURNING id INTO v_reserva_id;

  RETURN v_reserva_id;
END;
$$;

-- ============================================================
-- 2. confirmar_stock: acotado a los productos del pedido confirmado
-- ============================================================

DROP FUNCTION IF EXISTS confirmar_stock(UUID, UUID);

CREATE FUNCTION confirmar_stock(
  p_session_id   UUID,
  p_user_id      UUID DEFAULT NULL,
  p_producto_ids UUID[] DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql
SET search_path = public, pg_temp AS $$
BEGIN
  -- Decrementar stock_reservado solo de las reservas afectadas
  UPDATE productos p
  SET
    stock_reservado = GREATEST(0, p.stock_reservado - sr.cantidad),
    updated_at      = now()
  FROM stock_reservas sr
  WHERE sr.producto_id = p.id
    AND (
      (p_user_id IS NOT NULL AND sr.user_id = p_user_id)
      OR sr.session_id = p_session_id
    )
    AND (p_producto_ids IS NULL OR sr.producto_id = ANY (p_producto_ids));

  DELETE FROM stock_reservas
  WHERE (
      (p_user_id IS NOT NULL AND user_id = p_user_id)
      OR session_id = p_session_id
    )
    AND (p_producto_ids IS NULL OR producto_id = ANY (p_producto_ids));
END;
$$;

-- ============================================================
-- 3. ajustar_stock: validación y mensaje claro si quedaría negativo
-- ============================================================

CREATE OR REPLACE FUNCTION ajustar_stock(
  p_producto_id UUID,
  p_cantidad    INTEGER
)
RETURNS INTEGER LANGUAGE plpgsql
SET search_path = public, pg_temp AS $$
DECLARE
  v_stock_actual INTEGER;
  v_nuevo_stock  INTEGER;
BEGIN
  IF p_cantidad IS NULL OR p_cantidad = 0 THEN
    RAISE EXCEPTION 'La cantidad de ajuste no puede ser cero';
  END IF;

  SELECT stock_disponible INTO v_stock_actual
  FROM productos
  WHERE id = p_producto_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto % no encontrado', p_producto_id;
  END IF;

  IF v_stock_actual + p_cantidad < 0 THEN
    RAISE EXCEPTION 'El ajuste dejaría el stock en negativo (actual: %, ajuste: %)',
      v_stock_actual, p_cantidad;
  END IF;

  UPDATE productos
  SET
    stock_disponible = stock_disponible + p_cantidad,
    updated_at       = now()
  WHERE id = p_producto_id
  RETURNING stock_disponible INTO v_nuevo_stock;

  RETURN v_nuevo_stock;
END;
$$;

-- ============================================================
-- 4. Solo service_role puede invocar las funciones de stock
-- ============================================================

REVOKE EXECUTE ON FUNCTION reservar_stock(UUID, INTEGER, UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION confirmar_stock(UUID, UUID, UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION ajustar_stock(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION liberar_reserva(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
