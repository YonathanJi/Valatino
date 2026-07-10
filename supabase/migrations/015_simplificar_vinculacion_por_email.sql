-- Migration: 015_simplificar_vinculacion_por_email
-- Simplifica vinculación: email como única identidad (OTP passwordless)
-- Constitución: Principio III

-- 1. Simplificar trigger BEFORE INSERT en pedidos (solo email)
CREATE OR REPLACE FUNCTION vincular_pedido_nuevo()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_user_id UUID;
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.email_cliente IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.id INTO v_user_id
  FROM profiles p
  WHERE p.email = NEW.email_cliente
  LIMIT 1;

  IF v_user_id IS NOT NULL THEN
    NEW.user_id := v_user_id;
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Ampliar vincular_pedidos_por_documento para también cubrir email
CREATE OR REPLACE FUNCTION vincular_pedidos_por_documento()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.email IS NOT NULL AND (OLD.email IS NULL OR OLD.email <> NEW.email) THEN
    UPDATE pedidos
    SET user_id = NEW.id, updated_at = now()
    WHERE email_cliente = NEW.email AND user_id IS NULL;
  END IF;
  IF NEW.documento IS NOT NULL AND (OLD.documento IS NULL OR OLD.documento <> NEW.documento) THEN
    UPDATE pedidos
    SET user_id = NEW.id, updated_at = now()
    WHERE documento_cliente = NEW.documento AND user_id IS NULL;
  END IF;
  RETURN NEW;
END;
$$;