-- Migration: 019_reembolsos_invitados_indices
-- 1. Nuevo estado REEMBOLSADO en pedido_estado.
-- 2. Snapshot de dirección de envío en pedidos (checkout de invitados que
--    no pueden tener filas en direcciones_envio).
-- 3. Tabla checkout_datos: datos del checkout persistidos por sesión para
--    que los webhooks reconstruyan el pedido sin depender de los límites
--    de metadata de Stripe/custom_id de PayPal.
-- 4. CHECK: todo pedido debe ser localizable (user_id o email_cliente).
-- 5. Índices para vinculación y búsqueda de productos.

-- ============================================================
-- 1. Estado REEMBOLSADO
-- ============================================================

ALTER TYPE pedido_estado ADD VALUE IF NOT EXISTS 'REEMBOLSADO';

-- ============================================================
-- 2. Snapshot de dirección en pedidos
-- ============================================================

ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS envio_nombre        VARCHAR(200);
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS envio_linea1        VARCHAR(300);
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS envio_linea2        VARCHAR(200);
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS envio_ciudad        VARCHAR(100);
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS envio_codigo_postal VARCHAR(10);
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS envio_provincia     VARCHAR(100);
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS envio_pais          CHAR(2);

-- ============================================================
-- 3. checkout_datos: staging de datos de checkout por sesión
--    Solo lo escribe/lee el backend (service_role). RLS sin policies.
-- ============================================================

CREATE TABLE IF NOT EXISTS checkout_datos (
  session_id  UUID PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email       VARCHAR(320),
  documento   VARCHAR(20),
  direccion_envio_id UUID REFERENCES direcciones_envio(id) ON DELETE SET NULL,
  direccion   JSONB,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE checkout_datos ENABLE ROW LEVEL SECURITY;
-- Sin policies: inaccesible para anon/authenticated; solo service_role.

-- Limpieza de datos de checkout viejos (>48h) junto al cron existente
SELECT cron.schedule(
  'limpiar-checkout-datos',
  '0 * * * *',
  $$ DELETE FROM checkout_datos WHERE updated_at < now() - INTERVAL '48 hours' $$
);

-- ============================================================
-- 4. Todo pedido debe ser localizable
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.pedidos'::regclass
      AND conname = 'pedidos_localizable_check'
  ) THEN
    ALTER TABLE pedidos ADD CONSTRAINT pedidos_localizable_check
      CHECK (user_id IS NOT NULL OR email_cliente IS NOT NULL);
  END IF;
END $$;

-- ============================================================
-- 5. Índices
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_pedidos_email_cliente
  ON pedidos (lower(email_cliente)) WHERE email_cliente IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pedidos_documento_cliente
  ON pedidos (documento_cliente) WHERE documento_cliente IS NOT NULL;

-- Búsqueda de productos por nombre (ILIKE '%term%')
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_productos_nombre_trgm
  ON productos USING gin (nombre gin_trgm_ops);
