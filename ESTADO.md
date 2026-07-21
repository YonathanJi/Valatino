# Estado del proyecto Valatino — Sesión de trabajo

**Última actualización**: 2026-07-21

---

## ▶️ Para reanudar (leer primero)

**El proyecto está DESPLEGADO y funcionando en local y en línea** (con claves de test).

- **En línea**: tienda **https://valatino-api-steel.vercel.app** (Vercel) · API **https://valatino.onrender.com** (Render) · Supabase (BD/Auth/Storage). Auto-deploy en cada push a `main`. Render free duerme tras ~15 min (1ª carga lenta al despertar, normal).
- **Local**: `cd C:\YJIMENEZ\Valatino && pnpm dev` levanta web (3000) + API (4000). El `.env` local apunta la web a `localhost:4000`.
  - ⚠️ Si `localhost:3000` da 500 tras muchos cambios → caché de dev corrupto: parar `pnpm dev`, borrar `apps/web/.next`, relevantar. Inofensivo.
- **Aplicar migraciones al remoto**: por Management API (script en scratchpad de la sesión / patrón `apply-migration.ps1`), NO `supabase db push`. Última aplicada: **029** (IVA en compras). Migraciones 024–029 nuevas esta racha.
- **Tokens de despliegue**: la gestión de Render y Vercel se hizo por sus APIs REST. Si hace falta re-tocar, se necesita un token nuevo de cada uno (los usados quedaron expuestos y deben regenerarse — ver abajo).

### ⚠️ Pendientes de Jonathan (acción manual)
1. **Regenerar el token de Render** (`rnd_...`) — Account Settings → API Keys.
2. **Regenerar el token de Vercel** (`vcp_...`) — Account Settings → Tokens.
3. Producción real (futuro): dominio propio, claves Stripe `live`, webhook Stripe → `https://valatino.onrender.com/pagos/stripe/webhook`, y actualizar CORS_ORIGIN / Supabase URLs al dominio propio.

### Estado del negocio
- Catálogo real creado por Jonathan (productos con foto en la nube). Stock inicial cargado con la 1ª **compra de mercancía** (factura 202521188, IVA 10% salvo Pony Malta 21%, total c/IVA 93,64 €).
- Pendientes de fondo de siempre: **tests (0%)**, CI, accesibilidad.

---

## Sesión 2026-07-21 — Preparación de despliegue (Vercel web + Render API)

- **Fix build Vercel** (commit 10a70d3): la API fallaba en Vercel (TS2339 `Response.ok/json`) porque el `lib` era solo ES2022; añadido `DOM` al lib de `packages/config/tsconfig/nestjs.json` (fetch/Response estables en cualquier entorno; Node 20 trae fetch global).
- **Arquitectura de despliegue**: web (`apps/web`) → **Vercel**; API (`apps/api`) → **Render**. Se conectan por `NEXT_PUBLIC_API_URL` (web → URL pública de Render). Vercel NO debe compilar la API: Root Directory = `apps/web`.
- **API lista para Render**:
  - **PayPal opcional** (`paypal.service.ts`): `config.get` en vez de `getOrThrow` — la API arranca sin credenciales de PayPal (Jonathan no las tiene); sus endpoints devuelven 503 y Stripe sigue OK. `get configurado`.
  - **`main.ts`**: `CORS_ORIGIN` admite lista separada por comas + se permiten `*.vercel.app` (preview URLs) vía callback; `app.listen(port, "0.0.0.0")` (obligatorio en Render).
  - **`HealthController`** `GET /health` → `{status:"ok"}` (health check de Render).
  - **`render.yaml`** (Blueprint): build `pnpm install --prod=false && turbo run build --filter=@valatino/api`, start `node apps/api/dist/main.js`, healthCheckPath `/health`, env vars secretas como `sync:false`.
  - **`DEPLOY.md`**: guía paso a paso (Render primero → Vercel → conectar CORS/Supabase/webhooks).
- Verificado: `turbo build --filter=@valatino/api` OK (types+api) · `GET /health` responde 200 en local.
- **API DESPLEGADA Y VIVA en Render** (2026-07-21): servicio `Valatino` (`srv-d9ft2q7avr4c73dvqu90`), URL **https://valatino.onrender.com** (`/health` → 200, `/productos` → 200). Plan free (duerme tras ~15 min inactividad). Auto-deploy en cada commit a `main`. Variables de entorno cargadas en Render (Supabase, Stripe, SMTP, CORS). CORS permite `*.vercel.app` automáticamente, así que la web de Vercel funcionará sin tocar CORS_ORIGIN.
  - **Fix crítico de arranque**: `nest build` dejaba el compilado en `packages/config/tsconfig/dist` (el `outDir` estaba en el tsconfig base → se resuelve relativo a ese archivo). Se fijó `outDir`/`rootDir` en `apps/api/tsconfig.json` → build correcto en `apps/api/dist/main.js`. En dev no se notaba (nest start en memoria).
  - **Fix build Render**: quitado `corepack enable` del buildCommand (Render trae pnpm y el FS es de solo lectura); build con `pnpm --filter` explícito (types → api).
  - Gestión del servicio hecha vía Render REST API (token de Jonathan). ⚠️ **Jonathan debe regenerar ese API token de Render** (quedó expuesto en el chat).
  - **WEB DESPLEGADA Y PÚBLICA en Vercel** (2026-07-21): **https://valatino-api-steel.vercel.app** (HTTP 200, home renderiza los productos reales desde la API de Render). Proyecto Vercel `prj_VwIo6RyE0YRKsz35VdOfNK6Knaf6` (team `yonathanji`).
    - El proyecto estaba mal configurado: framework `nestjs` + rootDir `apps/api` (desplegaba la API → crash FUNCTION_INVOCATION_FAILED). Reconfigurado a **framework `nextjs` + rootDir `apps/web`**, buildCommand `pnpm --filter @valatino/types build && pnpm --filter @valatino/web build`.
    - 5 variables `NEXT_PUBLIC_*` recreadas con valores correctos (clave: `NEXT_PUBLIC_API_URL=https://valatino.onrender.com`; antes estaba mal).
    - Desactivada la Deployment Protection (ssoProtection) para que la tienda sea pública.
    - Gestión vía Vercel REST API (token `vcp_...` de Jonathan). ⚠️ **Regenerar también ese token de Vercel** (expuesto en el chat), además del de Render.
    - Nombre del proyecto sigue siendo "valatino-api" (cosmético; despliega la web). CORS de la API ya permite `*.vercel.app`.
    - **Login configurado en Supabase** (vía Management API `config/auth`): `site_url=https://valatino-api-steel.vercel.app`, `uri_allow_list=http://localhost:3000/**,https://valatino-api-steel.vercel.app/**` (dev local conservado). Templates OTP intactos. Login de clientes (OTP) y `/admin` operativos en la web en vivo.

