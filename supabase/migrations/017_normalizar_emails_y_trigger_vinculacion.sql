-- Migration: 017_normalizar_emails_y_trigger_vinculacion
-- 1. Todos los emails se normalizan a minúsculas en escritura y comparación
--    (antes 'Cliente@X.com' y 'cliente@x.com' no se vinculaban entre sí).
-- 2. Se adjunta el trigger de vinculación de pedidos huérfanos a `profiles`
--    (la función existía pero no tenía ningún trigger que la ejecutara).

-- ============================================================
-- 1. Backfill: normalizar datos existentes
-- ============================================================

UPDATE profiles SET email = lower(email)
WHERE email IS NOT NULL AND email <> lower(email);

UPDATE pedidos SET email_cliente = lower(email_cliente)
WHERE email_cliente IS NOT NULL AND email_cliente <> lower(email_cliente);

-- Índice único funcional: defensa contra duplicados por mayúsculas
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_email_lower
  ON profiles (lower(email)) WHERE email IS NOT NULL;

-- ============================================================
-- 2. handle_new_user: guardar email en minúsculas
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO profiles (id, email, nombre, telefono, documento)
  VALUES (
    NEW.id,
    lower(NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'nombre', NULL),
    COALESCE(NEW.raw_user_meta_data->>'telefono', NULL),
    COALESCE(NEW.raw_user_meta_data->>'documento', NULL)
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        nombre = COALESCE(EXCLUDED.nombre, profiles.nombre),
        telefono = COALESCE(EXCLUDED.telefono, profiles.telefono),
        documento = COALESCE(EXCLUDED.documento, profiles.documento),
        updated_at = now();
  RETURN NEW;
END;
$$;

-- Evitar upserts innecesarios en cada login: solo disparar cuando cambian
-- los datos relevantes.
DROP TRIGGER IF EXISTS trg_handle_new_user ON auth.users;
CREATE TRIGGER trg_handle_new_user
  AFTER INSERT OR UPDATE OF email, raw_user_meta_data ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 3. vincular_pedido_nuevo: comparación case-insensitive
-- ============================================================

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

  -- Normalizar el snapshot del pedido
  NEW.email_cliente := lower(NEW.email_cliente);

  SELECT p.id INTO v_user_id
  FROM profiles p
  WHERE lower(p.email) = NEW.email_cliente
  LIMIT 1;

  IF v_user_id IS NOT NULL THEN
    NEW.user_id := v_user_id;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- 4. vincular_pedidos_por_documento: soporta INSERT y UPDATE + lower()
--    y se adjunta a un trigger real en profiles (antes era huérfana)
-- ============================================================

CREATE OR REPLACE FUNCTION vincular_pedidos_por_documento()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_old_email     TEXT := NULL;
  v_old_documento TEXT := NULL;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_old_email     := OLD.email;
    v_old_documento := OLD.documento;
  END IF;

  IF NEW.email IS NOT NULL
     AND (v_old_email IS NULL OR lower(v_old_email) <> lower(NEW.email)) THEN
    UPDATE pedidos
    SET user_id = NEW.id, updated_at = now()
    WHERE lower(email_cliente) = lower(NEW.email) AND user_id IS NULL;
  END IF;

  IF NEW.documento IS NOT NULL
     AND (v_old_documento IS NULL OR v_old_documento <> NEW.documento) THEN
    UPDATE pedidos
    SET user_id = NEW.id, updated_at = now()
    WHERE documento_cliente = NEW.documento AND user_id IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vincular_pedidos ON profiles;
CREATE TRIGGER trg_vincular_pedidos
  AFTER INSERT OR UPDATE OF email, documento ON profiles
  FOR EACH ROW EXECUTE FUNCTION vincular_pedidos_por_documento();

REVOKE EXECUTE ON FUNCTION vincular_pedidos_por_documento() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION vincular_pedido_nuevo() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION handle_new_user() FROM PUBLIC, anon, authenticated;
