# Modelo de Datos: Plataforma E-Commerce Valatino

**Fase**: Phase 1 — Design
**Rama**: `001-valatino-ecommerce`
**Fecha**: 2026-07-02
**Fuente de verdad de tipos**: Prisma schema (`packages/types`)

---

## Visión General del Esquema

```
productos ←── stock_reservas ──→ carritos
    ↑                                ↓
    └────── pedido_items ←── pedidos ──→ direcciones_envio
                                 ↓
                           transacciones_pago

usuarios (Supabase Auth) ──→ carritos
                          ──→ pedidos
                          ──→ direcciones_envio
                          ──→ user_roles ──→ roles
```

---

## Entidades

### `productos`

Representa cada artículo del catálogo disponible para la venta.

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---------------|-------------|
| `id` | `uuid` | PK, default `gen_random_uuid()` | Identificador único |
| `nombre` | `varchar(200)` | NOT NULL | Nombre del producto |
| `descripcion` | `text` | — | Descripción larga |
| `precio` | `numeric(10,2)` | NOT NULL, > 0 | Precio en EUR |
| `imagenes` | `text[]` | NOT NULL, min 1 | URLs de imágenes |
| `categoria` | `varchar(100)` | NOT NULL | Categoría (ej. "Dulces", "Bebidas") |
| `stock_disponible` | `integer` | NOT NULL, ≥ 0 | Stock real disponible para venta |
| `stock_reservado` | `integer` | NOT NULL, ≥ 0, default 0 | Unidades en reserva temporal activa |
| `activo` | `boolean` | NOT NULL, default true | Si el producto aparece en el catálogo |
| `created_at` | `timestamptz` | NOT NULL, default now() | Fecha de creación |
| `updated_at` | `timestamptz` | NOT NULL, default now() | Fecha de última modificación |

**Reglas de negocio**:
- `stock_disponible` nunca puede ser negativo (constraint CHECK).
- `stock_disponible + stock_reservado` representa el total físico en almacén.
- Solo el Administrador puede crear, modificar o desactivar productos (RBAC + RLS).
- Los clientes solo pueden leer productos con `activo = true`.

**Transiciones de estado del campo `activo`**:
- `true` → `false`: El administrador desactiva/oculta el producto. No se elimina.
- `false` → `true`: El administrador reactiva el producto.

---

### `stock_reservas`

Reservas temporales de stock durante el proceso de checkout (Soft Allocation).

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---------------|-------------|
| `id` | `uuid` | PK, default `gen_random_uuid()` | Identificador único |
| `producto_id` | `uuid` | FK → `productos.id`, NOT NULL | Producto reservado |
| `user_id` | `uuid` | FK → auth.users, nullable | Usuario autenticado (null si invitado) |
| `session_id` | `uuid` | NOT NULL | ID de sesión (cookie, siempre presente) |
| `cantidad` | `integer` | NOT NULL, > 0 | Unidades reservadas |
| `created_at` | `timestamptz` | NOT NULL, default now() | Inicio de la reserva |
| `expires_at` | `timestamptz` | NOT NULL | Expiración (created_at + 15 minutos) |

**Reglas de negocio**:
- Al crear una reserva: `productos.stock_disponible -= cantidad` y `productos.stock_reservado += cantidad`.
- Al convertir una reserva en pedido: `productos.stock_reservado -= cantidad` (Hard Stock ya deducido).
- Al expirar (vía `pg_cron`): `productos.stock_disponible += cantidad` y `productos.stock_reservado -= cantidad`.
- Índice en `expires_at` para que `pg_cron` sea eficiente.

---

### `carritos`

Carrito de compras, persistente tanto para invitados como para usuarios autenticados.

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---------------|-------------|
| `id` | `uuid` | PK, default `gen_random_uuid()` | Identificador único |
| `user_id` | `uuid` | FK → auth.users, nullable | Null si es carrito de invitado |
| `session_id` | `uuid` | NOT NULL | UUID de cookie HTTP-only |
| `created_at` | `timestamptz` | NOT NULL, default now() | Fecha de creación |
| `updated_at` | `timestamptz` | NOT NULL, default now() | Última modificación |

**Relaciones**:
- Un carrito tiene muchos `carrito_items`.

