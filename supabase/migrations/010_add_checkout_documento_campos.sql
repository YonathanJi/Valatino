-- Migration: 010_add_checkout_documento_campos (remoto: 20260703185206)
-- Añade columnas para snapshot de contacto en pedidos invitados + perfil

ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS email_cliente VARCHAR;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS documento_cliente VARCHAR;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS documento VARCHAR UNIQUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS telefono VARCHAR;