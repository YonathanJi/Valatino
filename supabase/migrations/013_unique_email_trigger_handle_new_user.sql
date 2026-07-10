-- Migration: 013_unique_email_trigger_handle_new_user
-- Email único en profiles + trigger handle_new_user + backfill
-- Constitución: Principio III - Seguridad en capas (defensa en BD)

-- 0. La columna email se creó manualmente en remoto; garantizar existencia
--    para que un rebuild desde cero sea reproducible.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email VARCHAR;

-- 1. UNIQUE constraint en profiles.email
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.profiles'::regclass AND conname='profiles_email_key'
  ) THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_email_key UNIQUE (email);
  END IF;
END $$;

-- 2. Función handle_new_user: sincroniza profiles desde auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO profiles (id, email, nombre, telefono, documento)
  VALUES (
    NEW.id,
    NEW.email,
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

-- 3. Trigger AFTER INSERT OR UPDATE ON auth.users
DROP TRIGGER IF EXISTS trg_handle_new_user ON auth.users;
CREATE TRIGGER trg_handle_new_user
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. Backfill: insertar profiles para usuarios existentes sin ella
INSERT INTO profiles (id, email, nombre, telefono, documento)
SELECT
  u.id,
  u.email,
  u.raw_user_meta_data->>'nombre' AS nombre,
  u.raw_user_meta_data->>'telefono' AS telefono,
  u.raw_user_meta_data->>'documento' AS documento
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = u.id)
ON CONFLICT (id) DO NOTHING;

-- Refrescar updated_at de las filas creadas por backfill
UPDATE profiles SET updated_at = now()
WHERE id IN (
  SELECT u.id FROM auth.users u
  WHERE NOT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = u.id AND p.updated_at IS DISTINCT FROM now()
  )
);