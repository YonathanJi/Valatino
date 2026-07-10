-- Migration: 014_vincular_pedido_nuevo_y_backfill
-- Trigger BEFORE INSERT en pedidos + backfill histórico
-- Constitución: Principio III (defensa en BD)

-- 1. Función que vincula pedido nuevo con perfil existente
CREATE OR REPLACE FUNCTION vincular_pedido_nuevo()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_user_id UUID;
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.id INTO v_user_id
  FROM profiles p
  WHERE (NEW.documento_cliente IS NOT NULL AND p.documento = NEW.documento_cliente)
     OR (NEW.email_cliente IS NOT NULL AND p.email = NEW.email_cliente)
  LIMIT 1;

  IF v_user_id IS NOT NULL THEN
    NEW.user_id := v_user_id;
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Trigger BEFORE INSERT en pedidos
DROP TRIGGER IF EXISTS trg_vincular_pedido_nuevo ON pedidos;
CREATE TRIGGER trg_vincular_pedido_nuevo
  BEFORE INSERT ON pedidos
  FOR EACH ROW EXECUTE FUNCTION vincular_pedido_nuevo();

-- 3. Revocar EXECUTE público
REVOKE EXECUTE ON FUNCTION vincular_pedido_nuevo() FROM PUBLIC, anon, authenticated;

-- 4. Backfill: vincular pedidos huérfanos históricos
UPDATE pedidos ped
SET user_id = prof.id, updated_at = now()
FROM profiles prof
WHERE ped.user_id IS NULL
  AND (
    (ped.documento_cliente IS NOT NULL AND prof.documento = ped.documento_cliente)
    OR (ped.email_cliente IS NOT NULL AND prof.email = ped.email_cliente)
  );