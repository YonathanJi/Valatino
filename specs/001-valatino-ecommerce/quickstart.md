# Guía de Validación: Plataforma E-Commerce Valatino

**Propósito**: Escenarios ejecutables para validar que la funcionalidad funciona de extremo a extremo.
**Rama**: `001-valatino-ecommerce`
**Referencias**: [spec.md](spec.md) · [data-model.md](data-model.md) · [contracts/api-rest.md](contracts/api-rest.md)

---

## Prerrequisitos

Antes de ejecutar los escenarios de validación, asegúrate de que:

1. El monorepo está configurado y las dependencias instaladas:
   ```bash
   pnpm install
   turbo build
   ```

2. Las variables de entorno están configuradas (`.env.local` para web, `.env` para api):
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `STRIPE_SECRET_KEY` (modo test), `STRIPE_WEBHOOK_SECRET`
   - `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` (modo sandbox)

3. La base de datos está migrada con el esquema de entidades del [modelo de datos](data-model.md):
   ```bash
   supabase db reset        # aplica migraciones + seed
   supabase db push         # en entorno staging
   ```

4. La extensión `pg_cron` está habilitada en Supabase (via Supabase Dashboard → Extensions).

5. Los servidores de desarrollo están corriendo:
   ```bash
   turbo dev                # arranca apps/web (:3000) y apps/api (:4000)
   stripe listen --forward-to localhost:4000/pagos/stripe/webhook
   ```

---

## Escenario 1 — Flujo de Compra Completo con Stripe (Historia P1)

**Valida**: RF-001 a RF-010, CE-001, CE-002, CE-004

### Pasos

1. Navegar al catálogo: `http://localhost:3000`
   - **Esperado**: Se muestran productos con imagen, nombre, precio y stock disponible.

2. Añadir 2 unidades de un producto al carrito.
   - **Esperado**: El carrito muestra 2 unidades y el total calculado correctamente.

3. Hacer clic en "Pagar" para avanzar al checkout.
   - **Esperado**: La API `POST /checkout/reservar` devuelve `201` con `expires_at` (ahora + 15 min).
   - **Verificar en BD**: `stock_reservas` contiene el registro; `productos.stock_disponible` disminuyó.

4. Completar el pago con la tarjeta de prueba de Stripe: `4242 4242 4242 4242`, fecha futura, CVC cualquiera.
   - **Esperado**: El webhook `payment_intent.succeeded` llega a `POST /pagos/stripe/webhook`.

5. Verificar confirmación de compra en pantalla.
   - **Esperado**: Página de confirmación con número de pedido.

6. **Verificar en BD**:
   - `pedidos` contiene un nuevo registro con `estado = 'PROCESANDO'`.
   - `stock_reservas`: la reserva del paso 3 fue eliminada.
   - `productos.stock_disponible`: decrementado en 2 (Hard Stock definitivo).
   - `transacciones_pago`: registro con `estado = 'exitoso'` y `evento_id` único.

---

## Escenario 2 — Expiración de Reserva TTL (RF-008, RF-009, CE-003)

**Valida**: El proceso `pg_cron` libera el stock reservado automáticamente.

### Pasos

1. Añadir un producto al carrito y avanzar al checkout (igual que pasos 1-3 del Escenario 1).
   - **Verificar**: `stock_reservas` tiene el registro con `expires_at = NOW() + 15 min`.

2. **No completar el pago.** Esperar que el `pg_cron` ejecute el job (se ejecuta cada 60 s;
   para pruebas, actualizar manualmente `expires_at` a `NOW() - 1 minute` en la BD).
   ```sql
   UPDATE stock_reservas SET expires_at = NOW() - INTERVAL '1 minute';
   ```

3. Esperar hasta 60 segundos para que `pg_cron` ejecute el job.

4. **Verificar en BD**:
   - `stock_reservas`: el registro fue eliminado.
   - `productos.stock_disponible`: restaurado a su valor original.
   - `productos.stock_reservado`: decrementado de vuelta a 0.

---

## Escenario 3 — Protección contra Overselling (CE-002)

**Valida**: Dos compradores simultáneos no pueden comprar el mismo último artículo.

