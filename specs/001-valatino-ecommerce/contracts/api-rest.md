# Contratos de API REST: Plataforma E-Commerce Valatino

**Servidor base**: `https://api.valatino.es` (Railway)
**Autenticación**: Bearer JWT (emitido por Supabase Auth)
**Formato**: JSON `application/json`
**Versión**: v1

---

## Convenciones

- `[público]` — Sin autenticación requerida
- `[cliente]` — Requiere JWT con rol `cliente`
- `[asesor]` — Requiere JWT con rol `asesor` o `admin`
- `[admin]` — Requiere JWT con rol `admin`
- `[sistema]` — Solo accesible con `service_role` key (webhooks internos)

Todos los errores siguen el formato:
```json
{ "statusCode": 400, "error": "Bad Request", "message": "Descripción del error" }
```

---

## Módulo: Productos (`/productos`)

### `GET /productos` [público]

Lista el catálogo de productos activos con paginación.

**Query params**:
| Param | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| `page` | integer | 1 | Página actual |
| `limit` | integer | 20 | Ítems por página (máx. 50) |
| `categoria` | string | — | Filtrar por categoría |
| `q` | string | — | Búsqueda por nombre |

**Response 200**:
```json
{
  "data": [
    {
      "id": "uuid",
      "nombre": "Chocoramo",
      "descripcion": "Ponqué colombiano cubierto de chocolate",
      "precio": 2.50,
      "imagenes": ["https://cdn.valatino.es/chocoramo.jpg"],
      "categoria": "Dulces",
      "stock_disponible": 45,
      "activo": true
    }
  ],
  "total": 120,
  "page": 1,
  "limit": 20
}
```

---

### `GET /productos/:id` [público]

Devuelve el detalle de un producto activo.

**Response 200**: objeto `Producto` completo.
**Response 404**: Producto no encontrado o inactivo.

---

### `POST /productos` [admin]

Crea un nuevo producto en el catálogo.

**Body**:
```json
{
  "nombre": "Jugos Hit Maracuyá 250ml",
  "descripcion": "Jugo de fruta tropical",
  "precio": 1.80,
  "imagenes": ["https://cdn.valatino.es/hit-maracuya.jpg"],
  "categoria": "Bebidas",
  "stock_disponible": 100
}
```

**Response 201**: objeto `Producto` creado.
**Response 400**: Validación fallida (precio ≤ 0, sin imágenes, etc.).

---

### `PATCH /productos/:id` [admin]

Actualiza campos de un producto existente (parcial).

**Body** (todos los campos son opcionales):
```json
{
  "precio": 2.00,
  "descripcion": "Nueva descripción",
  "activo": false
}
```

**Response 200**: objeto `Producto` actualizado.

---

### `POST /productos/:id/stock` [admin]

Registra entrada de mercancía (suma stock al inventario).

**Body**:
```json
{ "cantidad": 50, "nota": "Recepción almacén 2026-07-10" }
```

**Response 200**:
```json
{ "stock_disponible": 95, "mensaje": "Stock actualizado correctamente" }
```

---

## Módulo: Carrito (`/carrito`)

### `GET /carrito` [público]

Devuelve el carrito activo del usuario o de la sesión de invitado.
El servidor lee el `session_id` de la cookie `valatino-session`.

**Response 200**:
```json
{
  "id": "uuid",
  "items": [
    {
      "id": "uuid",
      "producto_id": "uuid",
      "nombre": "Chocoramo",
      "cantidad": 2,
      "precio_unitario": 2.50,
      "subtotal": 5.00
    }
  ],
  "total": 5.00
}
```

---

### `POST /carrito/items` [público]

Añade un producto al carrito o incrementa su cantidad.

**Body**:
```json
{ "producto_id": "uuid", "cantidad": 2 }
```

**Response 201**: carrito actualizado.
**Response 409**: Stock insuficiente.

---

### `PATCH /carrito/items/:itemId` [público]

Actualiza la cantidad de un ítem.

**Body**: `{ "cantidad": 3 }`
**Response 200**: carrito actualizado.
**Response 409**: Stock insuficiente para la nueva cantidad.

---

### `DELETE /carrito/items/:itemId` [público]

Elimina un ítem del carrito.

**Response 204**: Sin contenido.

---

## Módulo: Checkout y Reservas (`/checkout`)

### `POST /checkout/reservar` [público]

Crea reservas temporales (Soft Allocation) para todos los ítems del carrito
al avanzar a la pantalla de pago. TTL: 15 minutos.

**Response 201**:
```json
{
  "reservas": [
    { "producto_id": "uuid", "cantidad": 2, "expires_at": "2026-07-02T10:15:00Z" }
  ],
  "expires_at": "2026-07-02T10:15:00Z"
}
```