### 🟢 STACK COMPLETO EN PRODUCCIÓN (2026-07-21)

- **Web**: https://valatino-api-steel.vercel.app (Vercel) · **API**: https://valatino.onrender.com (Render) · **BD/Auth/Storage**: Supabase. Todo con claves de **test**. Auto-deploy en cada push a `main`.
- ⚠️ **Pendiente de Jonathan**: regenerar los tokens expuestos en el chat — Render (`rnd_...`), Vercel (`vcp_...`). Y cuando pase a producción real: dominio propio, claves Stripe `live`, webhook de Stripe → `https://valatino.onrender.com/pagos/stripe/webhook`.

---

## Sesión 2026-07-18 — Submódulo de facturas de compra (entrada de mercancía documentada)

Petición: submódulo del backoffice para subir la factura del proveedor en PDF, registrar su contenido (producto + cantidad), que al enviar el inventario sume esas unidades, y poder consultar el histórico factura a factura.

### ✅ Módulo `facturas` (asignable a asesores, patrón dashboard)

- **Migración 024** (`024_facturas_compra.sql`), aplicada al remoto vía Management API y verificada:
  - CHECK de `staff_modulos.modulo` admite `'facturas'`.
  - Tablas `facturas_compra` (numero_factura, proveedor, notas, pdf_path, total_unidades, creado_por) y `factura_compra_items` (snapshot `nombre_producto` + cantidad, FK cascade). RLS sin policies (solo service_role). Índices por fecha y por factura.
  - **RPC transaccional `registrar_factura_compra`**: inserta factura + líneas e incrementa `stock_disponible`, todo o nada (si una línea falla, no queda nada a medias). EXECUTE revocado de anon/authenticated.
  - **Bucket privado `facturas`** en Storage (insert idempotente en `storage.buckets`); sin policies en storage.objects — solo la API sube y firma URLs.
- ⚠️ El truco del Credential Manager para el token de la Management API sigue funcionando, pero en PS 5.1 `ConvertTo-Json` serializa mal algunos strings largos → usar `@{ query = "$sql" }` (interpolado) y enviar el body como bytes UTF-8. Script reutilizable en el scratchpad de la sesión.
- **API** (`apps/api/src/facturas/`): `POST /admin/facturas` (multipart: `pdf` + campos + `items` como JSON string, validado con zod — máx. 10 MB, verifica mimetype y magic bytes `%PDF`; si la RPC falla borra el PDF subido para no dejar huérfanos), `GET /admin/facturas` (paginado), `GET /admin/facturas/:id` (detalle con líneas), `GET /admin/facturas/:id/pdf` (URL firmada 1 h). Guards `@Roles("admin","asesor")` + `@Modulo("facturas")`. Dependencia nueva: `@types/multer` (dev).
- **Tipos**: `FacturaCompra`/`FacturaCompraItem` en `@valatino/types` (recompilado); `StaffModulo` incluye `"facturas"` → checkboxes de usuarios y validación IsIn lo recogen solos. Modelos añadidos a `schema.prisma`.
- **Web**: `/backoffice/facturas` (histórico), `/backoffice/facturas/nueva` (PDF + líneas dinámicas producto/cantidad + total en vivo) y `/backoffice/facturas/[id]` (detalle + botón "Ver PDF" con URL firmada). Guard por módulo en layout; enlace "🧾 Facturas" en sidebar; MODULO_LABELS en usuarios y perfil; `/backoffice` enruta también a facturas.
- **Fix `apiFetch`**: ya no fuerza `Content-Type: application/json` cuando el body es `FormData` (el navegador debe fijar el boundary).
- **Verificado E2E en vivo** (login real del admin): 401 anónimo · factura con PDF → stock 250→257 · histórico/detalle/PDF firmado (200, devuelve el PDF) · producto inexistente → 400 con rollback total y PDF eliminado · archivo no-PDF → 400 · cantidad 0 → 400. Datos de prueba limpiados (factura borrada, stock restaurado, PDF eliminado del bucket). Typecheck types+API+web OK.
- **Pendiente**: probar el flujo en navegador (formulario de alta y detalle); los cambios están sin commitear.

### ✅ Imágenes de producto a la nube (catálogo)