---

### `carrito_items`

Artículos individuales dentro de un carrito.

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---------------|-------------|
| `id` | `uuid` | PK, default `gen_random_uuid()` | Identificador único |
| `carrito_id` | `uuid` | FK → `carritos.id` ON DELETE CASCADE | Carrito al que pertenece |
| `producto_id` | `uuid` | FK → `productos.id` | Producto añadido |
| `cantidad` | `integer` | NOT NULL, > 0 | Cantidad deseada |
| `precio_unitario` | `numeric(10,2)` | NOT NULL | Precio capturado en el momento de añadir |

**Reglas de negocio**:
- `precio_unitario` se captura al añadir el ítem para evitar discrepancias si el precio cambia.
- Si el mismo producto se añade dos veces, se incrementa `cantidad` en lugar de duplicar el ítem.

---

### `pedidos`

Registro de cada compra completada o en proceso.

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---------------|-------------|
| `id` | `uuid` | PK, default `gen_random_uuid()` | Identificador único |
| `user_id` | `uuid` | FK → auth.users, nullable | Cliente (null para invitados en v1) |
| `estado` | `pedido_estado` (enum) | NOT NULL, default 'PENDIENTE_PAGO' | Estado actual |
| `total` | `numeric(10,2)` | NOT NULL, > 0 | Total en EUR |
| `metodo_pago` | `varchar(20)` | NOT NULL | `'stripe'` o `'paypal'` |
| `referencia_pago` | `varchar(200)` | nullable | ID de transacción del proveedor |
| `direccion_envio_id` | `uuid` | FK → `direcciones_envio.id`, NOT NULL | Dirección de entrega |
| `created_at` | `timestamptz` | NOT NULL, default now() | Fecha de creación |
| `updated_at` | `timestamptz` | NOT NULL, default now() | Última modificación |

**Enum `pedido_estado`**:
```sql
CREATE TYPE pedido_estado AS ENUM (
  'PENDIENTE_PAGO',
  'PROCESANDO',
  'ENVIADO',
  'ENTREGADO',
  'CANCELADO'
);
```

**Transiciones de estado permitidas**:
```
PENDIENTE_PAGO → PROCESANDO (webhook de pago exitoso)
PROCESANDO     → ENVIADO    (Asesor o Admin actualiza manualmente)
ENVIADO        → ENTREGADO  (Asesor o Admin confirma entrega)
PENDIENTE_PAGO → CANCELADO  (timeout o cancelación explícita)
PROCESANDO     → CANCELADO  (solo Admin)
```

---

### `pedido_items`

Snapshot de los productos en el momento del pedido.

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---------------|-------------|
| `id` | `uuid` | PK, default `gen_random_uuid()` | Identificador único |
| `pedido_id` | `uuid` | FK → `pedidos.id` ON DELETE CASCADE | Pedido al que pertenece |
| `producto_id` | `uuid` | FK → `productos.id` | Referencia al producto |
| `nombre_producto` | `varchar(200)` | NOT NULL | Nombre capturado (histórico) |
| `cantidad` | `integer` | NOT NULL, > 0 | Unidades compradas |
| `precio_unitario` | `numeric(10,2)` | NOT NULL | Precio al momento de la compra |

**Reglas de negocio**:
- `nombre_producto` y `precio_unitario` se copian en el momento de crear el pedido para mantener
  el histórico correcto aunque el producto cambie de precio o sea eliminado.

---

### `direcciones_envio`

Direcciones de envío guardadas por los clientes.

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---------------|-------------|
| `id` | `uuid` | PK, default `gen_random_uuid()` | Identificador único |
| `user_id` | `uuid` | FK → auth.users, NOT NULL | Propietario de la dirección |
| `nombre_destinatario` | `varchar(200)` | NOT NULL | Nombre completo del destinatario |
| `linea1` | `varchar(300)` | NOT NULL | Calle y número |
| `linea2` | `varchar(200)` | nullable | Piso, puerta, etc. |
| `ciudad` | `varchar(100)` | NOT NULL | Ciudad |
| `codigo_postal` | `varchar(10)` | NOT NULL | Código postal (España: 5 dígitos) |
| `provincia` | `varchar(100)` | NOT NULL | Provincia |
| `pais` | `char(2)` | NOT NULL, default 'ES' | Código ISO 3166-1 alpha-2 |
| `es_predeterminada` | `boolean` | NOT NULL, default false | Dirección por defecto del usuario |
| `created_at` | `timestamptz` | NOT NULL, default now() | Fecha de creación |

