-- Migration: 002_schema.sql
-- Define enums, tablas y relaciones del modelo de datos completo

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE pedido_estado AS ENUM (
  'PENDIENTE_PAGO',
  'PROCESANDO',
  'ENVIADO',
  'ENTREGADO',
  'CANCELADO'
);

-- ============================================================
-- ROLES (RBAC)
-- ============================================================

CREATE TABLE roles (
  id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      VARCHAR(50) NOT NULL UNIQUE,
  descripcion TEXT
);

INSERT INTO roles (nombre, descripcion) VALUES
  ('admin',   'Acceso total al sistema'),
  ('asesor',  'Acceso de solo lectura a pedidos y soporte operativo'),
  ('cliente', 'Cliente registrado de la tienda');

CREATE TABLE user_roles (
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id      UUID NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  asignado_por UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_id)
);

-- ============================================================
-- PRODUCTOS
-- ============================================================

CREATE TABLE productos (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre           VARCHAR(200) NOT NULL,
  descripcion      TEXT,
  precio           NUMERIC(10,2) NOT NULL CHECK (precio > 0),
  imagenes         TEXT[] NOT NULL DEFAULT '{}',
  categoria        VARCHAR(100) NOT NULL,
  stock_disponible INTEGER NOT NULL DEFAULT 0 CHECK (stock_disponible >= 0),
  stock_reservado  INTEGER NOT NULL DEFAULT 0 CHECK (stock_reservado >= 0),
  activo           BOOLEAN NOT NULL DEFAULT true,
  slug             VARCHAR(250) UNIQUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_productos_activo ON productos(activo);
CREATE INDEX idx_productos_categoria ON productos(categoria);

-- ============================================================
-- RESERVAS DE STOCK (SOFT ALLOCATION)
-- ============================================================

CREATE TABLE stock_reservas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id  UUID NOT NULL,
  cantidad    INTEGER NOT NULL CHECK (cantidad > 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '15 minutes')
);

CREATE INDEX idx_stock_reservas_expires_at ON stock_reservas(expires_at);
CREATE INDEX idx_stock_reservas_session ON stock_reservas(session_id);

-- ============================================================
-- CARRITOS
-- ============================================================

CREATE TABLE carritos (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_carritos_user_id ON carritos(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_carritos_session_id ON carritos(session_id);

CREATE TABLE carrito_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carrito_id      UUID NOT NULL REFERENCES carritos(id) ON DELETE CASCADE,
  producto_id     UUID NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
  cantidad        INTEGER NOT NULL CHECK (cantidad > 0),
  precio_unitario NUMERIC(10,2) NOT NULL CHECK (precio_unitario > 0),
  UNIQUE (carrito_id, producto_id)
);

-- ============================================================
-- DIRECCIONES DE ENVÍO
-- ============================================================

CREATE TABLE direcciones_envio (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre_destinatario VARCHAR(200) NOT NULL,
  linea1              VARCHAR(300) NOT NULL,
  linea2              VARCHAR(200),
  ciudad              VARCHAR(100) NOT NULL,
  codigo_postal       VARCHAR(10) NOT NULL,
  provincia           VARCHAR(100) NOT NULL,
  pais                CHAR(2) NOT NULL DEFAULT 'ES',
  es_predeterminada   BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_direcciones_user_id ON direcciones_envio(user_id);

-- ============================================================
-- PEDIDOS
-- ============================================================

CREATE TABLE pedidos (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  estado              pedido_estado NOT NULL DEFAULT 'PENDIENTE_PAGO',
  total               NUMERIC(10,2) NOT NULL CHECK (total > 0),
  metodo_pago         VARCHAR(20) NOT NULL CHECK (metodo_pago IN ('stripe', 'paypal')),
  referencia_pago     VARCHAR(200),
  direccion_envio_id  UUID NOT NULL REFERENCES direcciones_envio(id) ON DELETE RESTRICT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pedidos_user_id ON pedidos(user_id);
CREATE INDEX idx_pedidos_estado ON pedidos(estado);
CREATE INDEX idx_pedidos_created_at ON pedidos(created_at DESC);

CREATE TABLE pedido_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id        UUID NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  producto_id      UUID NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
  nombre_producto  VARCHAR(200) NOT NULL,
  cantidad         INTEGER NOT NULL CHECK (cantidad > 0),
  precio_unitario  NUMERIC(10,2) NOT NULL CHECK (precio_unitario > 0)
);

-- ============================================================
-- TRANSACCIONES DE PAGO (AUDITORÍA)
-- ============================================================

CREATE TABLE transacciones_pago (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id   UUID NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  proveedor   VARCHAR(20) NOT NULL CHECK (proveedor IN ('stripe', 'paypal')),
  evento_id   VARCHAR(200) NOT NULL UNIQUE,
  tipo_evento VARCHAR(100) NOT NULL,
  estado      VARCHAR(50) NOT NULL,
  importe     NUMERIC(10,2) NOT NULL,
  moneda      CHAR(3) NOT NULL DEFAULT 'EUR',
  payload_raw JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_transacciones_pedido_id ON transacciones_pago(pedido_id);

-- ============================================================
-- TRIGGER: updated_at automático
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_productos_updated_at
  BEFORE UPDATE ON productos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_carritos_updated_at
  BEFORE UPDATE ON carritos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_pedidos_updated_at
  BEFORE UPDATE ON pedidos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- TRIGGER: Asignar rol 'cliente' al registrarse
-- ============================================================

CREATE OR REPLACE FUNCTION assign_default_role()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  cliente_role_id UUID;
BEGIN
  SELECT id INTO cliente_role_id FROM roles WHERE nombre = 'cliente';
  INSERT INTO user_roles (user_id, role_id) VALUES (NEW.id, cliente_role_id)
    ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_assign_default_role
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION assign_default_role();
