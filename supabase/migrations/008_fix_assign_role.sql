-- Migration: 008_fix_assign_role (remoto: 20260702191302)
-- Repara assign_default_role para que cualifique public. (evita search_path mutable)

CREATE OR REPLACE FUNCTION assign_default_role()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  cliente_role_id UUID;
BEGIN
  SELECT id INTO cliente_role_id FROM public.roles WHERE nombre = 'cliente';
  INSERT INTO public.user_roles (user_id, role_id) VALUES (NEW.id, cliente_role_id)
    ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;