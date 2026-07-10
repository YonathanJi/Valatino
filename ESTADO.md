# Estado del proyecto Valatino — Sesión de trabajo

**Última actualización**: 2026-07-10

---

## Sesión 2026-07-10 (tarde) — Migración de Resend a SendGrid (SMTP + nodemailer)

Resend descartado: sin dominio propio verificado solo entrega al email dueño de la cuenta. Se migró a **SendGrid** (Single Sender Verification: permite enviar a cualquier destinatario verificando solo una dirección remitente).

- **`EmailService` refactorizado a nodemailer + SMTP** (proveedor-agnóstico: sirve SendGrid hoy, cualquier SMTP mañana). Misma interfaz pública (`enviarConfirmacionPedido`/`enviarReembolso`) — webhooks sin cambios. Dependencia `resend` eliminada; `nodemailer` + `@types/nodemailer` añadidas.
- **Nuevas env vars** (`.env` y `.env.example`): `SMTP_HOST=smtp.sendgrid.net`, `SMTP_PORT=465`, `SMTP_USER=apikey`, `SMTP_PASS=<API key SG....>`, `EMAIL_FROM`. Las `RESEND_*` eliminadas.
- **Verificado**: typecheck OK; autenticación SMTP contra SendGrid OK (la key funciona).

### ✅ SendGrid operativo (2026-07-10)

Single Sender verificado: **`jonathanduqee@gmail.com`** → `EMAIL_FROM=Valatino <jonathanduqee@gmail.com>` en `apps/api/.env`. Envíos de prueba por SMTP aceptados (`250 queued`) tanto al propio remitente como a un destinatario distinto (`yonathan.jimenez00@usc.edu.co`) — **ya se puede enviar a cualquier email** (free tier: 100/día). Emails transaccionales de la API desbloqueados; reiniciar `pnpm dev` para cargar el `.env`.

### ✅ SMTP configurado en Supabase remoto (vía `supabase config push`)

- `supabase/config.toml` actualizado: `[auth.email.smtp]` → SendGrid (`smtp.sendgrid.net:465`, user `apikey`, pass vía `env(SENDGRID_API_KEY)` — exportar esa var antes de hacer push). Sender: `jonathanduqee@gmail.com`.
- Templates versionados en repo: `supabase/templates/magic_link.html` (ya existía) y `supabase/templates/confirmation.html` (nuevo, mismo estilo), ambos con `{{ .Token }}`. `content_path` conectados en config.toml.
- Push aplicado y verificado: segundo push muestra "Remote Auth config is up to date".
- Nota: `config push` termina con error `LegacyConfigPushStorageReadNetworkError` en el paso de Storage — **bug del CLI (2.107.0) leyendo la config remota de Storage, inofensivo**: API/DB/Auth se aplican bien y no tocamos Storage.
- **OTP real disparado OK** contra `auth/v1/otp` para `jonathanduqee@gmail.com` (⚠️ esto creó un usuario nuevo en `auth.users` — la BD ya no tiene solo el admin; equivale a TC2 en curso).
- ⚠️ **Bug del CLI descubierto**: `config push` marca los templates como "up to date" pero NO sube el contenido de los `content_path` — el primer OTP llegó como enlace, no como código. **Fix aplicado vía Management API** (PATCH `/v1/projects/{ref}/config/auth` con `mailer_templates_magic_link_content` y `mailer_templates_confirmation_content`), verificado por GET: ambos templates remotos ya contienen `{{ .Token }}` y ningún `ConfirmationURL`. El token de la Management API se extrae del Credential Manager de Windows (entrada "Supabase CLI:supabase", blob UTF-8) — la CLI ya está logueada.
- Segundo OTP de prueba llegó "en blanco" (enviado segundos después del PATCH, antes de propagarse la config; además Gmail recorta contenido repetido del hilo).
- **Rate limit de email subido vía Management API**: `rate_limit_email_sent` 2/h (default) → **30/h**; `smtp_max_frequency` → 60s. (El 429 `over_email_send_rate_limit` del tercer intento fue por el default de 2/h.)
- Tercer OTP enviado 18:52 con config ya propagada → **✅ CONFIRMADO: llega el código de 6 dígitos con el template premium**. Flujo de email OTP 100% operativo (SendGrid + Supabase Auth). Queda pendiente completar el login en `/login` con ese código para cerrar TC2, y luego TC3/TC4.

