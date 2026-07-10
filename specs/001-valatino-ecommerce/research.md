# Investigación de Diseño: Plataforma E-Commerce Valatino

**Fase**: Phase 0 — Research
**Rama**: `001-valatino-ecommerce`
**Fecha**: 2026-07-02

Todos los elementos "NEEDS CLARIFICATION" del Contexto Técnico han sido investigados y resueltos.

---

## 1. Mecanismo de Tiempo Real para el Panel de Pedidos

**Pregunta**: ¿Cómo actualizar el panel de pedidos del Back-Office en tiempo real sin violar el
Principio V (sin estado compartido entre instancias NestJS)?

**Decisión**: Supabase Realtime (Postgres Change Data Capture)

**Razonamiento**:
- Supabase Realtime escucha directamente los cambios en PostgreSQL (`INSERT`/`UPDATE` en la tabla
  `pedidos`) y los transmite vía WebSocket gestionado por la infraestructura de Supabase.
- El frontend de Back-Office (Next.js Client Component) se suscribe a `supabase.channel()`.
  NestJS no participa en el canal de tiempo real: solo escribe en la base de datos, y Supabase hace
  el broadcast automáticamente.
- Esto cumple el Principio V: NestJS no mantiene conexiones WebSocket ni estado de suscripción en
  memoria. Es completamente stateless.

**Alternativas consideradas**:
- WebSockets en NestJS (`@nestjs/websockets`): requiere sticky sessions o un broker Redis para
  escalar horizontalmente. Viola el Principio V y añade infraestructura. Rechazado.
- Server-Sent Events (SSE) en NestJS: mismo problema de estado; además, son unidireccionales y
  no reutilizables para otros módulos. Rechazado.

**Patrón de implementación**:
```ts
// apps/web — Back-Office Client Component
const channel = supabase
  .channel('pedidos-realtime')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, handleChange)
  .subscribe();
```
RLS debe configurarse para que solo los usuarios con rol `admin` o `asesor` reciban los cambios.

---

## 2. Proceso de Liberación Automática de Reservas (TTL Soft Allocation)

**Pregunta**: ¿Cómo liberar las reservas de stock expiradas sin crear estado en NestJS que impida
el escalado horizontal?

**Decisión**: Extensión `pg_cron` de PostgreSQL vía Supabase

**Razonamiento**:
- `pg_cron` es una extensión nativa de PostgreSQL disponible en Supabase. Permite programar jobs
  SQL directamente en la base de datos, sin ningún proceso externo.
- El job se ejecuta cada 60 segundos, libera las reservas expiradas y devuelve las unidades al
  stock disponible, todo en una transacción atómica.
- NestJS queda completamente stateless: no tiene schedulers, no tiene cron jobs, no tiene estado
  entre instancias. Cumple el Principio V.

**Alternativas consideradas**:
- BullMQ en NestJS (job queue con Redis): añade Redis como infraestructura adicional, añade
  complejidad operacional. Para este caso de uso sencillo, es sobredimensionado. Rechazado.
- `@nestjs/schedule` (cron in-process): requiere que exactamente una instancia ejecute el job, o
  se ejecuta múltiples veces en entornos multi-instancia. Viola el Principio V. Rechazado.
- Supabase Edge Functions on schedule: posible, pero introduce JavaScript en la capa de base de
  datos y añade una pieza más a mantener. Rechazado.

**SQL del job**:
```sql
-- Habilitar extensión (una sola vez, en migración)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Job: cada minuto, liberar reservas expiradas
SELECT cron.schedule(
  'liberar-reservas-expiradas',
  '* * * * *',
  $$
    UPDATE productos
    SET stock_disponible = stock_disponible + sr.cantidad
    FROM stock_reservas sr
    WHERE sr.producto_id = productos.id
      AND sr.expires_at < NOW();

    DELETE FROM stock_reservas WHERE expires_at < NOW();
  $$
);
```

---

## 3. Carrito de Invitados (Guest Checkout)

**Pregunta**: ¿Cómo persistir el carrito de un usuario no autenticado sin estado server-side?

**Decisión**: Carrito en PostgreSQL identificado por `session_id` (UUID en cookie)

**Razonamiento**:
- Al crear o recuperar un carrito, el backend devuelve/lee un `session_id` (UUID v4) que se
  almacena en una cookie HTTP-only. El carrito se guarda en la tabla `carritos` con `user_id = NULL`
  y `session_id = <uuid>`.
- Cuando el invitado se registra o inicia sesión, el backend ejecuta un proceso de "fusión de
  carrito": los ítems del carrito anónimo se transfieren al carrito del usuario autenticado.
- NestJS no guarda el `session_id` en memoria; lo lee de cada request. Stateless. Principio V ✅.
- RLS: las políticas RLS permiten leer/escribir en `carritos` si `session_id` coincide con la
  cookie (acceso anónimo limitado) o si `auth.uid()` coincide con `user_id` (acceso autenticado).

**Alternativas consideradas**:
- localStorage solo: no persiste entre dispositivos ni sesiones del browser, y no es accesible
  desde Server Components. Insuficiente para checkout robusto. Rechazado.
- Sesiones server-side (express-session/Redis): viola explícitamente el Principio V. Rechazado.