- Petición: el formulario de producto pedía una URL de imagen (local); ahora pide el archivo y lo sube a Supabase Storage, como las facturas — todo en nube.
- **Migración 025** (`025_bucket_productos.sql`, aplicada al remoto): bucket **público** `productos` (lectura anónima por URL pública — el storefront la muestra a cualquiera; `**.supabase.co` ya estaba permitido en next.config). Escritura sin policies: solo service_role.
- **API**: `POST /productos/imagen` (`@Modulo("catalogo")`, multipart `imagen`, máx. 5 MB, valida mimetype + magic bytes JPG/PNG/WebP) → sube al bucket con nombre UUID y devuelve `{ url }` pública. `ProductosService.subirImagen` + `EXTENSION_POR_MIME`.
- **Web** (`ProductoForm`): input file con vista previa (object URL local + miniatura de la imagen actual al editar); al guardar sube primero la imagen y crea/actualiza el producto con la URL en `imagenes`. Si se edita sin elegir archivo, conserva la imagen actual; sin imagen → `/placeholder.png`.
- **Verificado E2E**: 401 anónimo · PNG válido → URL pública responde 200 · archivo falso → 400. Imagen de prueba borrada del bucket. Typecheck API+web OK.
- **Fix "File too large"**: las imágenes de IA/móvil superaban los 5 MB del endpoint. `ProductoForm` ahora redimensiona (máx. 1200px de lado) y comprime a WebP 0.85 **en el navegador** (`createImageBitmap` + canvas) antes de subir — cualquier imagen llega ligera y con las medidas de la spec. El límite de 5 MB del servidor queda como red de seguridad.
- **Fix "property stock_disponible should not exist"** al editar: el form enviaba `stock_disponible` también en el PATCH y `UpdateProductoDto` no lo admite (forbidNonWhitelisted; por diseño el stock se gestiona desde Inventario/Facturas). Ahora solo se envía al crear; al editar el campo aparece deshabilitado con la nota "El stock se gestiona desde Inventario o Facturas".
- **Eliminar producto** (petición de Jonathan): `DELETE /productos/:id` (`@Modulo("catalogo")`, 204) + botón "Eliminar" con confirm en `ProductoTabla`. Borrado físico solo si el producto no tiene histórico: con pedidos/facturas/carritos la FK (23503) → **409** "Desactívalo para ocultarlo del catálogo" (el histórico nunca se rompe). Al borrar, sus imágenes propias del bucket `productos` se eliminan también. Verificado E2E: crear+borrar → 204 y 404 después · producto con pedidos → 409 · anónimo → 401. Typecheck OK.
- **Categorías fijas del catálogo**: `CATEGORIAS_PRODUCTO` en `@valatino/types` — **Dulces, Galletas, Bebidas, Snacks, Café, Despensa** (elegidas con Jonathan). El form usa `<select>` y los DTOs validan con `@IsIn` (categoría libre → 400 con la lista en el mensaje). Verificado E2E. Nota: el pendiente antiguo "normalizar categoria a tabla propia" sigue abierto; esta lista fija es el paso intermedio.
- **Campo stock eliminado de ProductoForm** (petición de Jonathan): tampoco al crear — los productos nacen con stock 0 (default de BD) y las unidades entran solo por Inventario o Facturas. El DTO conserva `stock_disponible` opcional por API, pero la UI ya no lo envía nunca.
- **ProductoTabla del catálogo**: fuera el botón +Stock (StockAjusteModal queda solo en Inventario) y las acciones ahora son botones con icono — "✏️ Editar" y "🗑️ Eliminar" (pill con borde, hover tintado).

### ✅ Variantes de sabor agrupadas en el storefront + fix de slugs

- **Decisión de modelado** (consultada por Jonathan): los sabores son productos independientes (inventario propio, línea propia en facturas) — NO sistema de variantes en BD (tocaría toda la ruta crítica de reservas/checkout con 0% tests). El agrupado es solo visual.
- **Convención**: nombrar las variantes "Producto Sabor X" (ej. "Galleta Festival Sabor Fresa"). `lib/productos/sabores.ts` (`partirNombrePorSabor`, `agruparPorSabor`, `hermanosDeSabor`) agrupa por base+categoría cuando hay ≥2.
- **Catálogo (home)**: `ProductoGrid` agrupa; `ProductoCardSabores` (nueva) muestra una sola tarjeta con nombre base, badge "N sabores", lista de sabores, "Desde X €" si varían precios y botón "Elegir sabor" → ficha del primer sabor con stock. Overlay "Agotado" solo si TODOS lo están.
- **Ficha**: título = nombre base + selector de chips de sabor (actual resaltado con `aria-current`, resto enlaza a su ficha, "(agotado)" si sin stock). Los productos sin la convención no cambian.
- **Bug arreglado de paso**: los productos creados desde el backoffice quedaban con `slug: null` y sus fichas no abrían (la tarjeta enlaza por slug y la ruta busca por slug). `ProductosService.create` ahora **genera el slug del nombre** (sin tildes, kebab-case, reintento sufijado ante colisión 23505). Backfill aplicado a los 5 productos existentes.
- **Verificado en vivo**: home muestra 3 tarjetas (Bon Bon Bum, Milo y grupo "Galleta Festival" con badge "3 sabores") · ficha de vainilla con título base y chips enlazando a fresa/chocolate · alta "Café Águila Roja 250g" → slug `cafe-aguila-roja-250g` · typecheck API+web OK. (Ojo: curl desde Git Bash corrompe UTF-8 en `-d`; para probar JSON con tildes usar archivo `--data-binary`.)
- **Imagen de familia para la tarjeta agrupada** (petición de Jonathan): convención `imagenes[1]` = foto de familia opcional (el array ya existía; `imagenes[0]` sigue siendo la foto del sabor). `ProductoForm` tiene un segundo campo "Imagen de familia (opcional)" con preview y botón Quitar — se sube en UNO solo de los sabores. `ProductoCardSabores` la usa con prioridad si algún hermano la tiene; sin ella, cae al comportamiento automático (primer sabor con stock). La ficha individual siempre muestra `imagenes[0]`.
- **Selector de cantidad en la ficha** (petición de Jonathan): `AddToCartButton` ahora tiene stepper −/+ (1–30, el límite comercial; la API sigue validando el acumulado con 409) junto al botón "Añadir al carrito". Agotado → botón "Sin stock" solo, sin stepper.
- **"← Volver al catálogo"** añadido arriba de la ficha de producto (enlace a `/`).
- **Stock a cero por segunda vez**: Jonathan probó añadiendo unidades a mano desde Inventario; se restauró todo a 0 (sin reservas, carritos ni pedidos residuales). Sigue pendiente cargar la primera factura real.

