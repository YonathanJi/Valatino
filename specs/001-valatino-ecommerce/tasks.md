---
description: "Task list template for feature implementation"
---

# Tasks: Plataforma E-Commerce Valatino

**Input**: Design documents from `/specs/001-valatino-ecommerce/`

**Prerequisites**: [plan.md](plan.md) · [spec.md](spec.md) · [research.md](research.md) · [data-model.md](data-model.md) · [contracts/api-rest.md](contracts/api-rest.md) · [contracts/realtime-subscriptions.md](contracts/realtime-subscriptions.md)

**Tests**: No incluidos (no solicitados explícitamente en la especificación).

**Organización**: Las tareas están agrupadas por historia de usuario para permitir implementación y prueba independiente de cada historia.

## Formato: `[ID] [P?] [Story?] Descripción con ruta de archivo`

- **[P]**: Puede ejecutarse en paralelo (archivos diferentes, sin dependencias incompletas)
- **[Story]**: Historia de usuario a la que pertenece la tarea (US1, US2, US3, US4)
- Las fases de Setup y Foundational no llevan etiqueta de historia

## Convenciones de Rutas

- **Monorepo**: `apps/web/` (Next.js), `apps/api/` (NestJS), `packages/` (shared), `supabase/`

---

## Phase 1: Setup (Inicialización del proyecto)

**Propósito**: Estructura base del monorepo, configuración compartida e inicialización de apps.

- [X] T001 Inicializar monorepo Turborepo con workspaces `apps/web`, `apps/api`, `packages/types`, `packages/config` en `package.json` raíz y `turbo.json`
- [X] T002 [P] Configurar TypeScript 5+ base en `packages/config/tsconfig/base.json` y extenderlo en cada workspace
- [X] T003 [P] Configurar ESLint + Prettier compartidos en `packages/config/eslint-config/index.js`
- [X] T004 Inicializar proyecto Next.js 14+ (App Router) con Tailwind CSS y Shadcn/UI en `apps/web/`
- [X] T005 Inicializar proyecto NestJS 10+ con soporte TypeScript en `apps/api/`
- [X] T006 [P] Inicializar Supabase CLI y estructura de migraciones en `supabase/migrations/` con `.gitignore` para credenciales
- [X] T007 [P] Crear archivos `.env.example` con todas las variables requeridas en `apps/web/.env.example` y `apps/api/.env.example`

---

## Phase 2: Foundational (Prerrequisitos bloqueantes)

**Propósito**: Infraestructura central que DEBE completarse antes de que pueda comenzar cualquier historia de usuario.

**⚠️ CRÍTICO**: Ningún trabajo de historia de usuario puede comenzar hasta que esta fase esté completa.

- [X] T008 Crear migración SQL con extensiones PostgreSQL requeridas (`uuid-ossp`, `pg_cron`) en `supabase/migrations/001_extensions.sql`
- [X] T009 Crear migración SQL con enums (`pedido_estado`) y todas las tablas del modelo de datos (`productos`, `stock_reservas`, `carritos`, `carrito_items`, `pedidos`, `pedido_items`, `direcciones_envio`, `transacciones_pago`, `roles`, `user_roles`) en `supabase/migrations/002_schema.sql`
- [X] T010 Crear migración SQL con todas las políticas RLS por tabla según `data-model.md` en `supabase/migrations/003_rls.sql`
- [X] T011 Crear migración SQL con el job `pg_cron` de liberación automática de reservas expiradas cada 60 s en `supabase/migrations/004_cron.sql`
- [X] T012 Configurar Prisma 5+ apuntando a Supabase y generar cliente y tipos en `packages/types/index.ts` vía `prisma generate`
- [X] T013 [P] Implementar clientes Supabase SSR (server y browser) en `apps/web/lib/supabase/server.ts` y `apps/web/lib/supabase/client.ts`
- [X] T014 [P] Implementar `AuthModule` en NestJS con `JwtStrategy`, `JwtGuard` y `RolesGuard` usando clave pública de Supabase en `apps/api/src/auth/`
- [X] T015 [P] Configurar middleware de Next.js para proteger rutas `(cuenta)` y `(backoffice)` en `apps/web/middleware.ts`
- [X] T016 [P] Crear seed con roles base (`admin`, `asesor`, `cliente`), usuario admin inicial y productos latinoamericanos de prueba en `supabase/seed.sql`

