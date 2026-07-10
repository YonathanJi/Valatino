# Plan de Implementación: Plataforma E-Commerce Valatino

**Rama**: `001-valatino-ecommerce` | **Fecha**: 2026-07-02 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-valatino-ecommerce/spec.md`

## Resumen

Plataforma de comercio electrónico fullstack especializada en la venta de productos latinoamericanos
en España. Comprende un Storefront público (catálogo, carrito, checkout con Stripe/PayPal) y un
Back-Office protegido (RBAC con roles Administrador/Asesor, gestión de pedidos en tiempo real y
gestión de catálogo). El sistema implementa un modelo de inventario de dos capas: reserva temporal
con TTL (Soft Allocation) y deducción definitiva solo tras confirmación de pago por webhook. Stack:
TypeScript Fullstack, monorepo Turborepo, Next.js 14+, NestJS 10+, Supabase (PostgreSQL + RLS),
Prisma, Tailwind + Shadcn/UI + Framer Motion. Despliegue en Vercel (frontend) + Railway (backend).

## Contexto Técnico

**Language/Version**: TypeScript 5+ (frontend, backend, configuración compartida)

**Primary Dependencies**:
- Frontend: Next.js 14+ (App Router, Server Components), Shadcn/UI, Tailwind CSS 3+, Framer Motion 11+, `@supabase/ssr`
- Backend: NestJS 10+, `@nestjs/jwt`, `@nestjs/passport`, `stripe` SDK, `@paypal/paypal-server-sdk`
- ORM: Prisma 5+ (source of truth para tipos de entidades)
- Monorepo: Turborepo (build cache, pipelines)
- Tipos compartidos: `packages/types` (generados desde Prisma)

**Storage**: PostgreSQL vía Supabase con RLS activo en todas las tablas de datos de usuario

**Testing**:
- Backend (NestJS): Jest + `@nestjs/testing`
- Frontend (Next.js): Vitest + React Testing Library
- E2E: Playwright

**Target Platform**: Web — Server-Side Rendering en Vercel (Edge/Node runtime), API REST en Railway

**Project Type**: Monorepo web e-commerce (storefront + back-office + REST API)

**Performance Goals**:
- Flujo de compra completo < 5 minutos (CE-001)
- Panel de pedidos actualizado en tiempo real ≤ 30 s de latencia (CE-007)
- Reservas expiradas liberadas dentro de 1 minuto tras vencer TTL (CE-003)

**Constraints**:
- Overselling = 0% bajo concurrencia (CE-002)
- 100% de deducciones de stock únicamente tras webhook de pago (CE-004)
- Sin estado compartido en memoria entre instancias NestJS (Principio V)
- RLS activo en todas las tablas de usuario, sin excepción (Principio III)
- Claves secretas exclusivamente en variables de entorno del servidor (Principio III)

**Scale/Scope**: Mercado español inicial, soporte para ≥ 100 compradores simultáneos,
~4 pantallas storefront principales + ~4 pantallas back-office, 2 roles internos

## Constitution Check

*GATE: Debe pasar antes de la Fase 0 de investigación. Re-evaluar después de la Fase 1 de diseño.*

### Evaluación pre-Phase 0

| Principio | Estado | Evidencia |
|-----------|--------|-----------|
| I. TypeScript Fullstack | ✅ PASA | Todo el código en TS; Prisma genera tipos compartidos; `any` prohibido |
| II. Arquitectura Enterprise Modular | ✅ PASA | Monorepo Turborepo con `/apps/web`, `/apps/api`, `packages/types` |
| III. Seguridad en Capas | ✅ PASA | RLS en todas las tablas de usuario; Stripe/PayPal solo vía webhooks en NestJS; sin secretos en cliente |
| IV. UX/UI Premium | ✅ PASA | Shadcn/UI + Framer Motion + Tailwind definidos como stack vinculante |
| V. Escalabilidad y Despliegue Cloud | ✅ PASA | Vercel + Railway; JWT stateless; TTL via `pg_cron` (sin estado en NestJS) |

**Resultado pre-Phase 0**: ✅ TODOS LOS GATES PASAN

### Re-evaluación post-Phase 1 (post-diseño)

| Principio | Estado | Evidencia del diseño |
|-----------|--------|----------------------|
| I. TypeScript Fullstack | ✅ PASA | Prisma como única fuente de tipos; `packages/types` compartidos entre apps; contratos API tipados |
| II. Arquitectura Enterprise Modular | ✅ PASA | Módulos NestJS por dominio (`auth`, `productos`, `carrito`, `pedidos`, `pagos`, `inventario`); grupos de rutas Next.js separados por contexto |
| III. Seguridad en Capas | ✅ PASA | RLS definido para las 9 tablas de usuario; webhooks Stripe/PayPal verificados por firma; `service_role` solo para operaciones de sistema; `anon_key` segura en cliente por RLS |
| IV. UX/UI Premium | ✅ PASA | Componentes organizados por contexto (`storefront/`, `checkout/`, `backoffice/`); Framer Motion en el plan de animaciones; Shadcn/UI como base |
| V. Escalabilidad y Despliegue Cloud | ✅ PASA | `pg_cron` en DB para TTL (sin estado NestJS); Supabase Realtime para WebSockets (sin estado NestJS); JWT stateless validado por clave pública en cualquier instancia |

**Resultado post-Phase 1**: ✅ TODOS LOS GATES PASAN — Sin violaciones. Sin entradas en Complexity Tracking.

## Estructura del Proyecto

### Documentación (esta funcionalidad)

```text
specs/001-valatino-ecommerce/
├── plan.md              # Este archivo
├── research.md          # Salida Phase 0
├── data-model.md        # Salida Phase 1
├── quickstart.md        # Salida Phase 1
├── contracts/           # Salida Phase 1
│   ├── api-rest.md
│   └── realtime-subscriptions.md
└── tasks.md             # Salida /speckit.tasks (NO creado por /speckit.plan)
```

### Código Fuente (raíz del repositorio)

```text
apps/
├── web/                            # Next.js 14+ — Storefront + Back-Office
│   ├── app/
│   │   ├── (storefront)/
│   │   │   ├── page.tsx            # Home / catálogo principal
│   │   │   ├── productos/
│   │   │   │   └── [slug]/
│   │   │   │       └── page.tsx    # Detalle de producto
│   │   │   ├── carrito/
│   │   │   │   └── page.tsx        # Carrito de compras
│   │   │   └── checkout/
│   │   │       └── page.tsx        # Checkout (Stripe/PayPal)
│   │   ├── (cuenta)/               # Rutas autenticadas del cliente
│   │   │   ├── pedidos/
│   │   │   │   └── page.tsx        # Historial de pedidos
│   │   │   └── perfil/
│   │   │       └── page.tsx        # Datos y direcciones
│   │   └── (backoffice)/           # Rutas protegidas por rol
│   │       ├── pedidos/
│   │       │   └── page.tsx        # Panel en tiempo real
│   │       ├── catalogo/
│   │       │   └── page.tsx        # CRUD de productos (solo Admin)
│   │       └── layout.tsx          # Guard de roles
│   ├── components/
│   │   ├── ui/                     # Shadcn/UI re-exports
│   │   ├── storefront/             # Componentes del catálogo y carrito
│   │   ├── checkout/               # Componentes de pago (Stripe Elements, PayPal)
│   │   └── backoffice/             # Componentes del panel de administración
│   └── lib/
│       ├── supabase/               # Clientes Supabase SSR (server/client)
│       └── api/                    # Funciones de llamada a la API NestJS
│
└── api/                            # NestJS 10+ — Lógica de negocio y APIs
    └── src/
        ├── auth/                   # Guards JWT, Guards de Roles, estrategias Passport
        ├── productos/              # Módulo: catálogo CRUD
        ├── carrito/                # Módulo: gestión de carrito + Soft Allocation
        ├── pedidos/                # Módulo: ciclo de vida de pedidos
        ├── pagos/                  # Módulo: Stripe + PayPal + webhook handlers
        ├── inventario/             # Módulo: control de stock (Hard Stock)
        └── main.ts

packages/
├── types/                          # Tipos TypeScript compartidos (generados por Prisma)
│   └── index.ts
└── config/
    ├── eslint-config/
    └── tsconfig/

supabase/
├── migrations/                     # Migraciones SQL versionadas
└── seed.sql                        # Datos de prueba

turbo.json
package.json
```

**Decisión de estructura**: Monorepo Turborepo (Opción Enterprise). Next.js en `/apps/web` con grupos
de rutas separados por contexto de acceso (`(storefront)`, `(cuenta)`, `(backoffice)`). NestJS en
`/apps/api` organizado en módulos por dominio. Tipos compartidos en `/packages/types` desde Prisma.
Migraciones SQL en `/supabase/migrations` para versionado explícito del esquema.

## Complexity Tracking

> No se registran violaciones de la Constitución. Este apartado queda vacío.