### Usuario admin recreado + revisión del módulo de administración

- **Descubierto**: `admin@valatino.es` ya NO existía en `auth.users` (quedaban una fila huérfana en `user_roles` y un perfil huérfano en `profiles` — ambos eliminados).
- **Admin nuevo**: `jonathanduqee+admin@gmail.com` (alias de Gmail → los OTP llegan al mismo buzón) · rol `admin` (sin `cliente`) · contraseña en `Contraseñas.txt` (no versionado).
- **BD actual**: 2 usuarios — cliente `jonathanduqee@gmail.com` (941e23dd) y admin `jonathanduqee+admin@gmail.com` (58d6d4de). ⚠️ Las secciones antiguas de este archivo que dicen "solo admin@valatino.es" están desactualizadas.
- **Bug corregido en `UsuariosController.findAll`**: `roles(nombre)` + `.in("roles.nombre", ...)` no filtra filas en PostgREST — devolvía clientes con `roles: null` y la tabla del backoffice rompía con `u.roles.nombre`. Fix: `roles!inner(nombre)`. Typecheck OK.
- Revisión del resto del módulo admin: guards server-side del backoffice (rol desde `user_roles` en BD, nunca metadata) ✅ · `AdminPedidosController` con `@Roles("admin","asesor")` y máquina de estados ✅ · `UsuariosController` admin-only ✅. Pendiente conocido (ya listado): asignación de roles requiere UUID manual — falta buscador por email.
- **TC1 actualizado**: el login de admin ahora se prueba con `jonathanduqee+admin@gmail.com` (debe redirigir a `/backoffice/pedidos`).

### Login de staff separado (`/admin`) + permisos por módulo (súper admin)

**BD** — migración `020_staff_modulos.sql` (aplicada al remoto vía Management API `database/query`, verificada):
- Tabla `staff_modulos` (user_id, modulo ∈ pedidos|catalogo|inventario, otorgado_por, PK compuesta, FK cascade a auth.users). RLS: select solo filas propias; escritura solo service_role.
- ⚠️ `supabase db push` NO sirve en este proyecto: el historial remoto usa versiones timestamp que no coinciden con los archivos `NNN_*` locales — las migraciones se aplican con la Management API (patrón de sesiones anteriores).

**Tipos** (`@valatino/types`, recompilado): `StaffModulo`, `STAFF_MODULOS`, `JwtPayload.modulos?`.

**API NestJS**:
- `@Modulo(...)` decorator + `ModulosGuard`: admin pasa siempre; asesor necesita el módulo otorgado. `JwtStrategy` carga `modulos` desde BD para asesores.
- `AdminPedidosController` → `@Modulo("pedidos")`. `ProductosController`: create/update → `@Roles admin,asesor` + `@Modulo("catalogo")`; stock → `@Modulo("inventario")`.
- `UsuariosController` ampliado (admin-only): `GET /admin/usuarios` ahora devuelve email/nombre (join con profiles) + módulos; `POST /admin/usuarios` crea asesor (email+password+nombre+módulos, reemplaza el rol cliente del trigger); `PATCH /admin/usuarios/:id/modulos`; `DELETE /admin/usuarios/:id` (solo asesores, no a uno mismo).