---

## 4. Integración de Stripe y PayPal

**Pregunta**: ¿Qué flujo garantiza que los pagos solo se confirman por webhook y que ninguna clave
secreta queda expuesta en el cliente?

**Decisión**: NestJS crea el intent/orden → frontend usa SDK hosteado → webhook confirma en NestJS

**Flujo Stripe**:
1. Frontend llama `POST /api/pagos/stripe/create-payment-intent` (autenticado).
2. NestJS crea `PaymentIntent` con la clave secreta de Stripe, devuelve `client_secret` (no la clave).
3. Frontend usa `@stripe/stripe-js` con `PaymentElement` para capturar datos de pago (hosted por Stripe, PCI DSS compliant).
4. Stripe procesa el pago y llama `POST /api/pagos/stripe/webhook` en NestJS con firma verificada.
5. NestJS deduce el Hard Stock y actualiza el estado del pedido a `PROCESANDO`.

**Flujo PayPal**:
1. Frontend llama `POST /api/pagos/paypal/create-order`.
2. NestJS crea la orden vía API de PayPal con la clave secreta, devuelve `orderId`.
3. Frontend usa `@paypal/react-paypal-js` para capturar la aprobación.
4. PayPal llama `POST /api/pagos/paypal/webhook` en NestJS con firma verificada.
5. NestJS deduce el Hard Stock y actualiza el estado del pedido.

**Razonamiento**: Las claves secretas de Stripe y PayPal NUNCA tocan el cliente. El frontend
solo recibe identificadores efímeros (`client_secret`, `orderId`). Cumple el Principio III.

**Alternativas consideradas**:
- Confirmar el pago directamente desde el frontend con el Stripe Checkout hosteado (redirect):
  más simple, pero pierde control sobre el flujo UX premium. Rechazado.
- Polling activo del estado del pago desde el frontend: poco fiable e ineficiente. La spec
  prohíbe el polling activo. Rechazado.

---

## 5. Autenticación y RBAC

**Pregunta**: ¿Cómo implementar autenticación para dos tipos de usuarios (clientes + internos) y
control de acceso basado en roles sin sesiones server-side?

**Decisión**: Supabase Auth para JWT → NestJS Guards para RBAC → RLS para datos

**Arquitectura**:
- Supabase Auth emite JWT con `user_id` y claims personalizados (`role: 'admin' | 'asesor' | 'cliente'`).
- Next.js usa `@supabase/ssr` para leer el JWT en Server Components y Middleware de Next.js,
  redirigiendo usuarios no autorizados antes de renderizar.
- NestJS valida el JWT con `JwtGuard` (usando la clave pública de Supabase) y el rol con `RolesGuard`.
- Las tablas de `pedidos`, `stock_reservas`, `direcciones_envio` tienen políticas RLS que usan
  `auth.uid()` y el claim de rol para limitar el acceso a nivel de fila.
- Los usuarios internos (Admin/Asesor) se crean en Supabase Auth con metadatos de rol. Los
  clientes se auto-registran; su rol es `cliente` por defecto.

**Razonamiento**: JWT stateless — NestJS no almacena tokens en memoria, solo los valida. Cada
instancia puede validar independientemente con la clave pública. Principio V ✅.

**Alternativas consideradas**:
- Sesiones en base de datos (refresh tokens manuales): más complejo, añade estado. Supabase Auth
  ya gestiona refresh tokens de forma segura. Rechazado.
- NextAuth.js: introduce una capa de autenticación redundante con Supabase Auth ya incluido en
  el stack. Rechazado.

---

## 6. Framework de Testing

**Pregunta**: ¿Qué herramientas de testing se usan para cada capa del stack?

**Decisión**: Jest (NestJS) + Vitest (Next.js) + Playwright (E2E)

| Capa | Framework | Razón |
|------|-----------|-------|
| NestJS (unit/integration) | Jest + `@nestjs/testing` | Integración nativa con NestJS DI |
| NestJS (contrato de API) | Supertest + Jest | HTTP contract tests sin servidor real |
| Next.js (componentes) | Vitest + React Testing Library | Más rápido que Jest en proyectos Vite-adjacent |
| E2E (flujos completos) | Playwright | Cross-browser, soporte SSR, ideal para flujos de pago |

**Nota**: Los tests E2E de pagos usan las herramientas de prueba (test mode) de Stripe y PayPal,
nunca credenciales de producción.

---

## Resolución de NEEDS CLARIFICATION

Todos los elementos del Contexto Técnico han sido resueltos. No quedan ítems pendientes.

| Ítem | Estado | Decisión |
|------|--------|----------|
| Tiempo real panel pedidos | ✅ Resuelto | Supabase Realtime (CDC) |
| TTL Soft Allocation | ✅ Resuelto | `pg_cron` en PostgreSQL |
| Guest checkout persistence | ✅ Resuelto | `session_id` UUID en cookie + DB |
| Integración Stripe/PayPal | ✅ Resuelto | Create intent en NestJS → SDK hosteado → Webhook |
| Autenticación y RBAC | ✅ Resuelto | Supabase Auth JWT + NestJS Guards + RLS |
| Framework de testing | ✅ Resuelto | Jest + Vitest + Playwright |