**Checkpoint**: Fundación lista — la implementación de historias de usuario puede comenzar en paralelo.

---

## Phase 3: Historia de Usuario 1 — Compra de Productos (P1) 🎯 MVP

**Goal**: Un cliente puede navegar el catálogo, añadir productos al carrito y completar el pago con Stripe o PayPal. El sistema gestiona el inventario con reserva temporal y deducción definitiva solo tras webhook.

**Prueba independiente**: Ejecutar el Escenario 1 de `quickstart.md` de inicio a fin. Verificar la creación de pedido, deducción de Hard Stock y limpieza de reservas en la BD.

**Criterios de éxito**: CE-001 (< 5 min), CE-002 (overselling = 0%), CE-003 (TTL libera en ≤ 1 min), CE-004 (100% deducciones por webhook).

- [X] T017 [P] [US1] Implementar `ProductosModule` en NestJS con servicio y controlador para `GET /productos` (paginado, filtros) y `GET /productos/:id` en `apps/api/src/productos/`
- [X] T018 [P] [US1] Crear página catálogo principal como Server Component en `apps/web/app/(storefront)/page.tsx` que llame a `GET /productos`
- [X] T019 [P] [US1] Crear componentes de catálogo `ProductoCard` y `ProductoGrid` con Shadcn/UI en `apps/web/components/storefront/ProductoCard.tsx` y `ProductoGrid.tsx`
- [X] T020 [US1] Crear página de detalle de producto como Server Component en `apps/web/app/(storefront)/productos/[slug]/page.tsx`
- [X] T021 [US1] Implementar `CarritoModule` en NestJS con `CarritoService` y endpoints `GET /carrito`, `POST /carrito/items`, `PATCH /carrito/items/:id`, `DELETE /carrito/items/:id` en `apps/api/src/carrito/`
- [X] T022 [US1] Implementar middleware de `session_id` (UUID en cookie HTTP-only para invitados) en `apps/api/src/carrito/session.middleware.ts`
- [X] T023 [US1] Crear página y componente del carrito en `apps/web/app/(storefront)/carrito/page.tsx` y `apps/web/components/storefront/Carrito.tsx`
- [X] T024 [US1] Implementar `CheckoutService` con lógica de Soft Allocation y endpoint `POST /checkout/reservar` (reserva con TTL 15 min, valida stock disponible) en `apps/api/src/carrito/checkout.service.ts`
- [X] T025 [US1] Implementar `PagosModule` en NestJS con `StripeService` (create-payment-intent) y `PaypalService` (create-order) en `apps/api/src/pagos/`
- [X] T026 [US1] Implementar webhook handlers en NestJS: `POST /pagos/stripe/webhook` y `POST /pagos/paypal/webhook` con verificación de firma en `apps/api/src/pagos/webhooks.controller.ts`
- [X] T027 [US1] Implementar `InventarioService` para deducción de Hard Stock atómica tras webhook exitoso en `apps/api/src/inventario/inventario.service.ts`
- [X] T028 [US1] Crear página de checkout con Stripe `PaymentElement` y `@paypal/react-paypal-js` en `apps/web/app/(storefront)/checkout/page.tsx` y componentes en `apps/web/components/checkout/`
- [X] T029 [US1] Crear página de confirmación de pedido en `apps/web/app/(storefront)/checkout/confirmacion/page.tsx`

---

## Phase 4: Historia de Usuario 2 — Registro y Gestión de Cuenta (P2)

**Goal**: Un cliente puede registrarse, iniciar sesión, consultar su historial de pedidos y gestionar sus direcciones de envío guardadas.

**Prueba independiente**: Ejecutar el Escenario 6 de `quickstart.md`: registro, compra autenticada, verificar historial y selección de dirección guardada en checkout.

**Criterios de éxito**: RF-004, RF-005, RF-006 verificables en escenario 6 de quickstart.