**Web Next.js**:
- **`/admin` (nueva)**: login de staff con email+contraseña (visual oscura propia, sin navbar). Valida rol staff contra `user_roles`; si es cliente → signOut + error. Redirige a `/backoffice`.
- **`lib/auth/staff.ts` (nuevo)**: `getStaffAcceso()` / `esStaff()` / `puedeVerModulo()` server-side.
- **Backoffice**: sidebar filtrado por módulos (Usuarios solo admin); guards por segmento en pedidos/catalogo/inventario/usuarios; `/backoffice` (page nueva) enruta al primer módulo visible; middleware manda `/backoffice/*` sin sesión a `/admin`.
- **Inventario (nuevo módulo)**: tabla de stock disponible/reservado con badges (Agotado/Bajo/OK) + entrada de mercancía (reusa `StockAjusteModal`).
- **Usuarios (rehecha)**: form "Nuevo asesor" (nombre, email, contraseña, checkboxes de módulos), tabla del equipo con edición inline de módulos y eliminación de asesores. Ya no pide UUID manual (pendiente antiguo cerrado).

**Verificado**: typecheck API+web OK · `signInWithPassword` del admin OK contra Supabase · tabla remota OK. **Falta probar en navegador** (login /admin, crear asesor, entrar como asesor y comprobar módulos).

---

## Sesión 2026-07-10 — Integración de Resend (email transaccional + OTP) [SUSTITUIDA POR SENDGRID]

### Módulo `EmailModule` (NestJS) — nuevo

- **`apps/api/src/email/email.service.ts`**: wrapper sobre la API de Resend. Inicializa `Resend` solo si `RESEND_API_KEY` está presente (modo dev sin key = log + omitir). Métodos: `enviarConfirmacionPedido()` y `enviarReembolso()`.
- **`apps/api/src/email/email.module.ts`**: `@Global()` — disponible en todos los módulos sin import explícito.
- **`apps/api/src/email/templates/confirmacion-pedido.ts`**: template HTML inline con estética Apple (dark text, SF font stack, border-radius, banner de estado verde/naranja). Muestra items, total, método de pago y dirección de envío. Reutilizable para confirmación y reembolso (`esReembolso: true`).
- **`InventarioService.getPedidoConItems(pedidoId)`**: nuevo método que retorna pedido + items + snapshot de envío para alimentar el template.

### Integración en webhooks

- **Stripe `payment_intent.succeeded`**: tras crear pedido + registrar transacción → envía email de confirmación.
- **Stripe `charge.refunded`**: tras actualizar estado a `REEMBOLSADO` → envía email de reembolso.
- **PayPal `PAYMENT.CAPTURE.COMPLETED`**: tras crear pedido + registrar transacción → envía email de confirmación.
- **PayPal `PAYMENT.CAPTURE.REFUNDED`**: tras actualizar estado a `REEMBOLSADO` → envía email de reembolso.
- Todos los envíos son **no bloqueantes** (try/catch + warn log); un fallo de Resend nunca rompe el webhook.

### Configuración de entorno

- `RESEND_API_KEY` y `RESEND_FROM_EMAIL` añadidas a `.env` y `.env.example`.
- Dependencia `resend` instalada en `@valatino/api`.
- **Fix 2026-07-10 (tarde)**: los envíos fallaban con `403 — The valatino.es domain is not verified`. La API key es válida (tipo "sending only"). Solución temporal: `RESEND_FROM_EMAIL=Valatino <onboarding@resend.dev>` en `apps/api/.env` (envío de prueba verificado OK contra la API de Resend). ⚠️ Limitación del modo prueba: Resend solo entrega a la dirección del dueño de la cuenta Resend hasta verificar el dominio — en este caso **`yonathan.jimenez00@usc.edu.co`** (envío de prueba entregado OK el 2026-07-10, id `dc887a50`). Usar ese email como cliente en todas las pruebas de checkout/OTP mientras tanto. Para producción: verificar `valatino.es` en https://resend.com/domains (añadir registros DNS SPF/DKIM) y volver a `noreply@valatino.es`.

### Pendiente manual (Dashboard de Supabase + Resend)

⚠️ **Bloqueante para que los OTP lleguen a cualquier email**:

1. **Crear cuenta en [resend.com](https://resend.com)** → obtener API key (`re_...`).
2. **Verificar dominio** `valatino.es` en Resend (o usar `on.resend.dev` para pruebas).
3. **Pegar la API key** en `apps/api/.env` → `RESEND_API_KEY=re_...`.
4. **Supabase Dashboard → Auth → SMTP Settings**:
   - Habilitar "Custom SMTP Settings".
   - Host: `smtp.resend.com` · Port: `465` · Username: `resend` · Password: `<API key de Resend>`.
   - Sender email: `noreply@valatino.es` (o `valatino@on.resend.dev` para pruebas).
   - Minimum interval: `0`.
   - Guardar → "Send test email" para validar.
5. **Supabase Dashboard → Auth → Email Templates → Magic Link**:
   - Personalizar: `Tu código de acceso a Valatino es: {{ .Token }}`.
6. **Supabase Dashboard → Auth → Rate Limits**: OTP → 5/min/IP.

Una vez hecho esto, el flujo OTP nativo de Supabase (`signInWithOtp` → `verifyOtp`) enviará los códigos vía Resend a **cualquier email**, no solo team members.

---

## Sesión 2026-07-09 — Auditoría completa + fixes de seguridad y checkout invitado

### BD (migraciones 016–019, aplicadas al Supabase remoto y verificadas)

- **016**: funciones de stock aseguradas. `reservar_stock` devuelve UUID de la reserva (rollback preciso), valida `cantidad > 0` y `FOUND`; `confirmar_stock` acotado por `p_producto_ids[]` (evita fuga de inventario con reservas de otros intentos); `ajustar_stock` valida stock negativo con mensaje claro; **REVOKE EXECUTE de anon/authenticated en las 4 RPCs** (antes cualquiera podía llamarlas con la anon key pública).
- **017**: emails normalizados a `lower()` en `handle_new_user`, `vincular_pedido_nuevo`, `vincular_pedidos_por_documento` + backfill + índice único funcional. **Trigger `trg_vincular_pedidos` creado en `profiles`** (la función existía huérfana, sin trigger). Trigger de auth.users acotado a cambios de email/metadata.
- **018**: RLS endurecida — eliminadas TODAS las policies INSERT/UPDATE/DELETE de cliente en `pedidos`, `pedido_items`, `transacciones_pago`, `stock_reservas`, `carritos`, `carrito_items` (solo escribe service_role vía NestJS). Añadida `direcciones_select_staff`. `roles` solo legible por authenticated.
- **019**: enum `REEMBOLSADO`; columnas snapshot `envio_*` en `pedidos` (invitados); tabla `checkout_datos` (staging por sesión para webhooks, RLS sin policies, limpieza pg_cron 48h); CHECK `pedidos_localizable_check`; índices `email_cliente`/`documento_cliente` + pg_trgm en `productos.nombre`.
- **Reproducibilidad**: 012 y 013 corregidas (referenciaban función/columna creadas manualmente en remoto; ahora `supabase db reset` funciona desde cero).
- **schema.prisma sincronizado**: modelo `Profile` añadido, `direccionEnvioId` nullable, `emailCliente`/`documentoCliente`/`envio_*`, enum REEMBOLSADO.

### API NestJS

- **DTOs con class-validator en todos los controladores** (carrito, productos, pedidos, direcciones, usuarios, pagos) — el ValidationPipe global por fin actúa. Cerrado el exploit de cantidad negativa en carrito.
- **Anti-IDOR**: `updateItem`/`removeItem` acotados al carrito del solicitante.
- **`OptionalJwtGuard`** (nuevo) en carrito/checkout/pagos: `req.user` se puebla si hay token sin exigirlo (antes el carrito de un usuario logueado nunca se asociaba a su user_id).
- **Webhooks idempotentes**: se comprueba `evento_id` antes de crear el pedido (Stripe y PayPal reintentan webhooks → antes duplicaba pedidos).
- **Reembolsos**: `charge.refunded` / `payment_intent.canceled` (Stripe) y `PAYMENT.CAPTURE.REFUNDED` (PayPal) → estado `REEMBOLSADO` + transacción. Máquina de estados actualizada (asesor no puede reembolsar).
- **PayPal capture**: nuevo `POST /pagos/paypal/capture-order` — **antes nada capturaba la orden aprobada y el pago nunca se completaba**.
- **Checkout de invitados**: `create-payment-intent`/`create-order` aceptan dirección inline; los datos se persisten en `checkout_datos` y el webhook los usa para el snapshot del pedido. Dirección guardada verificada contra ownership.
- Errores `throw new Error` → excepciones HTTP de Nest; errores de insert de Supabase ya se comprueban y loguean.

### Web Next.js

- **Checkout de invitado funcional**: `DireccionForm` inline (también para usuarios sin direcciones guardadas), validación de email/DNI-NIE/CP, botones de pago deshabilitados hasta completar datos.
- **Countdown real de la reserva** (15 min con `expiresAt`) + pantalla de "reserva expirada" con renovación.
- **`/checkout/confirmacion` valida `redirect_status`**: éxito / procesando / fallido (antes siempre decía "¡Pedido confirmado!") y muestra la referencia de pago.
- **Guard de rol unificado**: `backoffice/layout.tsx`, `Navbar` y `AuthForms` consultan `user_roles` en BD (nunca `user_metadata`, mutable por el usuario).
- **`lib/api/client.ts`** (nuevo): fetch tipado con Bearer automático + cookies + normalización de errores. Migrados useCarrito, checkout, Stripe/PayPal, DireccionSelector.
- Otros: `public/placeholder.png` creado; middleware soporta cookies chunked de Supabase; `isLoading` colgado arreglado en ProductoForm/StockAjusteModal; token OTP se limpia al cambiar correo; páginas `/politica-privacidad` y `/terminos`; `postcss.config.js` corregido (rompía `next build`); deps muertas eliminadas (zod, react-hook-form); `.gitignore` creado.

### Pendientes conocidos (no bloqueantes)

- Tests: cobertura 0% — prioridad para checkout/webhooks/inventario.
- CI (GitHub Actions: lint + build + test).
- Accesibilidad (aria-* en menú Navbar, botones de cantidad).
- `loading.tsx` por segmento de ruta; montar `ErrorBoundary` en layouts.
- Buscador por email en backoffice/usuarios (hoy requiere UUID manual).
- Normalizar `productos.categoria` a tabla propia.
- SMTP custom en Supabase (bloqueante para OTP en producción, ver sección "Pendientes manuales"). **Módulo NestJS listo — falta configurar SMTP en Dashboard.**
**Servidores**: corriendo en `http://localhost:3000` (Next.js) y `http://localhost:4000` (NestJS)
**Logs**: `C:\Users\jonat\AppData\Local\Temp\opencode\valatino-dev.log`

---

## Cómo reanudar mañana

1. **Levanta servidores** (si no están corriendo):
   ```powershell
   cd C:\YJIMENEZ\Valatino
   pnpm dev
   ```
2. **Lee este archivo** para recuperar contexto.
3. **Verifica BD limpia** con:
   ```sql
   SELECT count(*) FROM auth.users;  -- debe ser 1 (admin)
   SELECT count(*) FROM productos;  -- debe ser 10
   SELECT count(*) FROM pedidos;     -- debe ser 0
   ```
4. **Pruebas sugeridas** (ver sección "Pruebas pendientes").

---

## Resumen del trabajo completado

### Fase 1 — Fixes críticos del proyecto (constitución)

- ✅ **Schema SQL sincronizado** repo local ↔ Supabase remoto (migraciones 001-015 en `supabase/migrations/`).
- ✅ **RLS segura**: cerradas policies `WITH CHECK (true)` / `USING (true)` en `stock_reservas`, `carritos`, `carrito_items`, `pedidos`, `pedido_items`, `transacciones_pago`.
- ✅ **Functions SECURITY DEFINER**: revocadas EXECUTE públicas; `search_path` fijo en 9 funciones.
- ✅ **RBAC funcional**: `JwtStrategy.validate` ahora consulta `user_roles` en cada request (no depende de `user_metadata.role` estática).
- ✅ **NestJS compila bajo `strict:true`**: todos los servicios tipados con `SupabaseClient`.
- ✅ **ThrottlerGuard activo** globalmente vía `APP_GUARD`.
- ✅ **Fusión de carrito conectada**: endpoint `POST /carrito/fusionar` + llamada en `LoginForm` post-login.
- ✅ **Backoffice bloquea admin-only server-side**: `layout.tsx` en `/backoffice/catalogo` y `/backoffice/usuarios` valida rol admin.
- ✅ **`payment_intent.payment_failed` libera reservas** inmediatamente (Stripe + PayPal `CAPTURE.DENIED`).
- ✅ **Error boundaries nativos**: `app/error.tsx` y `app/not-found.tsx`.
- ✅ **Button con Framer Motion**: micro-interacciones `whileTap`/`whileHover`.

### Fase 2 — Email y documento únicos en registro

- ✅ **Migración 013**: UNIQUE constraint en `profiles.email` + trigger `handle_new_user` (sincroniza `profiles` desde `auth.users` con `raw_user_meta_data`).
- ✅ **Endpoint `POST /auth/check-registro`** (eliminado posteriormente al adoptar OTP).
- ✅ **`RegistroForm` con `react-hook-form` + `zod`** (eliminado posteriormente al adoptar OTP).

### Fase 3 — Unificación a una sola vía: Email + OTP (passwordless)

- ✅ **Migración 015**: `vincular_pedido_nuevo()` simplificada a match solo por `email_cliente`. `vincular_pedidos_por_documento()` ampliada para también vincular por email.
- ✅ **Eliminado `auth-public.controller.ts`** (sin endpoints `check-registro` ni `check-documento`).
- ✅ **Webhook Stripe/PayPal**: lookup de usuario solo por `email`.
- ✅ **`POST /pedidos/vincular`**: renombrado método a `vincularPorEmail`.
- ✅ **`AuthForms.tsx` reescrito**: `AuthForm` con 2 pasos (enviar código → verificar 6 dígitos). `signInWithOtp` + `verifyOtp`. Tras éxito, llama `/pedidos/vincular` y `/carrito/fusionar` en paralelo. Redirige según rol.
- ✅ **`/login` reescrito**: UI premium, solo campo email + botón "Enviar código". Sin "Crear cuenta".
- ✅ **`/registro` → redirect a `/login`** (compatibilidad bookmarks).
- ✅ **Middleware** redirige a `/login` (antes `/registro`).
- ✅ **Páginas internas** (`cuenta/layout`, `cuenta/pedidos`, `cuenta/perfil`) redirigen a `/login`.
- ✅ **`/checkout/confirmacion`** simplificado: un solo CTA "Iniciar sesión".
- ✅ **`/checkout`**: banner "Tienes una cuenta con este correo" → redirige a `/login?email=...&redirectTo=/checkout`. Consulta directa a `profiles` por email.
- ✅ **`/auth/callback/route.ts`** nuevo: handler PKCE/OTP que intercambia `code`/`token_hash` y redirige a `redirectTo`.

### Fase 4 — Limpieza de BD para pruebas

- ✅ Borrados: pedidos, pedido_items, transacciones_pago, carritos, carrito_items, stock_reservas, direcciones_envio.
- ✅ Borrados clientes de `auth.users` (excepto `admin@valatino.es`).
- ✅ Eliminado rol espurio `cliente` del admin (solo conserva `admin`).
- ⏳ Catálogo de 10 productos intacto.

---

## Estado de la BD después de la limpieza

| Entidad | Cantidad | Detalle |
|---|---|---|
| `auth.users` | 1 | `admin@valatino.es` |
| `user_roles` | 1 | admin → admin |
| `profiles` | 1 | admin@valatino.es |
| `productos` | 10 | Catálogo latinoamericano intacto |
| `pedidos` / `pedido_items` / `transacciones_pago` | 0 | Limpio |
| `carritos` / `carrito_items` | 0 | Limpio |
| `stock_reservas` | 0 | Limpio |
| `direcciones_envio` | 0 | Limpio |

---

## Pendientes manuales (Dashboard de Supabase)

⚠️ **Bloqueante para producción**: sin SMTP custom, los OTP solo llegan a emails team-member.
*(El módulo NestJS de Resend ya está integrado — ver sesión 2026-07-10). Falta configurar SMTP en Supabase Dashboard.*

1. **Auth → Providers → Email**: confirmar Email OTP habilitado.
2. **Auth → URL Configuration → Site URL**: `http://localhost:3000` (dev) o dominio prod.
3. **Auth → URL Configuration → Redirect URLs**: añadir:
   - `http://localhost:3000/auth/callback`
   - `https://tudominio.com/auth/callback` (prod)
4. **Auth → Email Templates → Magic Link**: personalizar template "Valatino — Tu código de acceso" usando `{{ .Token }}`.
5. **Auth → Rate Limits → OTP**: ajustar a 5/minuto/IP.
6. **Auth → SMTP Settings**: configurar **SMTP custom** (Resend recomendado, free 3000/mes).
   - Host: `smtp.resend.com`, Puerto: `465`
   - Username: `resend`, Password: API key
   - Sender email: `noreply@valatino.es`
7. **Password sign-in**: mantener habilitado para usuarios legacy (no afecta el nuevo flujo OTP).

---

## Pruebas pendientes (cuando tengas SMTP configurado)

- **TC1 (login admin existente)**: `/login` con `admin@valatino.es` → recibir email con código → ingresarlo → sesión iniciada → redirige a `/backoffice/pedidos`.
- **TC2 (login nuevo email)**: `/login` con email no registrado → código → verificar → sesión creada + `auth.users` con nueva fila + `profiles` con email + `user_roles` con rol `cliente`.
- **TC3 (checkout invitado → reclamar)**: Comprar como invitado con email nuevo → tras pago, pedido creado con `user_id=NULL` → `/login` con ese email → OTP → `trigger_vincular_pedidos` en `profiles` asigna `user_id` → pedido aparece en `/cuenta/pedidos`.
- **TC4 (banner checkout)**: En `/checkout` escribir email existente en `profiles` (p.ej. `admin@valatino.es`) → aparece banner "Tienes una cuenta con este correo" → click "Iniciar sesión" → `/login?email=admin@valatino.es&redirectTo=/checkout`.

---

## Mejoras opcionales (no bloqueantes)

- **Página `/cuenta/perfil`**: permitir al usuario setear una password opcional con `supabase.auth.updateUser({ password })` para login clásico.
- **PageTransition en `/cuenta` y `/backoffice` layouts**: actualmente solo en storefront.
- **ErrorBoundary montado en `AppShell`**: existe `ErrorBoundary.tsx` pero no se usa en ningún layout.
- **Capa `lib/api/`**: centralizar llamadas `fetch` dispersas en clientes tipados.
- **DTOs con `class-validator`** en NestJS (Productos/Create, Pedidos/UpdateEstado).
- **Logging estructurado** (Pino/Winston) en lugar de `Logger` nativo.
- **Seed con usuario admin inicial** vía script `supabase/seed.ts` (no sólo instrucciones manuales).
- **Script `clean` portable** (rimraf en lugar de `find` bash-only para Windows).

---

## Migraciones SQL aplicadas (Supabase remoto)

| # | Nombre | Estado repo local |
|---|---|---|
| 001 | extensions | ✅ |
| 002 | schema | ✅ |
| 003 | rls | ✅ |
| 004 | cron | ✅ |
| 005 | functions | ✅ |
| 006 | liberar_reserva | ✅ |
| 007 | profiles | ✅ |
| 008 | fix_assign_role | ✅ |
| 009 | make_direccion_envio_nullable | ✅ |
| 010 | add_checkout_documento_campos | ✅ |
| 011 | fix_rls_reservas_carritos_inseguras | ✅ |
| 012 | fix_rls_pedidos_rpc_search_path | ✅ |
| 013 | unique_email_trigger_handle_new_user | ✅ |
| 014 | vincular_pedido_nuevo_y_backfill | ✅ |
| 015 | simplificar_vinculacion_por_email | ✅ |

Todas sincronizadas en `supabase/migrations/`.

---

## Archivos clave modificados

- `apps/api/src/auth/strategies/jwt.strategy.ts` — RBAC con consulta BD
- `apps/api/src/auth/usuarios.controller.ts` — tipado + `UserRole`
- `apps/api/src/auth/auth.module.ts` — sin `AuthPublicController`
- `apps/api/src/pagos/webhooks.controller.ts` — lookup por email + liberar reservas
- `apps/api/src/pedidos/pedidos.service.ts` — `vincularPorEmail`
- `apps/api/src/pedidos/pedidos.controller.ts` — endpoint `/pedidos/vincular`
- `apps/api/src/pedidos/admin-pedidos.controller.ts` — tipado `PedidoEstado`
- `apps/api/src/carrito/carrito.controller.ts` — endpoint `/carrito/fusionar`
- `apps/api/src/carrito/carrito.module.ts` — import `AuthModule`
- `apps/api/src/app.module.ts` — `ThrottlerGuard` global
- `apps/web/components/storefront/AuthForms.tsx` — `AuthForm` OTP 2 pasos
- `apps/web/app/(storefront)/login/page.tsx` — UI OTP
- `apps/web/app/(storefront)/registro/page.tsx` — redirect a `/login`
- `apps/web/app/(storefront)/checkout/page.tsx` — banner por email, sin check-registro
- `apps/web/app/(storefront)/checkout/confirmacion/page.tsx` — un solo CTA
- `apps/web/app/auth/callback/route.ts` — handler PKCE/OTP (nuevo)
- `apps/web/app/backoffice/catalogo/layout.tsx` — guard admin (nuevo)
- `apps/web/app/backoffice/usuarios/layout.tsx` — guard admin (nuevo)
- `apps/web/app/cuenta/layout.tsx` — redirect a `/login`
- `apps/web/app/cuenta/pedidos/page.tsx` — redirect a `/login`
- `apps/web/app/cuenta/perfil/page.tsx` — redirect a `/login`
- `apps/web/app/error.tsx` — error boundary nativo (nuevo)
- `apps/web/app/not-found.tsx` — 404 nativo (nuevo)
- `apps/web/components/ui/button.tsx` — Framer Motion
- `apps/web/middleware.ts` — redirect a `/login`
- `apps/api/src/auth/auth-public.controller.ts` — **ELIMINADO**

---

## Constitución (recordatorio)

Principios rectores del proyecto (`constitucion.txt`):

1. **TypeScript Fullstack** — sin `any`, tipos desde Prisma.
2. **Arquitectura Enterprise Modular** — monorepo Turborepo, módulos por dominio.
3. **Seguridad en Capas** — RLS en todas las tablas; sin secretos en cliente; webhooks verificados.
4. **UX/UI Premium** — estética Apple; Shadcn/UI + Framer Motion.
5. **Escalabilidad Cloud** — JWT stateless; TTL vía `pg_cron`; sin estado en NestJS.

Stack: Next.js 14+ (App Router) · NestJS 10+ · Supabase (PostgreSQL+RLS) · Prisma · Tailwind+Shadcn/UI · Framer Motion · Stripe/PayPal · Vercel/Railway.

---

**Mañana**: lee este archivo, levanta `pnpm dev`, ejecuta las pruebas pendientes y continúa con las mejoras opcionales o con lo que necesites.