### Pasos

1. Configurar un producto con `stock_disponible = 1`.

2. Con dos ventanas del browser (usuario A y usuario B), añadir el producto al carrito de ambos.

3. Ambos avanzan al checkout simultáneamente (con diferencia de milisegundos).
   - **Esperado**: Solo uno de los dos recibe `201` en `POST /checkout/reservar`.
   - El otro recibe `409 Conflict` con `productos_sin_stock`.

4. El usuario que logró la reserva completa el pago.
   - **Verificar en BD**: `stock_disponible = 0`, solo un `pedido` creado.

---

## Escenario 4 — Panel de Pedidos en Tiempo Real (CE-006, CE-007)

**Valida**: Los cambios de estado son visibles en el Back-Office en ≤ 30 s.

### Pasos

1. Iniciar sesión en el Back-Office como Admin o Asesor: `http://localhost:3000/backoffice/pedidos`

2. Desde otra ventana, completar una compra (Escenario 1).

3. **Esperado en el Back-Office**: El nuevo pedido aparece en el panel sin recargar la página,
   en ≤ 30 segundos (en local, prácticamente instantáneo).

4. Cambiar el estado del pedido a `ENVIADO` en el Back-Office.

5. Iniciar sesión como el cliente comprador y navegar a "Mis Pedidos".
   - **Esperado**: El estado `ENVIADO` es visible en el historial del cliente en ≤ 60 segundos.

---

## Escenario 5 — Control de Acceso RBAC (CE-005, RF-011 a RF-013)

**Valida**: El acceso está correctamente restringido según el rol del usuario.

### Pasos

1. Intentar acceder a `http://localhost:3000/backoffice/pedidos` sin autenticación.
   - **Esperado**: Redirección al login.

2. Iniciar sesión como usuario `cliente` e intentar acceder al Back-Office.
   - **Esperado**: Error 403 o redirección; sin acceso a ninguna ruta del Back-Office.

3. Iniciar sesión como `asesor` y verificar:
   - ✅ Puede ver el panel de pedidos.
   - ✅ Puede cambiar estados de pedido a `ENVIADO` o `ENTREGADO`.
   - ❌ No puede acceder a la gestión de catálogo (`/backoffice/catalogo`).
   - ❌ No puede hacer `PROCESANDO → CANCELADO` (transición prohibida para Asesor).

4. Iniciar sesión como `admin` y verificar:
   - ✅ Acceso total: pedidos, catálogo, gestión de usuarios/roles.
   - ✅ Puede hacer `PROCESANDO → CANCELADO`.

---

## Escenario 6 — Registro de Cliente y Cuenta (Historia P2)

**Valida**: RF-004, RF-005, RF-006

### Pasos

1. Registrar un nuevo cliente en `http://localhost:3000/cuenta/registro`.
   - **Esperado**: Cuenta creada, inicio de sesión automático, rol `cliente` asignado.

2. Realizar una compra estando autenticado (Escenario 1 con usuario registrado).

3. Navegar a `http://localhost:3000/cuenta/pedidos`.
   - **Esperado**: El pedido aparece en el historial con estado `PROCESANDO`.

4. Añadir una dirección de envío en `http://localhost:3000/cuenta/perfil`.

5. Iniciar una nueva compra y llegar al checkout.
   - **Esperado**: El formulario de envío muestra la dirección guardada para seleccionar.

---

## Resultados Esperados Globales

| Criterio de Éxito | Método de Validación |
|-------------------|----------------------|
| CE-001: Compra en < 5 min | Cronometrar Escenario 1 de inicio a fin |
| CE-002: Overselling = 0% | Escenario 3 (concurrencia) |
| CE-003: Reservas liberadas en ≤ 1 min tras TTL | Escenario 2 (expiración) |
| CE-004: Stock solo deducido tras webhook | Verificar BD en Escenario 1, paso 6 |
| CE-005: 100% bloqueos de acceso no autorizado | Escenario 5 |
| CE-006: Cambios de estado visibles en ≤ 60 s | Escenario 4, paso 5 |
| CE-007: Panel tiempo real en ≤ 30 s | Escenario 4, paso 3 |