- [X] T030 [P] [US2] Crear páginas de registro e inicio de sesión con Supabase Auth en `apps/web/app/(cuenta)/registro/page.tsx` y `apps/web/app/(cuenta)/login/page.tsx`
- [X] T031 [P] [US2] Crear componentes de formularios de autenticación `RegistroForm` y `LoginForm` con validación en `apps/web/components/storefront/AuthForms.tsx`
- [X] T032 [US2] Implementar lógica de fusión de carrito (invitado → autenticado) en `CarritoService.fusionarCarrito()` en `apps/api/src/carrito/carrito.service.ts`
- [X] T033 [US2] Añadir endpoint `GET /pedidos` y `GET /pedidos/:id` en `PedidosModule` de NestJS en `apps/api/src/pedidos/pedidos.controller.ts`
- [X] T034 [US2] Crear página "Mis Pedidos" del cliente en `apps/web/app/(cuenta)/pedidos/page.tsx` con lista de pedidos e historial de estados
- [X] T035 [US2] Implementar endpoints de direcciones `GET/POST/PATCH/DELETE /direcciones` en `apps/api/src/direcciones/direcciones.controller.ts`
- [X] T036 [US2] Crear página de perfil con gestión de direcciones de envío en `apps/web/app/(cuenta)/perfil/page.tsx`
- [X] T037 [US2] Integrar selector de dirección guardada en el flujo de checkout en `apps/web/components/checkout/DireccionSelector.tsx`

---

## Phase 5: Historia de Usuario 3 — Gestión de Pedidos en Back-Office (P3)

**Goal**: Un Asesor o Administrador puede visualizar todos los pedidos entrantes en tiempo real y actualizar su estado a través del ciclo de vida del pedido.

**Prueba independiente**: Ejecutar los Escenarios 4 y 5 de `quickstart.md`: iniciar sesión como Admin/Asesor, ver pedidos en tiempo real, actualizar estados, verificar control de acceso RBAC.

**Criterios de éxito**: CE-005 (100% bloqueos RBAC), CE-006 (cambios visibles ≤ 60 s), CE-007 (panel tiempo real ≤ 30 s).

- [X] T038 [US3] Crear layout protegido del Back-Office con guard de roles (`admin`, `asesor`) en `apps/web/app/(backoffice)/layout.tsx`
- [X] T039 [US3] Implementar `PedidosModule` en NestJS con endpoints `GET /admin/pedidos` y `PATCH /admin/pedidos/:id/estado` incluyendo validación de transiciones permitidas por rol en `apps/api/src/pedidos/`
- [X] T040 [US3] Crear página del panel de pedidos con suscripción a Supabase Realtime según `contracts/realtime-subscriptions.md` en `apps/web/app/(backoffice)/pedidos/page.tsx`
- [X] T041 [P] [US3] Crear componentes del panel: `PedidoTabla`, `PedidoFila`, `EstadoBadge`, `EstadoSelector` en `apps/web/components/backoffice/`

---

## Phase 6: Historia de Usuario 4 — Gestión de Catálogo por el Administrador (P4)

**Goal**: El Administrador puede crear nuevos productos, editar sus detalles y gestionar el inventario manualmente. Los Asesores no tienen acceso a esta sección.

**Prueba independiente**: Ejecutar Escenario 5 de `quickstart.md` para verificar que el Asesor no puede acceder; luego crear un producto como Admin y verificar que aparece en el catálogo público.

**Criterios de éxito**: RF-016, RF-017; acceso denegado a rol `asesor` verificado en Escenario 5.

- [X] T042 [US4] Añadir endpoints de gestión de catálogo a `ProductosModule`: `POST /productos`, `PATCH /productos/:id`, `POST /productos/:id/stock` con guard `[admin]` en `apps/api/src/productos/productos.controller.ts`
- [X] T043 [P] [US4] Crear página de gestión de catálogo (tabla + acciones) en `apps/web/app/(backoffice)/catalogo/page.tsx`
- [X] T044 [P] [US4] Crear componentes CRUD del catálogo: `ProductoForm`, `ProductoTabla`, `StockAjusteModal` en `apps/web/components/backoffice/`
- [X] T045 [US4] Implementar endpoints de gestión de usuarios internos: `GET /admin/usuarios` y `POST /admin/usuarios/roles` en `apps/api/src/auth/usuarios.controller.ts`

