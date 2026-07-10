-- Migration: 009_make_direccion_envio_nullable (remoto: 20260703180939)
-- Permite pedidos sin direccion_envio_id (clientes invitados)

ALTER TABLE pedidos ALTER COLUMN direccion_envio_id DROP NOT NULL;