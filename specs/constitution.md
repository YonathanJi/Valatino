<!--
SYNC IMPACT REPORT
==================
Version change: 1.0.0 → 1.1.0 (alineación con la implementación real)
Cambios:
  - Principio V y Stack Oficial: despliegue backend Railway → Render
    (despliegue real en https://valatino.onrender.com).
  - Principio I y Estrategia de Integración: los tipos del dominio se
    centralizan en el paquete @valatino/types (packages/types); Prisma
    queda como modelo/referencia de esquema (schema.prisma), NO como ORM.
  - Stack Oficial: añadido @supabase/supabase-js como capa de acceso a
    datos real (service_role en la API). Añadido Sonner (notificaciones UI).
  - Estrategia de Integración: documentado que las migraciones son SQL
    versionado en supabase/migrations, aplicadas por la Management API de
    Supabase (NO prisma migrate ni supabase db push).
Principios: sin cambios en el conjunto (I–V intactos).
Notas:
  - Spec-Kit retirado del repo (2026-07-23); esta constitución se conserva
    como guía vinculante del proyecto en specs/constitution.md.
TODOs diferidos: ninguno
-->

# Constitución Valatino

## Principios Fundamentales

### I. TypeScript Fullstack y Seguridad de Tipos

Todo el código del proyecto — frontend, backend y scripts de infraestructura — DEBE estar escrito en
TypeScript. La seguridad de tipos DEBE ser de extremo a extremo: los tipos del dominio se centralizan
en el paquete interno `@valatino/types` (`packages/types`) y se consumen desde web y API sin
duplicación; el esquema de datos se documenta en `schema.prisma` como referencia del modelo. Está
PROHIBIDO usar `any` excepto en puntos de integración externos debidamente justificados y documentados.

**Justificación**: Elimina una clase entera de errores en tiempo de ejecución, facilita el
refactoring seguro y garantiza la mantenibilidad a largo plazo del proyecto.

### II. Arquitectura Enterprise Modular — Monorepo

El proyecto DEBE organizarse como un monorepo gestionado con Turborepo, con al menos dos aplicaciones
separadas: `/apps/web` (Next.js, App Router) para el frontend y `/apps/api` (NestJS) para el backend.
Los módulos DEBEN ser independientes, con inyección de dependencias explícita. La lógica de negocio
compleja DEBE residir en NestJS; los Server Components de Next.js SOLO deben manejar renderizado y
consultas de datos ligeras. No se permiten módulos "cajón de sastre" sin propósito claro.

**Justificación**: La modularidad garantiza que cada parte del sistema pueda evolucionar, testearse
y desplegarse de forma independiente, habilitando escalabilidad a arquitectura de microservicios.

### III. Seguridad en Capas (NON-NEGOTIABLE)

La seguridad DEBE implementarse en tres niveles que no son intercambiables:

- **Capa de Datos**: Supabase con Row Level Security (RLS) activo en todas las tablas que contengan
  datos de usuario. Ninguna tabla de usuario PUEDE quedar sin políticas RLS.
- **Capa de Servidor**: NestJS gestiona toda la lógica de negocio sensible, integraciones con
  terceros (Stripe, PayPal) y validación de autorización avanzada (RBAC).
- **Capa de Integración**: Todas las APIs de terceros DEBEN integrarse mediante Services modulares
  en NestJS con manejo centralizado de errores, logging estructurado y tipado estricto.

Está PROHIBIDO exponer claves secretas en el cliente o gestionar pagos directamente desde el frontend.

**Justificación**: La seguridad en capas garantiza que un fallo en una capa no comprometa el sistema
completo. RLS es la última línea de defensa a nivel de datos.

### IV. UX/UI Premium — Estética Valatino

La interfaz de usuario DEBE seguir una estética premium de referencia "Apple": minimalismo funcional,
uso inteligente del espacio en blanco y sensación de carga instantánea mediante Server Components.
Las animaciones e interacciones DEBEN implementarse con Framer Motion para transiciones fluidas y
micro-interacciones coherentes. El sistema de componentes base es Shadcn/UI sobre Tailwind CSS.
No se permiten librerías de componentes alternativas sin aprobación explícita.

**Justificación**: La experiencia de usuario premium es un diferenciador competitivo clave para
Valatino y DEBE reflejarse en cada pantalla de la plataforma.

### V. Escalabilidad y Despliegue Cloud

El frontend y las funciones Edge DEBEN desplegarse en Vercel. Los servicios de backend (NestJS) DEBEN
desplegarse en Render. La arquitectura de NestJS DEBE diseñarse para escalabilidad horizontal desde
el inicio: sin estado compartido en memoria entre instancias, sin sesiones server-side que impidan el
escalado. Supabase actúa como única fuente de verdad persistente.

**Justificación**: El modelo de despliegue cloud-first garantiza alta disponibilidad y permite
escalar servicios de forma independiente según la demanda.

## Stack Tecnológico Oficial

El stack que se indica a continuación es **vinculante**. Cualquier sustitución o adición de una
tecnología principal DEBE pasar por el proceso de enmienda de esta Constitución.

| Capa | Tecnología | Versión mínima |
|------|-----------|----------------|
| Runtime | Node.js | LTS actual |
| Frontend | Next.js (App Router) | 14+ |
| Backend | NestJS | 10+ |
| Base de datos y Auth | Supabase (PostgreSQL + RLS) | — |
| Acceso a datos | @supabase/supabase-js (service_role en API) | 2+ |
| Modelo de datos / tipos | Prisma schema (referencia) + `@valatino/types` | 5+ |
| Estilos | Tailwind CSS | 3+ |
| Componentes UI | Shadcn/UI (Radix + CVA) | último estable |
| Animaciones | Framer Motion | 11+ |
| Notificaciones UI | Sonner | — |
| Monorepo | Turborepo | último estable |
| Despliegue Frontend | Vercel | — |
| Despliegue Backend | Render | — |
| Lenguaje | TypeScript | 5+ |

## Estrategia de Integración y Comunicación

- Los tipos compartidos entre `/apps/web` y `/apps/api` DEBEN residir en el paquete interno
  `@valatino/types` (`packages/types`) para evitar duplicación.
- El modelo de datos se documenta en `schema.prisma` (referencia); el acceso a datos en runtime se
  realiza con `@supabase/supabase-js` (service_role en la API), NO mediante ORM de Prisma.
- Las migraciones son SQL versionado en `supabase/migrations`, aplicadas por la Management API de
  Supabase. NO se usan `prisma migrate` ni `supabase db push`.
- Las integraciones con Stripe y PayPal DEBEN gestionarse exclusivamente mediante Webhooks desde
  NestJS; el frontend NUNCA debe confirmar ni registrar pagos directamente.
- Las consultas ligeras de datos en el frontend PUEDEN usar el cliente de Supabase directamente,
  siempre que estén protegidas por RLS. Las operaciones sensibles DEBEN pasar por NestJS.

## Gobernanza

Esta Constitución es la fuente de verdad del proyecto Valatino y tiene precedencia sobre cualquier
decisión ad-hoc o preferencia individual. Todo desarrollo DEBE verificar su conformidad con los
principios aquí definidos antes de fusionarse a la rama principal.

**Proceso de enmienda**:
1. Proponer el cambio documentado en un PR con justificación técnica y de negocio.
2. El cambio DEBE describir el impacto sobre los principios existentes.
3. La versión de la Constitución DEBE incrementarse según versionado semántico.
4. La fecha de `Last Amended` DEBE actualizarse en el mismo commit.

**Política de versionado semántico**:
- MAJOR: Eliminación o redefinición incompatible de un principio fundamental o tecnología del stack.
- MINOR: Adición de un nuevo principio, sección o tecnología aprobada.
- PATCH: Clarificaciones, correcciones de redacción o refinamientos no semánticos.

**Revisión de cumplimiento**: Todo PR que toque lógica de negocio, seguridad o integración con
terceros DEBE incluir un "Constitution Check" explícito en la descripción del PR.

**Version**: 1.1.0 | **Ratified**: 2026-07-02 | **Last Amended**: 2026-07-23