---

### `transacciones_pago`

Registro de auditoría de cada transacción de pago (webhooks recibidos).

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---------------|-------------|
| `id` | `uuid` | PK, default `gen_random_uuid()` | Identificador único |
| `pedido_id` | `uuid` | FK → `pedidos.id` | Pedido relacionado |
| `proveedor` | `varchar(20)` | NOT NULL | `'stripe'` o `'paypal'` |
| `evento_id` | `varchar(200)` | NOT NULL, UNIQUE | ID del evento del proveedor (idempotencia) |
| `tipo_evento` | `varchar(100)` | NOT NULL | Ej. `payment_intent.succeeded` |
| `estado` | `varchar(50)` | NOT NULL | `'exitoso'`, `'fallido'`, `'reembolsado'` |
| `importe` | `numeric(10,2)` | NOT NULL | Importe de la transacción |
| `moneda` | `char(3)` | NOT NULL, default 'EUR' | Código ISO 4217 |
| `payload_raw` | `jsonb` | NOT NULL | Payload completo del webhook (para auditoría) |
| `created_at` | `timestamptz` | NOT NULL, default now() | Fecha de recepción del webhook |

**Reglas de negocio**:
- `evento_id` tiene restricción UNIQUE para garantizar idempotencia: si el mismo webhook llega
  dos veces, la segunda inserción falla silenciosamente.

---

### `roles` y `user_roles` (RBAC)

**`roles`**:

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---------------|-------------|
| `id` | `uuid` | PK | Identificador único |
| `nombre` | `varchar(50)` | NOT NULL, UNIQUE | `'admin'`, `'asesor'`, `'cliente'` |
| `descripcion` | `text` | — | Descripción del rol |

**`user_roles`**:

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---------------|-------------|
| `user_id` | `uuid` | FK → auth.users, PK compuesta | Usuario |
| `role_id` | `uuid` | FK → `roles.id`, PK compuesta | Rol asignado |
| `asignado_por` | `uuid` | FK → auth.users | Admin que asignó el rol |
| `created_at` | `timestamptz` | NOT NULL, default now() | Fecha de asignación |

**Reglas de negocio**:
- Solo los Administradores pueden insertar/modificar `user_roles` (RLS + RBAC).
- Los claims JWT de Supabase Auth se sincronizan con `user_roles` mediante un trigger de DB.
- Los nuevos registros de clientes reciben automáticamente el rol `cliente` vía trigger.

---

## Políticas RLS por Tabla

| Tabla | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| `productos` | Todos (activos) / Admin+Asesor (todos) | Admin | Admin | Admin |
| `stock_reservas` | Propio (user_id o session_id) | Autenticados e invitados | — | — |
| `carritos` | Propio | Todos | Propio | Propio |
| `carrito_items` | Vía carrito propio | Vía carrito propio | Vía carrito propio | Vía carrito propio |
| `pedidos` | Propio o Admin/Asesor | Sistema (NestJS service role) | Admin/Asesor (estado) | — |
| `pedido_items` | Vía pedido propio o Admin/Asesor | Sistema | — | — |
| `direcciones_envio` | Propio | Propio | Propio | Propio |
| `transacciones_pago` | Admin | Sistema | — | — |
| `user_roles` | Propio | Admin | Admin | Admin |

> "Sistema" indica que NestJS usa la `service_role` key de Supabase (bypasses RLS)
> exclusivamente para operaciones que el usuario no puede autorizar directamente
> (ej. crear un pedido tras confirmar el pago).

---

## Diagrama de Relaciones Simplificado

```
auth.users
  │
  ├── user_roles ──── roles
  │
  ├── carritos ──── carrito_items ──── productos
  │                                         │
  ├── pedidos ──── pedido_items ────────────┘
  │    │
  │    ├── transacciones_pago
  │    └── direcciones_envio ◄── (también linked a auth.users)
  │
  └── stock_reservas ──── productos
```
