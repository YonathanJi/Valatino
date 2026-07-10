-- Migration: 006_liberar_reserva (remoto: 20260702182154)
-- RPC para liberar reservas en rollback de checkout

CREATE OR REPLACE FUNCTION liberar_reserva(
  p_producto_id UUID,
  p_cantidad    INTEGER
)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  UPDATE productos
  SET
    stock_disponible = stock_disponible + p_cantidad,
    stock_reservado  = GREATEST(0, stock_reservado - p_cantidad),
    updated_at       = now()
  WHERE id = p_producto_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto no encontrado';
  END IF;
END;
$$;