---

## Phase Final: Polish y Aspectos Transversales

**Propósito**: Calidad de producción, animaciones premium, manejo de errores y pipeline CI/CD.

- [X] T046 [P] Añadir animaciones Framer Motion a transiciones de página (`layout.tsx`) y micro-interacciones de botones y tarjetas en `apps/web/components/`
- [X] T047 [P] Implementar `ExceptionFilter` global y logging estructurado en NestJS en `apps/api/src/common/filters/http-exception.filter.ts`
- [X] T048 [P] Implementar skeleton loaders y error boundaries para estados de carga y error en el frontend en `apps/web/components/ui/`
- [X] T049 Configurar pipelines de Turborepo (`build`, `lint`, `test`) y script `dev` global en `turbo.json`

---

## Dependencias Entre Historias

```
Phase 1 (Setup)
    └── Phase 2 (Foundational) — BLOQUEANTE COMPLETO
              ├── Phase 3 (US1 - Compra) ← MVP mínimo entregable
              │         └── Phase 4 (US2 - Cuenta)  [depende de T021-T023 del carrito]
              ├── Phase 5 (US3 - Back-Office Pedidos) [depende de T039 de Phase 4/5]
              └── Phase 6 (US4 - Gestión Catálogo)   [independiente post-Foundation]
```

**Dependencias específicas entre fases**:
- Phase 4 (US2) requiere que el módulo `CarritoModule` (T021-T022) de Phase 3 esté completo antes de implementar T032 (fusión de carrito).
- Phase 5 (US3) requiere que `PedidosModule` base esté disponible; puede desarrollarse en paralelo con Phase 4 tras completar Phase 2.
- Phase 6 (US4) puede desarrollarse en paralelo con Phases 4 y 5, ya que solo extiende `ProductosModule`.
- Phase Final puede comenzar en paralelo con cualquier fase de historia de usuario.

---

## Oportunidades de Ejecución en Paralelo

### Dentro de Phase 1 (Setup)
Tras completar T001, las siguientes tareas pueden ejecutarse en paralelo:
```
T001 → T002 ‖ T003 ‖ T006 ‖ T007
T004 y T005 pueden comenzar en paralelo tras T001
```

### Dentro de Phase 2 (Foundational)
Tras completar T012 (Prisma generado), pueden ejecutarse en paralelo:
```
T012 → T013 ‖ T014 ‖ T015 ‖ T016
```

### Dentro de Phase 3 (US1 - MVP)
Las primeras tareas pueden ejecutarse en paralelo:
```
T017 ‖ T018 ‖ T019  (API productos + páginas + componentes)
T025 ‖ T026         (Stripe service + PayPal service)
```

### Fases de Historias de Usuario (post-Phase 2)
```
Phase 3 (US1) → Phase 4 (US2) [secuencial en carrito]
Phase 3 (US1)
Phase 5 (US3) ‖ Phase 6 (US4)  [paralelo entre sí]
Phase Final ‖ [cualquier fase US]
```

---

## Estrategia de Implementación

### Alcance MVP (entrega mínima con valor)

**Completa Phase 1 + Phase 2 + Phase 3 (US1)** = plataforma de compra funcional:
- Catálogo de productos latinoamericanos en línea
- Carrito de compras (invitados y autenticados)
- Checkout con Stripe y PayPal
- Gestión de inventario con Soft Allocation + Hard Stock
- Prevención de overselling

### Incremento 2
Phase 4 (US2): Añade cuentas de cliente, historial de pedidos y direcciones guardadas.

### Incremento 3
Phase 5 (US3) + Phase 6 (US4): Añade el Back-Office completo (panel de pedidos + gestión de catálogo).

### Incremento Final
Phase Final: Animaciones Framer Motion, manejo de errores de producción y pipeline CI/CD.