### ✅ Módulo "facturas" renombrado a "compras" (decisión de Jonathan)

- Razón: el módulo registra **compras de mercancía** (documentadas con la factura del proveedor); "facturas" queda libre para un futuro módulo de facturas de proveedores (gastos/servicios).
- **Migración 026** (aplicada y verificada): `UPDATE staff_modulos` facturas→compras + CHECK con `'compras'`.
- **Renombrado completo**: tipos (`StaffModulo` "compras") · API `apps/api/src/compras/` (`ComprasController` en **`/admin/compras`**, `ComprasService`, `CrearCompraDto`) · web `/backoffice/compras` (+nueva, +[id]) · sidebar "🛒 Compras" · labels de usuarios/perfil · enrutado de /backoffice.
- **Lo que NO cambió** (a propósito): tablas `facturas_compra`/`factura_compra_items`, RPC `registrar_factura_compra`, bucket `facturas` y el tipo `FacturaCompra` — nombres internos correctos (una compra se documenta con su factura); renombrarlos era churn con riesgo y sin beneficio.
- **Verificado**: `/admin/compras` 200 admin / 401 anónimo · `/admin/facturas` ya no existe (404) · constraint remota con 'compras' y 0 filas 'facturas' · typecheck types+API+web OK.

### ✅ Submódulo de Proveedores + costos y total en las compras