**Response 409**: Uno o más productos sin stock suficiente.
```json
{
  "statusCode": 409,
  "error": "Conflict",
  "message": "Stock insuficiente",
  "productos_sin_stock": ["uuid1", "uuid2"]
}
```

---

## Módulo: Pagos (`/pagos`)

### `POST /pagos/stripe/create-payment-intent` [público]

Crea un PaymentIntent en Stripe para el total del carrito activo.

**Response 201**:
```json
{
  "client_secret": "pi_xxx_secret_yyy",
  "importe": 5.00,
  "moneda": "eur"
}
```

---

### `POST /pagos/paypal/create-order` [público]

Crea una orden en PayPal para el total del carrito activo.

**Response 201**:
```json
{ "order_id": "5O190127TN364715T" }
```

---

### `POST /pagos/stripe/webhook` [sistema]

Endpoint para webhooks de Stripe. Verifica la firma `Stripe-Signature`.

**Eventos manejados**:
- `payment_intent.succeeded` → Crea pedido, deduce Hard Stock, limpia reservas.
- `payment_intent.payment_failed` → Libera reservas, notifica al cliente.

**Response 200**: `{ "received": true }`
**Response 400**: Firma inválida.

---

### `POST /pagos/paypal/webhook` [sistema]

Endpoint para webhooks de PayPal. Verifica la firma del evento.

**Eventos manejados**:
- `PAYMENT.CAPTURE.COMPLETED` → Crea pedido, deduce Hard Stock, limpia reservas.
- `PAYMENT.CAPTURE.DENIED` → Libera reservas.

**Response 200**: `{ "received": true }`

---

## Módulo: Pedidos (`/pedidos`)

### `GET /pedidos` [cliente]

Lista los pedidos del cliente autenticado con paginación.

**Response 200**:
```json
{
  "data": [
    {
      "id": "uuid",
      "estado": "ENVIADO",
      "total": 15.00,
      "created_at": "2026-07-01T09:00:00Z",
      "items_count": 3
    }
  ],
  "total": 5,
  "page": 1
}
```

---

### `GET /pedidos/:id` [cliente]

Devuelve el detalle completo de un pedido propio.

**Response 200**: objeto `Pedido` con `pedido_items` y `direccion_envio`.
**Response 403**: El pedido no pertenece al usuario autenticado.
**Response 404**: Pedido no encontrado.

---

### `GET /admin/pedidos` [asesor]

Lista todos los pedidos del sistema (para el Back-Office).

**Query params**: `page`, `limit`, `estado`, `desde`, `hasta` (ISO 8601).

**Response 200**: paginación de pedidos con datos del cliente.

---

### `PATCH /admin/pedidos/:id/estado` [asesor]

Actualiza el estado de un pedido.

**Body**: `{ "estado": "ENVIADO" }`

**Response 200**: objeto `Pedido` actualizado.
**Response 400**: Transición de estado no permitida.
**Response 403**: El rol Asesor intenta una transición prohibida (ej. PROCESANDO → CANCELADO).

---

## Módulo: Direcciones de Envío (`/direcciones`)

### `GET /direcciones` [cliente]

Lista las direcciones guardadas del cliente.

### `POST /direcciones` [cliente]

Crea una nueva dirección.

**Body**:
```json
{
  "nombre_destinatario": "Juan Jiménez",
  "linea1": "Calle Gran Vía 45",
  "linea2": "3ºB",
  "ciudad": "Madrid",
  "codigo_postal": "28013",
  "provincia": "Madrid",
  "pais": "ES",
  "es_predeterminada": true
}
```

### `PATCH /direcciones/:id` [cliente]

Actualiza una dirección existente.

### `DELETE /direcciones/:id` [cliente]

Elimina una dirección (solo si no está referenciada por un pedido activo).

---

## Módulo: Gestión de Usuarios Internos (`/admin/usuarios`)

### `GET /admin/usuarios` [admin]

Lista todos los usuarios internos (Asesores) con sus roles.

### `POST /admin/usuarios/roles` [admin]

Asigna o cambia el rol a un usuario interno.

**Body**: `{ "user_id": "uuid", "role": "asesor" }`
**Response 200**: confirmación.

---

## Códigos de Estado Estándar

| Código | Descripción |
|--------|-------------|
| 200 | OK |
| 201 | Creado |
| 204 | Sin contenido (DELETE exitoso) |
| 400 | Error de validación |
| 401 | No autenticado |
| 403 | Sin permisos (rol insuficiente) |
| 404 | Recurso no encontrado |
| 409 | Conflicto (stock insuficiente, evento duplicado) |
| 500 | Error interno del servidor |
