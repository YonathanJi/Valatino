-- Migration: 005_functions.sql
-- Funciones RPC para operaciones atómicas de inventario

-- ============================================================
-- reservar_stock: reserva atómica con bloqueo pesimista
-- ============================================================

CREATE OR REPLACE FUNCTION reservar_stock(
  p_producto_id UUID,
  p_cantidad     INTEGER,
  p_session_id   UUID,
  p_user_id      UUID DEFAULT NULL
)
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE
  v_stock_disponible INTEGER;
BEGIN
  -- Bloquear la fila del producto para evitar race conditions
  SELECT stock_disponible INTO v_stock_disponible
  FROM productos
  WHERE id = p_producto_id
  FOR UPDATE;

  IF v_stock_disponible < p_cantidad THEN
    RETURN FALSE;
  END IF;

  -- Descontar del stock disponible y añadir a reservado
  UPDATE productos
  SET
    stock_disponible = stock_disponible - p_cantidad,
    stock_reservado  = stock_reservado + p_cantidad,
    updated_at       = now()
  WHERE id = p_producto_id;

  -- Crear la reserva temporal (TTL: 15 minutos)
  INSERT INTO stock_reservas (producto_id, user_id, session_id, cantidad, expires_at)
  VALUES (
    p_producto_id,
    p_user_id,
    p_session_id,
    p_cantidad,
    now() + INTERVAL '15 minutes'
  );

  RETURN TRUE;
END;
$$;

-- ============================================================
-- confirmar_stock: convierte reserva en venta definitiva (Hard Stock)
-- Llamado tras webhook exitoso de pago
-- ============================================================

CREATE OR REPLACE FUNCTION confirmar_stock(
  p_session_id UUID,
  p_user_id    UUID DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  -- Eliminar las reservas y decrementar stock_reservado
  -- (stock_disponible ya fue decrementado al crear la reserva)
  UPDATE productos p
  SET
    stock_reservado = GREATEST(0, p.stock_reservado - sr.cantidad),
    updated_at      = now()
  FROM stock_reservas sr
  WHERE sr.producto_id = p.id
    AND (
      (p_user_id IS NOT NULL AND sr.user_id = p_user_id)
      OR sr.session_id = p_session_id
    );

  DELETE FROM stock_reservas
  WHERE (p_user_id IS NOT NULL AND user_id = p_user_id)
    OR session_id = p_session_id;
END;
$$;

-- ============================================================
-- ajustar_stock: incremento/decremento atomico de stock
-- ============================================================

CREATE OR REPLACE FUNCTION ajustar_stock(
  p_producto_id UUID,
  p_cantidad    INTEGER
)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  v_nuevo_stock INTEGER;
BEGIN
  UPDATE productos
  SET
    stock_disponible = stock_disponible + p_cantidad,
    updated_at       = now()
  WHERE id = p_producto_id
  RETURNING stock_disponible INTO v_nuevo_stock;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto no encontrado';
  END IF;

  RETURN v_nuevo_stock;
END;
$$;