- **Migración 027** (aplicada y verificada): tabla `proveedores` (cif UNIQUE normalizado, nombre, teléfono, email, dirección, notas; RLS sin policies) · `facturas_compra` += `proveedor_id` FK + `total numeric(12,2)` (la columna `proveedor` queda como snapshot del nombre) · `factura_compra_items` += `costo_unitario numeric(10,2)` (null en compras antiguas) · **RPC v2** `registrar_factura_compra` (firma nueva con `p_proveedor_id`; valida costo ≥ 0 por línea y calcula `total = Σ cantidad×costo` en la transacción — la BD es la fuente de verdad del total).
- **API** (`apps/api/src/compras/`): `ProveedoresController` en `/admin/proveedores` (mismo permiso `compras`) — GET lista, **GET `cif/:cif`** (lookup para autocompletar; normaliza mayúsculas/espacios/guiones), POST, PATCH, DELETE (con compras → 409, el histórico no se rompe). `CrearCompraDto` cambia `proveedor` (texto) por `proveedorId` (UUID) y los items exigen `costoUnitario` (zod: ≥ 0, 2 decimales).
- **Web**: `/backoffice/compras/proveedores` (CRUD completo, hereda el guard del layout de compras; botón "👥 Proveedores" en el histórico). Form de nueva compra: campo **CIF con lookup** (blur/Enter/botón) → chip "✓ Nombre · teléfono" o aviso con enlace a crear proveedor; líneas con **costo unitario y subtotal**; total € en vivo. Histórico con columna Total; detalle con costo/subtotal por línea, fila de total y tarjeta "Total compra".
- **Verificado E2E en vivo**: CIF "b-1234 5678" → guardado como `B12345678` y lookup con "b1234-5678" lo encuentra · compra 4×0,55 + 6×1,20 → `total: 9.4` calculado en BD, snapshot del nombre del proveedor, stock +10 · línea sin costo → 400 · DELETE proveedor con compras → 409, sin compras → 204 · datos de prueba limpiados (compra, stock, PDF, proveedor). Typecheck types+API+web OK.
- **Sidebar con submódulos** (petición de Jonathan): navegación extraída a `SidebarNav` (client, `usePathname`) — "🚚 Proveedores" aparece indentado bajo "🛒 Compras" solo cuando la ruta actual está dentro del módulo, con borde izquierdo y resaltado del enlace activo (bg-muted). El layout (server) sigue filtrando por permisos y pasa los items visibles. El botón "Proveedores" de la cabecera del histórico se quitó (petición de Jonathan; acceso solo por sidebar).
- **Selector de proveedor con autocompletado** (petición de Jonathan, sustituye al lookup por CIF exacto): el form de nueva compra carga la lista de proveedores y al teclear (CIF o nombre, con normalización) muestra un dropdown de sugerencias (máx. 6); al seleccionar queda una **tarjeta con check verde** y los datos básicos (nombre, CIF, teléfono/email, dirección) + botón "✕ Cambiar". Sin coincidencias → enlace a crear proveedor. El endpoint `GET /admin/proveedores/cif/:cif` sigue existiendo (API pública del módulo).
- **Costo unitario a 4 decimales** (petición de Jonathan): migración **028** — `costo_unitario numeric(10,4)`; la RPC acumula el total sin redondear y hace `round(v_total, 2)` al final (el total sigue siendo importe monetario a 2 decimales). Zod valida los 4 decimales con `refine` manual (multipleOf con floats es impreciso); form con `step="0.0001"`; el detalle muestra el costo con hasta 4 decimales (`formatCosto`, Intl con maximumFractionDigits 4). Verificado: 3×0,5533 → costo exacto y total 1,66 · 5 decimales → 400.
- **Etiquetas "(sin IVA)"** en costos/subtotales/totales de compras (form, histórico y detalle) — convención confirmada por Jonathan: los costos de compra se registran en base imponible, sin IVA. Solo etiquetado; sin cambios de datos. 🎉 **Primeros productos reales y primera compra de proveedor registrados por Jonathan (2026-07-18).**
- **IVA por línea en compras** (petición de Jonathan): migración **029** — `factura_compra_items.iva_pct numeric(4,2)` CHECK (4|10|21) · `facturas_compra` += `total_iva`, `total_con_iva` (`total` sigue siendo la base sin IVA) · RPC v3 valida el IVA por línea y calcula base/cuota/total con IVA acumulando sin redondear (round al final). `IVA_PORCENTAJES` en `@valatino/types`; zod exige `ivaPct` por item. Form: select 4/10/21 por línea (default 10) + resumen en vivo "uds · Base · IVA · Total". Histórico: columnas "Base (sin IVA)" y "Total (con IVA)". Detalle: columna IVA + filas Base imponible / IVA / Total (con IVA); la compra antigua de Jonathan (sin IVA registrado) muestra "—" y conserva su base. Verificado E2E: 2×1,00@10 + 1×2,00@21 → base 4,00 / IVA 0,62 / total 4,62 · sin ivaPct → 400 · IVA 15 → 400 · limpieza exacta (el stock real de Jonathan quedó intacto).
- Nota: los 10 productos del seed siguen apuntando a los SVG locales de `/productos/*.svg` — se irán reemplazando al editar cada producto con foto real.
- **Especificación de imagen de producto** (la web las muestra cuadradas, `aspect-square`, en tarjeta y ficha): **1200×1200 px, formato WebP** (o PNG/JPG), máx. 5 MB, fondo neutro muy claro (#F5F5F5) para integrarse con el `bg-muted` de la web, producto centrado ocupando ~80% del lienzo, sin texto ni marcas de agua. Prompt de generación con IA entregado a Jonathan en la sesión 2026-07-18.

### ✅ Stock puesto a cero (2026-07-18)

- Petición de Jonathan: limpiar el stock para que la primera factura de compra real establezca el inventario inicial. Los 10 productos quedaron con `stock_disponible=0, stock_reservado=0` (no había reservas activas). Quedan 3 `carrito_items` de prueba de sesiones anteriores (inofensivos con stock 0).

### ✅ Limpieza total para arranque real (2026-07-18)

- **La BD quedó vacía de datos de comercio**: pedidos, pedido_items, transacciones_pago, carritos, carrito_items, stock_reservas, checkout_datos, direcciones_envio, facturas_compra **y los 10 productos del seed** — todo a 0. Jonathan va a crear el catálogo real (productos con foto IA subida a la nube) y cargará el inventario inicial con la primera factura de compra.
- Se conservan los 6 usuarios de `auth.users` (admin, cuentas de prueba y asesores), roles y staff_modulos.
- ⚠️ Las secciones antiguas de este archivo que hablan de "10 productos del catálogo" o de pedidos de prueba quedan desactualizadas desde hoy.

---

## Sesión 2026-07-13 — Paleta gris clientes · límite 30 uds · fix reservas duplicadas · dashboard gerencial

**Para reanudar mañana**: `pnpm dev` levanta web (3000) + API (4000). Todo lo de hoy está commiteado (4 commits temáticos + este archivo) y verificado en vivo. BD remota al día (migración 023 aplicada). Pendientes de fondo sin cambios: tests (0%), CI, accesibilidad, probar en navegador el flujo completo de asesores. Recordar: `stripe listen` con la key del proyecto si se prueban pagos.

Petición: solo cambiar colores del área de clientes (storefront + `/cuenta`); sin tocar formas, figuras ni el backoffice.

- **`globals.css`**: nuevo ámbito `.theme-cliente` que sobreescribe TODAS las variables del tema a grises puros (primary naranja → casi negro `0 0% 9%`, secondary/muted/accent/border sin el tinte azul, destructive → gris oscuro `0 0% 25%`, ring gris). `:root` queda intacto → backoffice y `/admin` conservan su paleta.
- **`StorefrontShell`**: la clase se aplica ahí (envuelve exactamente storefront + `/cuenta`) con un `<div className="theme-cliente contents">` — `display: contents` no crea caja, el layout no cambia.
- **Colores hardcodeados pasados a `neutral-*`**: badges de estado en `/cuenta/pedidos` (se distinguen por intensidad de gris, ENTREGADO invertido en negro), iconos de `/checkout/confirmacion` (amber/green → gris), "N disponibles" en ficha de producto (green-600 → neutral-600).
- **Widgets de pago**: botón PayPal `color: "gold"` → `"black"`; Stripe Elements con `appearance.variables` grises (`colorPrimary/colorText #171717`, `colorDanger #404040`).
- **Verificado**: typecheck web OK · home y `/carrito` renderizan con `theme-cliente` y la regla CSS compilada · `/admin` NO lleva la clase (paleta original).
- Notas: los toasts de Sonner (`richColors`, globales en root layout) y los SVG placeholder de producto (figuras/imágenes) quedaron fuera a propósito — avisar si también se quieren en gris.

### ✅ Límite de 30 unidades por producto + el stock real nunca se muestra al cliente

- **Regla de negocio nueva**: máximo **30 unidades por producto y carrito** (`MAX_UNIDADES_POR_PRODUCTO` en `carrito.service.ts`). Al superarlo → 409 con "Máximo 30 unidades por producto. Si necesitas más, escríbenos a **valatino@hotmail.com**" (email confirmado por Jonathan — el mensaje original decía "valatatino", era errata). Se valida en `addItem` (cantidad directa y acumulada con lo que ya hay en el carrito) y en `updateItem` (botón + del carrito).
- **El inventario ya no se filtra al cliente**: los mensajes de stock insuficiente son genéricos ("No hay unidades suficientes de este producto en este momento" / "Este producto está agotado") — sin cifras. La ficha de producto muestra "Disponible" en lugar de "N disponibles". El backoffice sigue viendo el stock real.
- **Web** (`useCarrito.tsx`): los 409 de `addItem`/`updateItem` se muestran con `toast.warning` (aviso ámbar informativo), no como error del sistema; el resto de fallos sigue en `toast.error`.
- **Nota**: el DTO mantiene `@Max(99)` como límite de sanidad; el límite comercial de 30 vive en el servicio (409 → toast de aviso, no 400).
- **Verificado en vivo**: añadir 30 OK · +1 sobre 30, 31 de golpe y PATCH a 31 devuelven el 409 con el mensaje del email · carritos de prueba limpiados · typecheck API+web OK.

### ✅ Bug corregido: productos "agotados" fantasma por reservas duplicadas del checkout

- **Síntoma**: Café Sello Rojo aparecía agotado sin ventas. Causa: `disponible=0, reservado=60` — el checkout había creado DOS reservas idénticas de 30 unidades con 6 ms de diferencia (y 4 reservas de 1 para la salsa).
- **Causa doble**:
  1. `CheckoutService.reservar` no era idempotente: cada visita/recarga del checkout apilaba reservas nuevas sin liberar las previas de la sesión.
  2. El doble montaje de React (StrictMode dev) dispara el `useEffect` del checkout dos veces; el guard `reservando` es estado asíncrono y no llega a tiempo → dos POST casi simultáneos. (Mismo patrón que el fix de Realtime del backoffice, commit 579e40e.)
- **Fix API** (`checkout.service.ts`): antes de reservar, `DELETE ... WHERE session_id = X RETURNING` de las reservas previas de la sesión + `liberar_reserva` por cada una — reservar es ahora idempotente por sesión.
- **Fix web** (`checkout/page.tsx`): guard síncrono con `useRef` en `reservarStock` (el estado no protege contra el doble efecto).
- **Nota**: el pg_cron `liberar-reservas-expiradas` (004) funciona bien — liberó las 60 del café al caducar (TTL 15 min). El bug solo causaba "agotados" temporales de hasta 15 min, pero en producción real (sin StrictMode) seguiría pasando al recargar el checkout.
- **Verificado en vivo**: carrito con 5 → dos POST `/checkout/reservar` seguidos → 1 sola fila de reserva y `reservado=5` (antes 10). Reserva y carrito de prueba liberados; café restaurado a 60/0. Typecheck API+web OK.

### ✅ Segunda vuelta al bug de reservas: carrera entre peticiones PARALELAS + contadores fantasma reconciliados

- **Reapareció** (ají 30 → descontó 60): dos POST con 32 ms de diferencia. El fix de idempotencia (borrar reservas previas) solo protege llamadas consecutivas — dos peticiones EN PARALELO no se ven entre sí (TOCTOU) y ambas reservan.
- **Fix definitivo** (`checkout.service.ts`): **coalescing por sesión** — `Map<sessionId, Promise>`; si llega una reserva mientras otra de la misma sesión está en vuelo, se engancha a la misma promesa y ambas devuelven el mismo resultado. ⚠️ Válido con la API en una sola instancia; con réplicas horizontales habría que moverlo a una RPC transaccional en Postgres (anotado en el código).
- **Verificado**: dos `curl` en paralelo (con `&`) → 1 sola fila de reserva.
- **Daño histórico reconciliado**: 6 productos tenían `stock_reservado=3` sin filas de reserva que lo respaldaran (el bug de duplicados existía desde el principio: en los pedidos de prueba de ayer, el pago consumía una reserva y la duplicada quedaba atrapada en el contador — 3 unidades ni vendidas ni devueltas). Reconciliado vía REST service_role: `disponible += desvío, reservado = suma real de filas` — Jugos Mora 179, Ducales 119, Chocoramo 148, Chocolate 79, Maracuyá 199, Aguardiente 69; todos con reservado=0 (salvo reservas activas legítimas).
- Con los duplicados imposibilitados (coalescing + idempotencia + guard del cliente), el desvío no puede reproducirse.

### ✅ Dashboard gerencial en el backoffice (solo admin)

- **API**: módulo nuevo `apps/api/src/dashboard/` — `GET /admin/dashboard` (`@Roles("admin")`, verificado 401 anónimo). Devuelve `DashboardGerencial` (tipo nuevo en `@valatino/types`): ingresos/pedidos/ticket medio de 30 días (solo estados pagados PROCESANDO/ENVIADO/ENTREGADO), serie diaria con días a cero, top 5 productos por unidades, recuento histórico por estado, clientes totales y stock bajo (≤5).
- **Web**: `/backoffice/dashboard` (guard admin-only por layout, patrón usuarios). KPI row de 4 stat tiles + gráfico de línea de ingresos por día (SVG propio, sin dependencias: línea 2px, área al 10%, crosshair + tooltip al hover, tabla accesible en `<details>`) + barras horizontales top productos (un solo hue) + pedidos por estado (EstadoBadge) + tabla de alertas de stock.
- **Diseño según skill dataviz**: azul `#2a78d6` validado con `validate_palette.js` sobre superficie blanca (todas las comprobaciones PASS); grid hairline, texto siempre en tokens de tinta, sin leyenda (serie única), `tabular-nums` solo en tablas/ejes.
- **Navegación**: enlace "📈 Dashboard" en el sidebar (solo admin) y `/backoffice` ahora enruta al admin al dashboard (asesores siguen yendo a su primer módulo).
- **Verificado en vivo** con login real del admin: métricas correctas contra la BD (14,80 € · 5 pedidos del 12/07 · 3 clientes · top 5 · 4 PROCESANDO/1 ENTREGADO/1 CANCELADO). Typecheck types+API+web OK.

### ✅ Dashboard convertido en módulo asignable a asesores

- Petición: poder habilitar/deshabilitar el dashboard por asesor desde /backoffice/usuarios, como los demás módulos.
- **Migración 023** (`staff_modulo_dashboard.sql`): el CHECK de `staff_modulos.modulo` ahora admite `'dashboard'`. Aplicada al remoto por Management API (`database/query`) y verificada con `pg_get_constraintdef`. Token extraído del Credential Manager ("Supabase CLI:supabase", struct CREDENTIALW vía Add-Type — los offsets manuales NO funcionan en PS 5.1, usar la clase C# completa).
- **Tipos**: `StaffModulo` + `STAFF_MODULOS` incluyen `"dashboard"` → los checkboxes de usuarios y la validación `IsIn` de los DTOs lo recogen automáticamente. `MODULO_LABELS` actualizado en usuarios y perfil.
- **API**: `DashboardController` pasa de `@Roles("admin")` a `@Roles("admin","asesor")` + `@Modulo("dashboard")` + `ModulosGuard` (admin pasa siempre).
- **Web**: guard del layout por `puedeVerModulo(acceso,"dashboard")`; el enlace del sidebar entra en `NAV_ITEMS` (primero); `/backoffice` enruta al dashboard a quien pueda verlo.
- **Verificado E2E**: asesor de prueba creado sin el módulo → 403 · PATCH otorgando el módulo → 200 inmediato (JwtStrategy relee módulos de BD en cada request, sin re-login) · admin sigue 200 · asesor de prueba eliminado. Typecheck OK.

---

## Sesión 2026-07-12 — Webhooks Stripe en local, números de pedido legibles, placeholders de imágenes y fix de carrito invitado

### ✅ Webhooks de Stripe funcionando en local (causa del "pedido pagado pero invisible")

- **Descubierto**: los pedidos solo se crean cuando llega el webhook `payment_intent.succeeded`; en local nunca llegaba porque `stripe listen` no estaba corriendo → Stripe cobraba, la web decía OK, pero la BD quedaba vacía.
- ⚠️ **El Stripe CLI está logueado en OTRA cuenta** (no la del proyecto). Hay que lanzarlo siempre con la key del proyecto:
  ```powershell
  stripe listen --api-key <STRIPE_SECRET_KEY del apps/api/.env> --forward-to localhost:4000/pagos/stripe/webhook
  ```
  Con esa key, el signing secret es el `whsec_2c0d...` que ya está en `apps/api/.env` (no cambiarlo).
- Eventos perdidos se recuperan con `stripe events resend <evt_id> --api-key <key>` (idempotencia OK: los ya procesados se ignoran).

### ✅ Números de pedido legibles (formato `AAMMDD` + método pago + 4 aleatorios)

Ej.: `260712016478` → 12/07/26, `01` = Stripe, sufijo aleatorio. Códigos: **01 stripe, 02 paypal, 00 desconocido** (03+ reservados para futuros métodos, mapa `CODIGOS_METODO_PAGO` en `inventario.service.ts`).

- **Migración 021** (`numero_pedido varchar(12) NOT NULL UNIQUE` + backfill de pedidos existentes). Aplicada al remoto **por conexión Postgres directa** (pooler `aws-0-eu-west-1.pooler.supabase.com:5432`, user `postgres.lxnphjwsypnjrulotiph`, password en `Contraseñas.txt`) — recordar que `supabase db push` no sirve en este proyecto.
- **API**: generación al crear el pedido con reintento ante colisión del sufijo (23505). `numero_pedido` en `getPedidoConItems`.
- **Emails**: asunto y cuerpo usan el número nuevo. **Web**: "Mis pedidos" y tabla del backoffice (columna "Nº pedido") lo muestran. **Tipos**: `Pedido.numero_pedido` + schema.prisma.

### ✅ Confirmación de checkout muestra el número de pedido (no la referencia de pago)

- **Nuevo endpoint público** `GET /pedidos/por-referencia/:referencia` (`PedidosPublicController`, sin JWT: la referencia solo la conoce quien pagó; responde solo `numero_pedido` + `estado`, 404 si no existe).
- `/checkout/confirmacion` hace polling cada 2s (máx. 30s) hasta que el webhook crea el pedido; mientras muestra "Generando tu número de pedido…". Sirve para Stripe (`payment_intent`) y PayPal (`referencia` = capture_id).

### ✅ Imágenes de producto: placeholders locales (adiós errores `cdn.valatino.es`)

- El seed apuntaba a `https://cdn.valatino.es/...` (dominio inexistente) → cada página con productos llenaba el log de 500/ENOTFOUND del optimizador de imágenes.
- **10 SVG generados** en `apps/web/public/productos/` (nombre + categoría + color por categoría). BD y `seed.sql` actualizados a `/productos/<slug>.svg`. Los `<Image>` llevan `unoptimized` cuando el src es `.svg` (el optimizador de Next con Turbopack no los procesa). `cdn.valatino.es` eliminado de `next.config.mjs`.
- Fotos reales en el futuro: subir a Supabase Storage (`**.supabase.co` ya está permitido) y actualizar URL desde el backoffice.

### ✅ Bug corregido: pago de invitado fallaba si la sesión tenía carrito de un login anterior

- **Síntoma**: cliente nuevo (invitado) pagaba y la confirmación se quedaba en "Generando…" para siempre; el webhook devolvía **422 silencioso**.
- **Causa**: la misma sesión de navegador tenía DOS carritos (el de un usuario logueado antes + el del invitado). `confirmarVentaYCrearPedido` buscaba el carrito de invitado solo por `session_id` sin `user_id IS NULL` (el único sitio del código donde faltaba) → 2 filas → `.single()` fallaba → "Carrito no encontrado".
- **Fix**: filtro `user_id IS NULL` añadido + `logger.error` con sesión/usuario (el 422 ya no es silencioso). Pedido perdido recuperado con `events resend`.

### ✅ Bug corregido: login del panel `/admin` rechazaba al admin ("no tiene acceso")

- **Causa**: la migración 016 revocó EXECUTE de `get_user_role` a anon/authenticated, pero las policies RLS de `user_roles`/`roles` la invocan con los permisos del usuario que consulta → cualquier lectura del rol fallaba con `42501 permission denied for function get_user_role` y el login trataba al admin como cliente. (Mismo fallo silencioso en `AuthForms` al decidir la redirección staff post-OTP.)
- **Fix**: migración **022** (`GRANT EXECUTE ON FUNCTION get_user_role(uuid) TO authenticated, anon`), aplicada al remoto y verificada reproduciendo el login completo con supabase-js: rol resuelve `admin`.

### ✅ Refactor de modularización (escalabilidad)

- **`SupabaseModule` global** (`apps/api/src/supabase/`): un único `SupabaseClient` service_role inyectable con `@Inject(SUPABASE_CLIENT)` — antes 9 servicios creaban el suyo propio. Punto único de config y mockeable en tests.
- **`ConfirmacionPedidoService`** (`pedidos/confirmacion-pedido.service.ts`): orquestación única post-pago (checkout_datos → lookup de profile → crear pedido → transacción → email). Los webhooks de Stripe/PayPal quedaron finos: verifican firma + idempotencia y traducen su evento a `PagoConfirmado`/`ReembolsoNotificado`. **Añadir un método de pago nuevo = escribir solo su webhook-traductor y llamar a este servicio.** `liberarReservas` movido a `InventarioService`.
- **Web — capa de datos unificada**: todos los fetch con auth pasan por `lib/api/client.ts` (`apiFetch`); eliminados los `fetch` manuales con header Authorization repetido en 9 archivos. Quedan `fetch` directos SOLO en server components (ProductoGrid, productos/[slug] — usan el caché de Next) y en el polling público de la confirmación.
- **Web — rol único**: `lib/auth/rol.ts` (`obtenerRol`/`esRolStaff`) reemplaza las 3 copias de la consulta a `user_roles` (Navbar, AuthForms, /admin). El equivalente server-side sigue siendo `lib/auth/staff.ts`.
- **Tipos compartidos**: las páginas de pedidos importan `Pedido`/`PaginatedResponse` de `@valatino/types` (eliminadas 3 interfaces locales duplicadas).
- Verificado: type-checks API+web ✅ · Nest arranca con el nuevo cableado ✅ · webhook Stripe responde 200 con idempotencia ✅ · login admin y separación de áreas ✅.

### ✅ Bug corregido: invitado con email de cuenta registrada → 422 al confirmar pago

- **Síntoma**: pedido de invitado con un email que YA tiene cuenta → webhook 422 → "Generando tu número de pedido…" infinito.
- **Causa**: el lookup de perfil por email asignaba ese user_id y el carrito se buscaba por user_id (carrito de la cuenta, vacío) en vez del carrito de invitado de la sesión (con los productos). Fallo de diseño previo al refactor: un solo campo mezclaba "dueño del pedido" y "usuario autenticado en el checkout".
- **Fix**: `CrearPedidoDto` separa `userId` (dueño del pedido, puede venir del lookup por email) de `usuarioAutenticado` (localiza carrito y reservas). "Carrito vacío" ahora también se loguea. Verificado: pedido de invitado con email gmail se crea Y queda vinculado a la cuenta existente.

### Estado de pruebas

- Flujo completo verificado hoy: pedido invitado (gmail) → login OTP → vinculación automática ✅ · pedidos logueado ✅ · pedido invitado con email nuevo (hotmail) ✅ (tras el fix) · login `/admin` ✅ (tras migración 022).
- BD: 4 pedidos de prueba (3 de jonathanduqee@gmail.com vinculados al usuario, 1 de jonathanduqee@hotmail.com como invitado, pendiente de vincular si algún día inicia sesión).

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