# Estado del proyecto Valatino — Sesión de trabajo

**Última actualización**: 2026-08-02

---

## ▶️ Para reanudar (leer primero)

**El proyecto está DESPLEGADO y funcionando en local y en línea** (con claves de test).

### 🔜 Al volver, empezar por aquí

✅ **Los cuatro bugs del 2026-07-28 están probados por Jonathan y funcionan.** (Teléfono del cliente al panel, la ventana de calificación que se cierra al enviar, el mensaje honesto del reembolso y la coma en el importe.) Ya no hay nada pendiente de comprobar de esa sesión.

🔨 **PENDIENTE DE DESPLEGAR (lo último del 2026-08-02): Bizum y el pago por transferencia.** Migración **045 aplicada al remoto** y probada, código listo y en verde, pero **sin desplegar y con dos acciones tuyas por delante**:

1. ~~Activar Bizum en Stripe~~ → **hecho el 2026-08-02 por API** y verificado en un PaymentIntent real. También se añadió `refund.updated` al webhook (ver la sesión).
2. ~~Poner las variables de la cuenta bancaria en Render~~ → **ya no hace falta**: la cuenta de cobro se edita en **TI → Ajustes** (migración 046). Está sembrada con la cuenta de prueba y **la transferencia YA se ofrece** en el checkout (`disponible: true`). Falta poner el IBAN definitivo, que es cambiarlo en esa pantalla — sin Render, sin despliegue.
   - ⚠️ **El IBAN de prueba que se dio (`ES48 9490…`) NO era válido**: su dígito de control es **33**, no 48. Sembrado ya como `ES33 9490 0934 2392 2994 3748`. Ahora el panel valida el dígito de control al guardar, así que el definitivo no se podrá colar mal tecleado.

Luego, probar: comprar por transferencia → ver el IBAN y el concepto → «Pago recibido» en el panel → comprobar que el stock se descuenta y el pedido pasa a Procesando. Ver la sesión de abajo.

✅ **Lo del reembolso por artículos (2026-08-02) está DESPLEGADO y probado por Jonathan de punta a punta**, en el panel y en la cuenta del cliente: pedido `260802016702` con dos devoluciones (0,50 € Bon Bon Bum y 10,00 € Milo 400G), stock repuesto una sola vez y sin que el webhook duplicara nada.

El reembolso por artículos se desplegó en **dos pushes**, como manda la tabla de más abajo (la API pasó a aceptar campos nuevos, así que fue primero): `3e0c135` API + tipos + migración y `b77da43` web. Migración **044 aplicada al remoto**. El redespliegue de Render se confirmó por el corte de `/health` (tres fallos de conexión y vuelta a 200); web y API sanas después.

⚠️ **Lo que NO se ha podido verificar por HTTP, y es casi todo**: las tres pantallas que cambian están detrás de login (`/cuenta/pedidos` responde **307**, que es lo correcto), así que del código de la web **solo se sabe que va en el mismo build atómico** que la home, que sirve 200. Es el mismo límite de la sesión del 28. **Hay que probarlo en pantalla**, en este orden:

1. **Panel, con el pedido `260728019405`** (6,30 €, tres artículos distintos — el que más se presta): devolver **un solo artículo**, comprobar el stock de ese producto en Inventario, y volver a abrir el reembolso para ver que esa línea ya sale como devuelta y no se puede volver a elegir.
2. **La casilla desmarcada** («la mercancía no vuelve»): el stock **no** debe moverse, ni entonces ni al completar después el reembolso del pedido. Es la regla más fácil de romper si alguien toca esto.
3. **Del lado del cliente**: entrar con la cuenta del comprador → `/cuenta/pedidos` → ese pedido debe mostrar qué artículo se devolvió, cuándo y cuánto, **aunque el pedido siga en ENVIADO** (una devolución parcial no cambia el estado: ese es justo el hueco que esto tapa). Y en `/cuenta/perfil`, el «Total gastado» debe salir ya con lo devuelto descontado.
4. **Que el dinero llegue de verdad**: contrastar en Stripe que el reembolso figura por el importe de los artículos elegidos.

⚠️ La migración 044 **ya está en el remoto** y es compatible con la API actual: con la tabla vacía, `reembolsar_pedido_total` se comporta exactamente igual que antes (verificado). No hay prisa por desplegar; lo que no se puede es desplegar la web sin la API.

Lo del **2026-07-27** sí está todo probado por él en producción. **Tres pedidos reales calificados** (`260728018953` Fácil · 5 · «nada todo muy bien», `260728011017` Regular · 4, y el de 6,30 €).

⚠️ **Del login, que dio problemas al cerrar la sesión** (arreglado y confirmado por Jonathan): hay **dos caminos** de entrada. El **código de 6 dígitos es el principal** y el **enlace del correo es el secundario**. El del enlace **nunca había funcionado** —`/auth/callback` era de servidor y no puede completar PKCE ni leer el fragmento de la URL— y solo se destapó cuando un 502 de Supabase hizo que llegara su correo por defecto, que trae enlace en vez de código. Ver sesión 2026-07-27 (cont. 6), y sobre todo el aviso de **NO lanzar `supabase config push`** que hay ahí.

**Dos cosas que conviene mirar al empezar** (cinco minutos, y dan contexto):
- **Dashboard → Experiencia de compra**, ya con datos de verdad: 2 opiniones, media 4,5, tasa 100 %. Sirve para ver la pantalla con contenido en vez de vacía, y para comprobar que el filtro «solo las malas» no devuelve nada (correcto: no hay ninguna).
- **Pinchar cualquiera de los 2 pedidos** en Pedidos: la ficha muestra artículos, historial de quién lo tocó y la opinión del cliente juntas. Es el sitio donde converge casi todo lo hecho estos dos días.

⚠️ **Ojo con el catálogo**: dos productos están a 0 unidades (Galleta Festival sabor Fresa y Vainilla). Es lo que dice la factura, no un error — saldrán como agotados.

**La cola, por orden de lo que más duele:**

1. **Calificación de la compra — fases 2 y 3** (la fase 1 está hecha y en producción, ver sesión de abajo). Aplazadas por decisión de Jonathan, no olvidadas:
   - **Fase 2 — enlace en el correo del pedido.** Segunda oportunidad para quien cerró la pestaña sin calificar. **No hace falta nada nuevo por debajo**: el token ya existe (`pedidos.token_calificacion`) y la ruta pública ya lo acepta; es solo añadir el enlace a la plantilla de `email/templates` y una página que reciba el token. Mucha menos respuesta que preguntar en la confirmación, pero alcanza a todos.
   - **Fase 3 — preguntar también al entregar.** Requiere una tabla o una columna aparte: **es una métrica distinta y no se puede promediar con la de la compra.** Lo de hoy se pregunta a los cinco segundos de pagar, así que mide el checkout y no dice nada del envío.
2. **Tests de la web — sigue a 0.** Es el hueco más grande que queda: la API va por 277 y la web no tiene ni uno. Hoy la única red ahí es `pnpm turbo type-check`. Los sitios que más lo piden: el formulario de dirección (CP → provincia → municipio, y el vaciado de la localidad al cambiar de provincia), `direccionCompleta()`, el widget de calificación (el descarte recordado y el guardado al segundo toque) y el selector de permisos.
3. **CI.** Nada corre automáticamente: los tests y el `type-check` se lanzan a mano. Un push que rompa la API no se entera nadie hasta que Render falla.
4. **Paso a producción real** — ver los pendientes manuales de abajo (región EU, Stripe `live`, dominio propio).
5. **Accesibilidad**, sin auditar todavía.
6. **Correo de acceso: quitarse la dependencia de Supabase** (opcional, pero es el flujo más crítico). Su endpoint de plantillas dio un 502 y dejó el login enviando correos en inglés con enlace. Mitigado ya, pero la causa sigue ahí. Antes de nada, lo barato: **re-guardar la plantilla en el Dashboard**. Si vuelve a pasar, mandarlo nosotros con SendGrid vía **Send Email Hook** — `EmailModule` ya tiene las plantillas en español.
7. **Cabo suelto pequeño**: la tolerancia al formato anterior de permisos (`permisos ?? []` en `UsuariosPanel.tsx` y `CargosPanel.tsx`) se puso para la ventana de despliegue de la 038 y decía «quitar en la siguiente release». Ya van tres releases: se puede quitar. Es cosmético, pero es código que finge cubrir un caso que ya no existe.

**Antes de tocar la tienda, leer esto** (la lección de la sesión del 27, que costó dos despliegues aprender): Vercel y Render despliegan **del mismo push** y no se pueden ordenar, y Vercel es siempre más rápido. Así que el orden seguro depende de **qué lado se vuelve más estricto**:

| El cambio hace que… | Orden seguro | Cómo se hace |
|---|---|---|
| la **API acepte algo nuevo** (un campo más) | API primero | **Dos pushes**: primero API, verificar por HTTP, luego web |
| la **API sea más estricta** (valida algo que antes colaba) | web primero | **Un push** basta: Vercel llega antes y la web nueva ya manda datos limpios |

Saltarse esto con un campo obligatorio nuevo devuelve **400 al pagar** durante los minutos de ventana, y eso no se reintenta: es una venta perdida.

- **En línea**: tienda **https://valatino-api-steel.vercel.app** (Vercel) · API **https://valatino.onrender.com** (Render) · Supabase (BD/Auth/Storage). Auto-deploy en cada push a `main`. Render free duerme tras ~15 min (1ª carga lenta al despertar, normal).
- **Local**: `cd C:\YJIMENEZ\Valatino && pnpm dev` levanta web (3000) + API (4000). El `.env` local apunta la web a `localhost:4000`.
  - ⚠️ Si `localhost:3000` da 500 tras muchos cambios → caché de dev corrupto: parar `pnpm dev`, borrar `apps/web/.next`, relevantar. Inofensivo.
- **Checkout end-to-end operativo en producción** (arreglado 2026-07-22): carrito (cross-domain), webhook de Stripe creado, email de pedido saliendo (SMTP por puerto **2525**). Ver sesión 2026-07-22.
- **Aplicar migraciones al remoto**: por Management API (ahora directo con la tool MCP `apply_migration`), NO `supabase db push`. Última aplicada: **044** (reembolso por artículos: tabla `reembolso_lineas`, RPC `registrar_reembolso_lineas` y `reembolsar_pedido_total` reescrita para no reponer dos veces). Antes, la **043** (el teléfono que el cliente actualiza llega al panel; trae `direcciones_envio.updated_at` y `set_updated_at_preciso()` con `clock_timestamp()`). Antes, la **042** (calificación de la experiencia de compra). Antes, la **041** (direcciones validadas), la **040** (teléfono de contacto) y la **039** con su corrección `039_fix_orden_y_fuga_de_actor`. Las 033–035 se aplicaron con la BD en «arranque real» (0 pedidos, 0 reservas), así que no tocaron ningún dato. Verificadas contra el remoto: `confirmar_venta` es idempotente (un reintento del webhook devuelve el mismo pedido) y `reservar_carrito` no apila al recargar el checkout (7/3 dos veces) y ante falta de stock deja el inventario intacto.
- **Tokens de despliegue**: la gestión de Render y Vercel se hace por sus APIs REST. ⚠️ **El 2026-07-25 Jonathan revocó TODOS los tokens** (Render, los dos de Vercel y una clave de la API de Anthropic que se pegó por error). Para volver a operar por API hay que emitir nuevos. **El despliegue NO los necesita**: Render y Vercel auto-despliegan con el push a `main`, y el resultado se verifica por HTTP.
- **Cuenta de Vercel**: el proyecto **`valatino-api-steel`** (dominio `https://valatino-api-steel.vercel.app`) **NO está en la cuenta `yonathanji` / `yonathan.jimenez00@usc.edu.co`** — ahí hay 0 proyectos, 0 teams y 0 dominios, y el id `prj_VwIo6RyE0YRKsz35VdOfNK6Knaf6` da 404. Vive en otra cuenta; para emitir un token útil hay que mirar el `<scope>` en `vercel.com/<scope>/<proyecto>` y crearlo desde ahí.
- **Constitución = guía vinculante del proyecto**: `specs/constitution.md` (v1.1.0) define los principios (TypeScript fullstack, monorepo Turborepo, seguridad en capas con RLS, UX premium, despliegue Vercel+Render). Verificar conformidad antes de cambios. Spec-Kit se retiró del repo el 2026-07-23 (raíz limpia).
- **Panel admin modernizado (2026-07-23)**: sidebar oscuro + canvas claro premium (scope `.theme-admin`), **iconos Lucide** en todo el panel (mapa compartido `lib/backoffice/iconos.tsx`; adiós emoji), **cabeceras `PageHeader`** con icono de marca en las 10 páginas, y responsive en móvil (drawer con hamburguesa). El súper admin ya edita usuarios del staff (nombre/correo, contraseña, rol admin↔asesor, módulos). Ver sesión 2026-07-23.
- **Flujo por capas RRHH → TI (2026-07-24)**: ⚠️ **cambio respecto a lo anterior** — ahora **Gestión Humana crea al empleado SIN cuenta** (persona + cargo; `empleados.user_id` es opcional) y después **TI** le **provisiona la cuenta** (correo + contraseña + módulos) y la vincula. "Usuarios" ya **no** es admin-only suelto: vive dentro del **módulo `ti`** (sidebar TI → Usuarios, ruta `/backoffice/ti/usuarios`). El **súper admin** (`admin`) conserva acceso a todo el core. **Cambiar rol (dar/quitar admin) sigue reservado a admin** (no un asesor de TI). Ver sesión 2026-07-24.
- **Módulo Gestión Humana**: `gestion_humana` (empleados + cargos + histórico mensual mes a mes con botón «Generar histórico»). Código de empleado estable `EMP-0001` (independiente del cargo).
- **Avisos de estado y reembolsos (2026-07-25)**: cada cambio de estado en el panel **envía correo al cliente** (en preparación / en camino / entregado / cancelado), y el reembolso es una acción propia (`POST /admin/pedidos/:id/reembolso`, solo admin) que **cobra en Stripe** de verdad, total o parcial. ⚠️ **REEMBOLSADO ya no es una transición del desplegable**: antes elegirlo marcaba el pedido sin mover un euro. Ver sesión 2026-07-25 (cont. 3).
  - **⭐ Y desde el 2026-08-02 se devuelven ARTÍCULOS, no solo un importe** (migración 044): el modal muestra las líneas del pedido y se elige cuáles y cuántas unidades, con casilla para que esas unidades vuelvan al inventario. Lo devuelto queda registrado en `reembolso_lineas`, así que la siguiente devolución sabe qué queda y la ficha marca cada artículo. Ver sesión 2026-08-02.
  - ⚠️ **Si tocas el stock del reembolso, la trampa es la doble reposición**: `reembolsar_pedido_total` repone el pedido entero y hay que descontarle lo que ya figure en `reembolso_lineas` —repuesto o no, porque «no repuesto» es una decisión tomada, no un pendiente—. Por eso registrar las líneas y cerrar el pedido van en **una sola llamada** y en ese orden.
  - ⚠️ **El importe de los artículos lo calcula el servidor**, desde `pedido_items`. El panel manda qué línea y cuántas unidades, nunca euros. Y la clave de idempotencia de Stripe lleva una **huella de las líneas**: dos líneas distintas pueden costar lo mismo, y sin ella la segunda devolución reutilizaría el refund de la primera sin cobrar nada.
- **⚠️ NIVELES DE PERMISO (2026-07-26) — cambia cómo se otorga todo**: tener un módulo ya **no** significa poder hacer todo lo que contiene. Cada módulo se otorga con un nivel: **`lectura` < `edicion` < `total`** (acumulativos). Y cada **cargo** lleva una **plantilla** de permisos que se copia al provisionar la cuenta, así que dar de alta a quince asesores es una sola configuración. **`POST /admin/usuarios` (alta suelta) se eliminó**: el único camino es RRHH crea el empleado → TI le da acceso. Reembolsar, borrar cliente y borrar empleado **dejaron de ser `@Roles("admin")`** y ahora exigen `total`. El panel muestra el **cargo** real en vez de «Asesor». Ver sesión 2026-07-26.
- **Ficha del pedido e historial (2026-07-26)**: en el panel, **pinchar un pedido** abre su ficha con los artículos, el cliente, la dirección y una **línea de tiempo** de todo lo que le ha pasado —alta, cambios de estado, pagos, reembolsos y correos— **con el nombre de quién lo hizo**. Lo ve todo el equipo, incluso con solo lectura en Pedidos; el cliente **no**. El registro va por **trigger**, así que ningún cambio de estado se escapa. Ver sesión 2026-07-26 (cont.).
- **Módulo Clientes (2026-07-25)**: `clientes` — listado con métricas, ficha con pedidos y direcciones, edición de contacto y borrado de cuenta. **Ojo al dato de negocio**: `profiles` está casi vacío porque el registro es por OTP y solo captura el email; el nombre, el documento y (desde el 27) el **teléfono** reales del cliente viven en el **pedido** (`envio_nombre`, `documento_cliente`, `envio_telefono`) y la RPC `listar_clientes` los deriva de ahí. Ver sesión 2026-07-25 (cont. 2).
- **⭐ CALIFICACIÓN DE LA COMPRA (2026-07-27, fase 1)**: al confirmarse el pago se abre una **ventana emergente** con **dos preguntas** —cuánto esfuerzo le costó comprar (`esfuerzo` 1 fácil…3 difícil) y qué nota le pone (`satisfaccion` 1–5)— más un comentario opcional. **No es obligatorio**: se cierra con la ✕, con Escape, pulsando fuera o con «Cerrar», y no se le vuelve a preguntar a quien la cerró ni a quien ya opinó. Se ve en **Dashboard → Experiencia de compra** y en la ficha de cada pedido. Vive en el módulo `dashboard` (no es un módulo nuevo) y los comentarios se ven con `dashboard:lectura`. Ver sesiones 2026-07-27 (cont. 4) y (cont. 5).
  - ⚠️ **Si tocas este widget, la regla es: cada acción se confirma DONDE se pulsó.** Nació como tarjeta al final de la página con el aviso solo en el título, y pareció roto estando bien (ver cont. 5). El estado va pegado al botón y en un `aria-live`.
  - ⚠️ **La media nunca se lee sola: al lado va la tasa de respuesta.** Un 4,8 sobre el 8 % de los pedidos no dice lo mismo que sobre el 70 %. Y con pocos pedidos las medias bailan mucho: mirar el número de respuestas antes de concluir nada.
  - ⚠️ **Esto mide el proceso de compra, no el envío** (se pregunta a los cinco segundos de pagar), y **no puede recoger la opinión de quien se fue sin comprar**: el que abandonó nunca llega a la página de confirmación. Para eso hace falta análisis de embudo, no una encuesta.
- **Nada de botones que no se pueden pulsar (2026-07-27)**: la regla del panel es **lo que no se puede hacer, no se pinta**. Antes se deshabilitaba (botón gris que no responde) o no se comprobaba nada. Si añades una acción nueva, gátela con `usePuede(modulo, nivel)` y **ocúltala**; en un formulario que existe para editarse, bloquea los campos con un `<fieldset disabled>` y esconde el botón de guardar. Ver sesión 2026-07-27.
- **⚠️ TELÉFONO DE CONTACTO (2026-07-27) — obligatorio para pagar**: la dirección de envío pide teléfono y sin él no se puede completar el pago. Se guarda **normalizado a 9 dígitos** (se acepta `+34` y espacios al teclear, se guarda `600112233`); la regla vive una sola vez en `@valatino/types` (`normalizarTelefono`, `telefonoValido`, `formatearTelefono`) y la API la consume con el decorador `@EsTelefono`. Las direcciones guardadas **antes** de la 040 no lo tienen: el checkout avisa en ámbar y lo pide ahí mismo, guardándolo en la dirección. Ver sesión 2026-07-27.
  - ⚠️ **Y desde la 043, quién gana cuando hay dos**: el teléfono que ve el panel es **el que se tocó más tarde**, sea el que el cliente guarda en su dirección o el que el equipo escribe en la ficha; el snapshot del pedido queda de último recurso. Si tocas `listar_clientes`, mantén esa regla: cualquier prioridad fija deja a uno de los dos lados editando sin que se entere nadie. La recencia se compara con `updated_at`, que en `profiles` y `direcciones_envio` lo pone `set_updated_at_preciso()` —con **`clock_timestamp()`, no `now()`**, o dos escrituras de la misma transacción empatan. Ver sesión 2026-07-28.
  - ⚠️ **Para importes en euros NO uses `<input type="number">`**: ante una coma el navegador devuelve `value = ""`, así que el campo se vacía solo y parece que no responde. `type="text"` + `inputMode="decimal"` y se filtra al escribir (ver `sanearImporte` en `ReembolsoModal.tsx`).
- **⚠️ DIRECCIONES (2026-07-27) — el código postal manda**: la **provincia ya no se escribe**, se deduce de los dos primeros dígitos del CP (que *son* el código de provincia del INE) y **se recalcula en el servidor**: lo que llegue en el DTO se descarta. La **localidad** es un desplegable de los municipios de esa provincia, del diccionario oficial del INE. El municipio se valida contra la provincia **del CP**, no contra toda España. La comparación es tolerante (`alcala de henares` vale) y se guarda el nombre oficial (`Alcalá de Henares`). Ver sesión 2026-07-27.
  - El dataset **se genera, no se pega**: `node scripts/generar-municipios.mjs` lo baja del INE y escribe las dos salidas (`apps/api/src/common/datos/municipios.generado.ts` y los 52 `apps/web/public/municipios/<cpro>.json`). Falla si los códigos no cuadran con `PROVINCIAS_ES`. Regenerar cuando el INE publique edición nueva.

### ⚠️ Pendientes de Jonathan (acción manual)
1. **`NODE_ENV` está en `development` en Render**, aunque `render.yaml` dice `production`. Verificado que **ningún código depende de esa variable** (solo un comentario en `session.middleware.ts` explicando que a propósito no se depende de ella), así que cambiarlo es seguro: Render → servicio Valatino → Environment → Save (dispara redeploy). No se hizo por API porque los tokens ya estaban revocados.
2. ~~Regenerar los tokens expuestos~~ → **hecho el 2026-07-25**: todos revocados.
3. **Paso a producción real** (ver "Plan de producción" en la sesión 2026-07-22): API en región **EU (Frankfurt) + plan de pago** (quita el "dormir" y el cruce transatlántico Render-Oregon ↔ Supabase-Irlanda), dominio propio, claves **Stripe `live`** + recrear el webhook con el nuevo signing secret, actualizar CORS_ORIGIN / Supabase URLs al dominio propio.

### Estado del negocio
- Catálogo real creado por Jonathan (productos con foto en la nube). Stock inicial cargado con la 1ª **compra de mercancía** (factura 202521188, IVA 10% salvo Pony Malta 21%, total c/IVA 93,64 €).
- **BD limpiada a «arranque real» el 2026-07-27** (ver «Limpieza de la BD» más abajo) y con **las primeras ventas de verdad encima**, comprobado al cerrar: **2 pedidos** (`260728018953` 1,50 € PROCESANDO y `260728011017` 0,50 € ENVIADO), **2 calificaciones** (media 4,5 sobre 5 con 100 % de tasa de respuesta), **8 eventos**, **1 dirección**, **3 carritos** y **2 usuarios** (el súper admin y el cliente). Se conservan a propósito: son la prueba de que el circuito completo funciona.
  - Lo demás: **13 productos** (stock **162** de las 164 unidades de la factura: dos vendidas), la **primera factura** 202521188 con sus **11 líneas** (93,64 € c/IVA, con su autor intacto), **1 proveedor**, **6 cargos** con sus **27 filas de plantilla**. A cero: **empleados** y **`staff_modulos`**.
  - Si hace falta volver a vaciarla, el procedimiento está documentado más abajo — y ahora hay que contar también con `pedido_calificaciones`, que cae en cascada con el pedido.
- **Dos cuentas**: el súper admin `jonathanduqee+admin@gmail.com` (perfil «Admin Valatino») y el cliente de la primera compra. Gestión Humana y TI arrancan vacíos; para volver a probar el flujo de asesor hay que rehacerlo (RRHH crea empleado → TI le provisiona cuenta).
  - ⚠️ Las cuentas de prueba **EMP-0018 Jhoanna Mendoza** (DIRCOM) y **EMP-0019 Valentino Jiménez** (ASECOM) **ya no existen**. Sirvieron para validar de punta a punta el flujo RRHH → TI y los niveles de permiso; si este archivo las menciona en las sesiones de abajo, es historia, no estado.
- **Los 6 cargos ya tienen plantilla de permisos** (sembrada en la 038, editable desde TI → Cargos sin tocar código): GER todo `total` salvo `ti: lectura` · DIRCOM pedidos y clientes `total` · DIROP inventario y compras `total` · DIRADM dashboard y compras `total`, pedidos y clientes `lectura` · COORTH `gestion_humana: total` · ASECOM pedidos `edicion`, clientes y catálogo `lectura`. Son **datos**, no doctrina: ajústalos el primer día. (Jhoanna tiene los suyos retocados a mano respecto a la plantilla, que es justo para lo que está.)
- Pendientes de fondo: ~~tests (0%)~~ → **277 tests en la API** (`pnpm --filter @valatino/api test`); **la web sigue sin tests** y eso es hoy el hueco más grande. CI, accesibilidad. ~~Validar los campos de dirección~~ → **hecho el 2026-07-27** (migración 041 + diccionario del INE). El histórico de direcciones para analítica vive en `pedidos.envio_*` (snapshot por pedido), no en `direcciones_envio`, y desde la 040 incluye `envio_telefono`.

---

## Sesión 2026-08-02 (cont.) — Dos formas más de pagar: Bizum y transferencia

Jonathan: *«en la parte del pago, tener dos nuevas opciones transferencia por IBAN o transferencia por Bizum, para que el cliente tenga más opciones de pagar»*. Son dos cosas de tamaño **muy** distinto.

### Bizum salió casi gratis, y conviene saber por qué

La API ya creaba el PaymentIntent con `automatic_payment_methods: { enabled: true }` y el front monta un `PaymentElement` sin restringir métodos. Eso significa que **qué formas de pago aparecen lo decide el Dashboard de Stripe, no el código**: activar Bizum ahí lo hace aparecer solo, con su redirección ya cubierta por el `return_url` y el `redirect_status` que la página de confirmación valida desde 2026-07-09.

Lo único que hubo que tocar fueron los textos, que prometían «tarjeta» («Continuar con tarjeta») y habrían dejado fuera de la frase a todo lo demás. Ahora el botón dice «Tarjeta o Bizum» y el interior no nombra ningún método.

✅ **Bizum ya está ACTIVADO** (2026-08-02, por API de Stripe a petición de Jonathan). Se hizo con `POST /v1/payment_method_configurations/pmc_1TmwxzL1kwgv5hCuZKpYAjLh` → `bizum[display_preference][preference]=on`. Antes figuraba con `available: false`; activarlo lo puso en `available: true`. **Verificado creando un PaymentIntent igual que los del checkout**: `bizum` aparece en sus `payment_method_types` (el intent de prueba se canceló). La cuenta es `acct_1TmwxTL1kwgv5hCu`, país ES y moneda EUR, que es lo que Bizum exige.

✅ **Reembolsos de Bizum: admite totales y parciales**, hasta 395 días después de la compra. La duda queda cerrada y el reembolso por artículos funciona igual con Bizum.

⚠️⚠️ **PERO los reembolsos de Bizum son ASÍNCRONOS y pueden fallar DESPUÉS de darlos por buenos**, y eso abrió un agujero que hubo que tapar en la misma sesión. Con tarjeta, que Stripe acepte el reembolso equivale a que el dinero sale. Con Bizum tarda hasta 5 minutos y puede acabar en `failed`: Stripe devuelve el importe a nuestro saldo y **el cliente se queda sin su dinero**, con el pedido ya marcado como reembolsado, el stock repuesto, los artículos apuntados y el correo enviado.

- Ahora se escucha `refund.updated` (y `charge.refund.updated`) y, si el estado llega en `failed` o `canceled`, se deja constancia **en la línea de tiempo del pedido** —donde lo verá quien lo abra— y como ERROR en el log.
- ⚠️ **No se revierte nada automáticamente**, y es deliberado: deshacer el apunte, volver a descontar el stock y reabrir el pedido a ciegas puede empeorarlo si alguien ya actuó o la mercancía ya volvió. Lo que hacía falta es que no pase inadvertido.
- ⚠️ **El nombre del evento importa**: la documentación de Stripe habla de `refund.failed`, pero **ese evento no existe en la versión de API de esta cuenta** (2024-06-20, librería 16.12). Aquí el fallo llega como `refund.updated` con el estado ya puesto. Si algún día se sube la versión de API, revisar esto.
- ⚠️ **El webhook escuchaba solo 4 eventos** (`payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`, `charge.refunded`), así que el aviso no habría llegado nunca. Se añadió `refund.updated` por API al endpoint `we_1Tw2mHL1kwgv5hCuBoKht7CL`. **Si se recrea el webhook al pasar a Stripe `live`, hay que volver a incluirlo.**

### ⚠️ Los datos bancarios NO son variables de entorno (migración 046)

Nacieron como tales en la 045 y Jonathan preguntó si hacía falta. La respuesta honesta es que no, y el criterio vale para lo que venga:

> **Las variables de entorno son para SECRETOS** —la clave de Stripe, la contraseña del SMTP—, cosas que nadie debe poder leer ni cambiar desde la aplicación. **Un IBAN de cobro no es un secreto: se le enseña a cada cliente que compra.** Es un dato del negocio, como las plantillas de permisos de los cargos, y quien lleva la tienda tiene que poder cambiarlo.

Y tenía un coste real: cambiar de cuenta obligaba a entrar en Render y esperar un redespliegue, **con los tokens revocados desde el 2026-07-25**. Ahora vive en `ajustes_tienda` (tabla de una sola fila, garantizado por el tipo de la clave) y se edita en **TI → Ajustes**, con nivel `total` por lo mismo que reembolsar: cambiar el IBAN cambia a dónde va el dinero de todas las ventas que se paguen así.

- **El entorno se conserva como respaldo** si la tabla está vacía, así que la 045 sigue funcionando. La pantalla avisa cuando la cuenta en uso viene de allí, porque entonces lo que se guarde en el panel no manda — y eso hay que saberlo antes de guardar, no después.
- **Se lee en cada uso, sin caché**: cambiar la cuenta tiene que surtir efecto en el pedido siguiente, no cuando se reinicie la API.
- ⚠️ **El IBAN se valida por su dígito de control** (mod-97, ISO 13616), con la regla en `@valatino/types` para que API y web usen la misma. No es cosmético: **un IBAN mal tecleado manda a los clientes a transferir a ninguna parte**, y no se descubre hasta que alguien reclama un pedido que nunca se preparó. Un IBAN que no valida cuenta como no configurado y apaga el método.
- ⚠️ **El IBAN de prueba que se dio no validaba**: `ES48 9490 0934 2392 2994 3748` da 16 en el mod-97 (debe dar 1). Con el mismo número de cuenta, el dígito correcto es **33**. Sembrado ya corregido.

### La transferencia es otra cosa: el primer pago ASÍNCRONO de la tienda

Hasta ahora un pedido nacía ya pagado —`confirmar_venta` lo creaba desde el webhook, con el dinero cobrado—. Aquí el pedido **nace debiendo dinero** y espera a que alguien del equipo confirme el ingreso. Decisión de Jonathan: transferencia **manual** a la cuenta de Valatino (no Stripe, no domiciliación), y el stock **reservado 3 días laborables** con cancelación automática si no llega.

⚠️ **LA DECISIÓN QUE LO SOSTIENE TODO: el plazo de pago ES el TTL de la reserva de stock.** El checkout ya reservaba las unidades 15 minutos (034) y un cron las devolvía al vencer; ahora esa misma reserva se estira hasta la fecha límite de la transferencia. Así el stock queda bloqueado mientras se espera el dinero, si no llega **el mecanismo que ya existía lo devuelve solo**, y no hay dos relojes que puedan contradecirse. Migración **045**.

- **`stock_reservas.pedido_id`** es la pieza que faltaba: sin ella, al confirmar el pago tres días después no habría forma de saber qué unidades consumir (`confirmar_venta` las localiza por sesión, y para entonces la sesión puede ser otra).
- **La idempotencia la trae el navegador**: no hay pasarela que devuelva un identificador con el que reconocer el intento, así que el checkout genera un UUID al montarse. Doble clic = mismo pedido; checkout nuevo = pedido nuevo.
- **`pedidos_metodo_pago_check` era una lista cerrada** (`stripe`, `paypal`). Se amplía, no se quita: es lo que impide que un método mal escrito entre en la tabla y se descubra al facturar.
- ⚠️ **El plazo salta fines de semana pero NO festivos.** Un pedido antes de Navidad dará un plazo optimista. Asumido a sabiendas: mantener el calendario laboral de cada comunidad cuesta más que ese margen.
- ⚠️ **Si el dinero llega después de vencer el plazo**, el cron ya devolvió las unidades a la venta. Confirmar entonces **no falla** —el dinero está y el pedido debe salir— pero descuenta del disponible sin reserva detrás y lo avisa: el panel saca un aviso de 10 segundos pidiendo revisar el inventario. Callarlo dejaría el stock descuadrado en silencio.
- **Reembolsar un pedido por transferencia está bloqueado con mensaje propio**: el dinero nunca pasó por Stripe. Se dice que hay que devolverlo desde el banco y cancelar el pedido para que el stock vuelva. Sin ese caso, caería en el mensaje de PayPal y mandaría a alguien a buscar el cobro a un panel donde no está.

### Cómo se ve
- **Checkout**: tercer botón «🏦 Transferencia», que **solo aparece si hay cuenta configurada**. Al continuar se reserva el pedido y se muestran IBAN, titular, importe y **concepto = número de pedido** (copiables), con la fecha límite.
- **Mis pedidos**: la ficha del cliente abre con un bloque ámbar «Falta tu transferencia» y los datos de pago. Va **por delante del seguimiento**: quien entra con un pedido sin pagar viene justo a por el IBAN, y el que cerró la pestaña del checkout no lo tiene en ningún otro sitio.
- **Panel**: botón verde «Pago recibido» en el pedido que espera ingreso, con confirmación previa. Exige nivel **`total`**, igual que reembolsar: es afirmar que ha entrado dinero, y de eso depende que salga la mercancía.

⚠️ **Los datos bancarios son configuración, no código** (`TRANSFERENCIA_IBAN`, `TRANSFERENCIA_TITULAR`, `TRANSFERENCIA_BANCO`, `TRANSFERENCIA_DIAS_PLAZO`, ver `render.yaml`). Cambiar de cuenta no puede exigir un despliegue, y el IBAN no tiene por qué quedar en el historial de git. **Sin ellas la opción no se ofrece**, que es el comportamiento correcto: enseñar «paga por transferencia» y luego no poder decir a dónde deja al cliente sin salida.

**Verificado en el remoto** en transacción revertida, 21 casos: el ciclo entero (reservar → crear pedido → confirmar → stock consumido), la idempotencia, el cálculo de días laborables saltando el fin de semana, y la caducidad (cancela el pedido, devuelve el stock **entero** y correrla otra vez no toca nada). **269 tests** en la API.

---

## Sesión 2026-08-02 — Reembolsar artículos, no solo un importe

Jonathan: *«cuando se va a hacer un reembolso de un pedido que muestre los artículos que se compraron y se pueda elegir cuál reembolsar, así será más fácil ordenar el reembolso y que no queden colas»*.

La cola que esto quita estaba escrita, con todas sus letras, en el comentario de la **migración 037**:

> «Solo repone el reembolso TOTAL: en uno parcial el importe no dice qué unidades vuelven (¿2 de un producto de 5 € o 1 de uno de 10 €?), así que el ajuste se hace a mano desde Inventario cuando la mercancía llega.»

Eso era cierto **mientras un reembolso parcial fuera solo una cifra**. En cuanto se eligen las líneas, el reembolso sí dice qué unidades vuelven, y el ajuste a mano —que es justo lo que se olvida— deja de hacer falta. El pedido de Jonathan y la deuda técnica que había apuntada eran la misma cosa.

### Lo que se guarda ahora es QUÉ se devolvió, no solo cuánto

Tabla `reembolso_lineas` (migración **044**): qué línea, cuántas unidades, cuánto dinero, si volvió al inventario y con qué reembolso de Stripe se pagó. De ahí salen las tres cosas que antes no se podían saber:

- **Qué le queda a este pedido por devolver, línea a línea.** Sin esto, la segunda devolución parcial vuelve a ofrecer lo ya devuelto.
- **Si esas unidades volvieron al inventario.**
- **Qué artículos figuran en cada devolución**, en la ficha del pedido.

### ⚠️ El peligro de esta migración era la doble reposición de stock

`reembolsar_pedido_total` (037/039) repone **todas** las unidades del pedido. El escenario normal de esta funcionalidad —devolver un artículo hoy y el resto del pedido mañana— habría repuesto dos veces las unidades del primer parcial y dejado el inventario inflado. Por eso la 044 la reescribe para reponer **solo lo que no figure ya en `reembolso_lineas`**.

Y se descuentan **todas** las líneas registradas, repuestas o no: que una línea esté marcada como no revendible no es un pendiente, es que se decidió que esa mercancía no vuelve. Completar el reembolso después no arregla una caja rota.

Para que el orden no dependa de que alguien lo recuerde, **registrar las líneas y cerrar el pedido van en la misma llamada** (`registrar_reembolso_lineas`, con `p_marcar_total`) y por dentro en la misma transacción. Dejarlo en dos llamadas desde la API era invitar a invertirlas.

### El precio lo pone el servidor, siempre

El panel manda **qué línea y cuántas unidades**, nunca el importe. Lo que vale cada una lo dice `pedido_items`, que es lo que se cobró — y lo mismo hace la RPC al registrar. Un `importe` metido dentro de una línea lo rechaza el `forbidNonWhitelisted` del ValidationPipe antes de llegar al servicio. Hay una prueba dedicada a eso, porque lo que hay al otro lado es dinero saliendo.

⚠️ **La clave de idempotencia necesitó los artículos dentro.** Era `reembolso:<pedido>:<ya>:<importe>`, y **dos líneas distintas del mismo pedido pueden costar lo mismo**: devolver una y luego la otra daba la misma clave, así que Stripe habría devuelto el refund de la primera sin cobrar nada — y el panel diría que la segunda se devolvió. Ahora lleva una huella de las líneas, ordenada (el mismo conjunto en otro orden es la misma devolución).

### Lo que se ve en el panel

- **Modal de reembolso**: los artículos del pedido con su precio, cuántas se compraron y cuántas quedan; casilla por línea y selector de unidades cuando hay más de una. Lo ya devuelto sale descontado y marcado. Total calculado abajo.
- **Casilla «las unidades vuelven al inventario»**, marcada por defecto y desmarcable cuando la mercancía no se puede revender (decisión de Jonathan).
- **Se conservan «Todo lo pendiente» y «Otro importe»**: hay devoluciones que no son un artículo (un gesto comercial). El importe suelto avisa de que no queda asociado a nada y por eso no repone stock.
- **La ficha del pedido** marca cada artículo devuelto («Devuelto», «1 de 3 devueltas», «· no repuesto»), y la línea de tiempo dice **qué** se devolvió en vez de solo cuánto.

### Verificado en el remoto, en transacción revertida

Los doce casos, sobre el pedido real `260728019405` (0,80 + 1,50 + 4,00 = 6,30 €): devolver una línea reponiendo · reintento del mismo refund (no duplica) · otro refund sobre una línea ya devuelta entera (recorta a cero) · una línea marcada como no revendible · **una línea de otro pedido, que se ignora** · y completar el total. Stocks finales exactos: Limón 11→12, Queso 1→2 y **Pony Malta 22→22** —la que se marcó como no revendible, que el total posterior tampoco repuso—. Un total sin líneas previas sigue reponiendo todo, como antes. La BD quedó intacta.

⚠️ **La RPC no lanza por cantidades**: se la llama con el dinero ya cobrado en Stripe, y abortar ahí dejaría la devolución hecha y sin rastro. Recorta a lo que de verdad quedaba y lo cuenta en el resultado; si recorta, la API lo escribe en el log como error, porque significa que se cobró más de lo que consta devuelto en artículos.

**Tests: 244** en la API (eran 208). `pnpm turbo type-check` limpio y `next build` correcto.

### Y el cliente lo ve en «Mis pedidos»

Segunda mitad de la sesión, pedida por Jonathan a continuación: *«que el cliente con su sesión iniciada pueda ver si su pedido se le reembolsó, qué artículo fue y el valor reembolsado»*.

⚠️ **El hueco era real y no era de pantalla: un reembolso parcial NO cambia el estado del pedido** —sigue en ENVIADO o ENTREGADO, y es correcto que siga, porque el resto del pedido continúa su curso—. La etiqueta de estado solo cuenta el reembolso **total**, así que hasta ahora un cliente al que se le devolvían 0,80 € **no tenía ninguna forma de enterarse** desde su cuenta.

Ahora cada pedido de `/cuenta/pedidos` trae `total_reembolsado` y `articulos_devueltos`, y la tarjeta muestra un bloque con qué se devolvió, cuándo y cuánto, más el total tachado y lo «pagado finalmente».

⚠️ **Lo que el cliente NO ve, y por qué está resuelto por construcción**: `reembolso_lineas` guarda también si la mercancía volvió al almacén, quién tramitó la devolución y el identificador del cobro en Stripe. `articulosDevueltos()` **elige campo a campo** —nunca `select("*")`— y el tipo `ArticuloDevuelto` es independiente de `ReembolsoLinea`, no un `Omit<>`: con un tipo derivado, añadir mañana una columna interna a la tabla la publicaría sola. Hay tres pruebas dedicadas a esto, una de ellas comprobando que la consulta no lleva comodín.

- **El pedido ajeno se corta antes de leer nada suyo**: `findOneByUser` consulta lo devuelto **después** del guard de propiedad, no antes. Leerlo y descartarlo al fallar el guard sigue siendo haberlo leído, y hay una prueba que lo fija.
- **Si hay dinero devuelto pero no consta de qué artículo** (devolución por importe suelto, o hecha desde el panel de Stripe), **se muestra el importe igual** y se dice que no corresponde a un artículo concreto. Callar la cifra por no tener el detalle sería lo peor de las dos opciones.
- Se avisa de que el abono va al mismo método de pago y **puede tardar unos días** en aparecer en el banco. Es cierto y ahorra el correo de «no me ha llegado».

### La ficha del pedido para el cliente (tercera parte de la sesión)

Jonathan probó el circuito entero con un pedido nuevo y pidió lo visual: *«que le dé click al pedido y le muestre lo que ha pasado con él, por ejemplo la devolución recibida, no como ahora que está mostrando todo hacia abajo, se ve feo»*.

**Cómo quedó**: la lista de `/cuenta/pedidos` es ahora de tarjetas compactas y pinchables —número, estado, los artículos resumidos en una línea, el importe y un aviso ámbar si hubo devolución—, y al pinchar se abre una ficha con **«Qué ha pasado con tu pedido»**: una línea de tiempo con icono por paso, los artículos, los totales y la dirección. En móvil entra como hoja inferior.

⚠️ **El historial interno NO se le puede enseñar al cliente, y por eso hay uno propio.** `pedido_eventos` lleva quién tocó cada cosa, su correo, el origen y textos de máquina (`payment_intent.succeeded`, `charge.refunded`, `reembolso.backoffice · 1 × Milo 400G`). El seguimiento se construye en el servidor (`construirSeguimiento`) traduciendo solo los cambios de estado, y **la consulta que lo alimenta ni siquiera pide las columnas de autor**: lo que no se lee no se puede filtrar mal. Se quedan fuera los correos (ya los tiene en su buzón), los pagos y los avisos de la pasarela.

⚠️ **Las devoluciones del seguimiento NO salen de los eventos, y esto es lo importante**: allí el importe es el **acumulado** devuelto hasta ese momento —lo necesita el cálculo de cuánto queda—, así que en el pedido de prueba la segunda devolución figura como **10,50 € cuando en realidad devolvió 10,00 €**. Enseñárselo al cliente junto al artículo devuelto sería contarle mal su dinero. El importe sale de `reembolso_lineas`, que lleva lo de cada línea. Hay una prueba dedicada a ese caso exacto.
  - Las líneas se agrupan por **fecha** para saber cuáles son de la misma devolución: todas las de un mismo reembolso se insertan en la misma transacción y `now()` es constante dentro de ella. Así se agrupa sin exponer el `refund_id`.

### Lo que esto NO hace
- **El correo al cliente sigue diciendo solo el importe**, no qué artículos se le devolvieron. Se puede añadir: `enviarReembolso` ya recibe los items del pedido. Es el siguiente paso natural ahora que el dato existe.
- **PayPal sigue fuera**: esas devoluciones se hacen desde su panel y llegan por webhook, sin líneas.
- Un reembolso hecho **desde el panel de Stripe** llega por `charge.refunded` y tampoco trae artículos: se registra el dinero y el estado, no las líneas. El cliente verá el importe sin detalle, que es lo que consta.

---

## Sesión 2026-07-28 — Cuatro bugs de usar el sistema de verdad

Jonathan probó el circuito completo y trajo cuatro cosas. **Tres eran de interfaz y una de la base de datos**, y las tres de interfaz tenían la misma forma: el sistema hacía lo correcto y la pantalla contaba otra cosa.

### 1. El teléfono que el cliente actualiza no llegaba al equipo (migración 043)

*«cuando el cliente la actualiza desde su perfil, esa actualización no está viajando al módulo admin y el equipo se está quedando sin esas actualizaciones.»*

El dato **ya estaba en la base**; el panel no lo leía. `listar_clientes` sacaba el teléfono de `profiles` y, si estaba vacío, del **snapshot del pedido**. Pero el cliente no escribe en ninguno de los dos:

| Columna | Quién la escribe |
|---|---|
| `profiles.telefono` | Solo el personal, a mano, desde la ficha. **No hay ninguna ruta pública que la toque.** |
| `pedidos.envio_telefono` | Copia congelada a propósito (040): dice a qué número se avisó para *aquella* entrega. |
| `direcciones_envio.telefono` | **El cliente** — y era la única que la RPC no miraba. |

Medido en el remoto antes de tocar nada, que es lo que lo dejó sin discusión: el cliente tenía `658498050` en su dirección y el panel mostraba `658498049`, el del pedido.

**La regla que se adopta: gana el teléfono que se tocó más tarde**, lo tocara el cliente o el equipo. Una prioridad fija rompe uno de los dos lados —si manda `profiles`, el cliente cambia su número y el equipo no se entera (el fallo de hoy); si manda la dirección, el asesor corrige, guarda y sigue viendo el de antes (el mismo fallo del revés, y encima con el botón diciendo que sí). El snapshot del pedido queda de último recurso, que es su papel: para el invitado sin cuenta es el único que hay.

⚠️ **El hallazgo de verdad de esta migración lo cazó la prueba en seco**: `set_updated_at()` pone `now()`, y **`now()` devuelve la hora de inicio de la transacción**. Dos escrituras en la misma transacción quedaban con el mismo instante, empataban, y el desempate se lo llevaba quien estuviera en el `else` — el cambio del cliente, hecho *después*, perdía. Es **exactamente la trampa de la corrección de la 039** (los eventos del pedido empataban y el orden lo decidía un UUID al azar). Se resuelve con `set_updated_at_preciso()`, que usa `clock_timestamp()`. No se toca `set_updated_at`, que la usan otras tablas.

- `direcciones_envio` gana `updated_at` — era la única tabla editable sin ella. **Backfill a `created_at`, no a `now()`**: fingir que se tocaron al migrar las habría hecho ganar a cualquier teléfono escrito a mano.
- `profiles.updated_at` pasa a trigger. Antes lo escribía la API a mano en el update; funcionaba, pero dejaba la regla a merced de que la siguiente ruta se acordara — y si se olvidaba, el fallo sería **silencioso**: el teléfono bueno perdería la comparación sin que nada avisara.

Verificado en transacción revertida, los cinco casos: solo dirección → el panel edita después → el cliente cambia después → el panel corrige otra vez → sin ninguno de los dos (cae al pedido). La BD quedó intacta (3 pedidos, 1 dirección, 3 calificaciones).

⚠️ Qué teléfono es este: el de la dirección es el «de contacto para la entrega», así que en un envío a un tercero podría no ser el del cliente. Es **el mismo dato que ya se mostraba** vía `pedidos.envio_telefono` (que se copia de ahí), así que no empeora nada — lo muestra al día.

### 2. La ventana de calificación no se cerraba al pulsar «Enviar»

*«le da enviar, no se cierra, la ventana queda activa y vuelve y califica y parece que vuelve a enviar.»*

Guardaba bien. Pero al pulsar «Enviar» aparecía el ✓ y **la ventana se quedaba ahí**, así que no parecía haber enviado nada: se volvía a puntuar —y **cada toque manda otro POST**— o se pulsaba otra vez. Es la misma lección de la sesión 2026-07-27 (cont. 5) con otra cara: entonces el éxito no se veía; ahora se veía pero no pasaba **nada de lo que se espera al enviar algo**.

Ahora se distinguen las dos formas de guardar, que son distintas de verdad:

| Cómo se guarda | Qué hace la ventana | Por qué |
|---|---|---|
| **Automático**, al completar las dos puntuaciones | Se queda | Justo después aparece el hueco del comentario; cerrarla se lo llevaría por delante |
| **Pulsando «Enviar»** | ✓ y se cierra sola (1,4 s) | Enviar es un acto de terminar |

Mientras se despide se bloquean las puntuaciones y el comentario: un POST más no aporta nada, y texto escrito en ese segundo y medio se iría con la ventana mientras el ✓ dice que se guardó. Cerrar a mano (✕, Escape, «Cerrar») cancela el reloj.

### 3. «No se pudo procesar el reembolso» cuando en realidad no se sabe

*«cuando se devuelve un importe menor que el total genera error, pero sí devuelve al cliente.»*

**Los datos estaban perfectos.** El parcial del pedido `260728018953` (1,00 € de 1,50 €) quedó cobrado en Stripe, registrado por los dos caminos (panel + webhook `charge.refunded`, como está previsto), con su evento a nombre de Jonathan y el correo al cliente enviado. Ni un error en los logs de Postgres. Al volver a probarlo ya no se reprodujo: fue una respuesta perdida.

Lo que sí era un problema de verdad es **el mensaje**, y ese se ha arreglado. El panel trataba igual dos fallos que no se parecen:

| Qué pasó | Se sabe del dinero | Qué dice ahora |
|---|---|---|
| La API respondió un error | **No salió** — nada se toca antes de que Stripe conteste | El mensaje de la API, y se puede corregir y reintentar |
| No hubo respuesta (red, proxy que corta) | **No se sabe** | «No hemos podido confirmar la devolución… compruébalo antes de volver a intentarlo», y relee el pedido del servidor |

⚠️ **Por qué esto importa y no es cosmético**: decir «no se pudo» es afirmar algo que no consta, y quien lo lee reintenta. La clave de idempotencia de Stripe (`reembolso:pedido:ya:importe`) protege el reintento **del mismo importe**; si al reintentar se cambia el importe o el motivo, ya no protege y **el cliente cobra dos veces**.

### 4. En el reembolso no se podía escribir «0,5»

El campo era `type="number"`: ante una coma el navegador devuelve `value = ""`, así que **el campo se vaciaba solo** y el botón se quedaba apagado sin explicar por qué. El `replace(",", ".")` ya estaba puesto —la intención era aceptarla— pero el input se la comía antes de llegar.

Ahora es `type="text"` con `inputMode="decimal"` y se filtra al escribir: un separador, dígitos a los lados, dos decimales, y **se conserva la coma tal como se teclea** (quien escribe coma espera ver coma).

⚠️ **La regla general**: para importes en español, `type="number"` no sirve. El navegador decide qué es un número según su idioma y **devuelve vacío en vez de decir que no le gusta**, así que el fallo llega a la pantalla como un campo que no responde.

**Tests: 208** en la API (sin cambios: los cuatro arreglos son de la web y de SQL). `pnpm turbo type-check` limpio.

---

## Sesión 2026-07-27 (cont. 6) — El login por enlace nunca funcionó (y nadie lo sabía)

Jonathan: *«no está llegando el correo para iniciar sesión»*, luego *«volvió a pasar, el login estaba funcionando muy bien»*. Resultó ser **tres problemas apilados**, y el del medio era nuestro y llevaba ahí desde el principio.

### Hay DOS caminos de entrada y solo uno funcionaba
El log de auth (ventana 18:00–22:41) los separa sin ambigüedad:

| Camino | Secuencia | Resultado |
|---|---|---|
| **Código tecleado** | `/otp` 200 → `/verify` **200** → `/user` 200 | ✅ |
| **Enlace pulsado** | `/otp` 200 → `/verify` **303** → `/token` **400** ×2 | ❌ nunca creaba sesión |

**No se notó nunca** porque con la plantilla en español el correo trae un código de 6 dígitos y se teclea: por el enlace no pasaba nadie.

### Los tres problemas, en orden
1. **De Supabase**: `templatemailer_template_body_http_error` — un **502** al descargar nuestra plantilla desde `api.supabase.com/platform/auth/<ref>/templates/magic-link`. Cuando eso falla, GoTrue **cae a su plantilla por defecto**, en inglés y **con enlace en vez de código**. Ahí se estrenó el camino roto.
2. **Nuestro, preexistente**: `/auth/callback` era un *route handler* de **servidor** y ese flujo no se puede completar ahí:
   - El **verificador PKCE** lo crea `signInWithOtp` en el **navegador**; el intercambio tiene que ocurrir donde vive → de ahí los `400`.
   - Supabase puede devolver la sesión en el **fragmento** de la URL (`#access_token=…`), y **un fragmento nunca se envía al servidor**. En el log hay un intento (22:40:44) con `/verify` 303 y **ningún** `/token` detrás: no había nada que leer.
3. **Efecto dominó**: al no entrar, se pide otro código → Supabase tiene un **enfriamiento por dirección** → `429 over_email_send_rate_limit` («you can only request this after 35 seconds») y **no se envía ningún correo**. De ahí el «no llega».

### Cómo quedó
- `/auth/callback` es ahora una **página de cliente** que cubre los tres formatos (`?code=`, `?token_hash=` y el fragmento, que `detectSessionInUrl` procesa al crear el cliente). Vincula pedidos y fusiona carrito, que la entrada por enlace se saltaba. Si nada cuadra, ofrece **pedir un código** en vez de dejar una pantalla sin salida.
  - Prueba del cambio: `GET /auth/callback` sin parámetros devolvía **307** (redirigía a `/login`, el callejón) y ahora devuelve **200**.
- **Reenviar con cuenta atrás** en la propia pantalla del código. Antes la única salida era «Cambiar correo», que devolvía al paso 1 a pedir otro y a chocar con el límite.
- ⚠️ **Si el límite salta en el PRIMER intento, se pasa igualmente a teclear el código**: significa que ya hay uno enviado y válido en el buzón. Dejar al usuario en el formulario del correo era el mismo callejón con otra cara.
- El `error` de la query del login ya se muestra; antes se escribía en la URL y no se pintaba en ninguna parte.

**El código sigue siendo el camino principal** (decisión de Jonathan) y el enlace queda como secundario **que ahora funciona de verdad**.

### Lo que queda de esto
- **Secundario pendiente**: re-guardar la plantilla en el Dashboard (**Authentication → Email Templates → Magic Link → Save**, sin cambiar nada) para que dejen de llegar los ingleses. Eso ataca la **causa**; lo hecho ataca la consecuencia.
- **Si el 502 se repite mucho**: enviar el correo de acceso nosotros con SendGrid vía **Send Email Hook** de Supabase. Ya existe `EmailModule` con plantillas en español, así que quita esa dependencia del flujo más crítico que hay.

### ⚠️⚠️ NO lanzar `supabase config push`
Es la tentación evidente para reenviar las plantillas, y **rompería producción**: `supabase/config.toml` tiene `site_url = "http://localhost:3000"` y `additional_redirect_urls` a localhost. Ese push sobrescribiría el `site_url` del remoto y los enlaces de todos los correos apuntarían a la máquina del cliente. Si algún día hace falta usarlo, **arreglar primero esos valores**.

### Dos cosas de método que salieron bien
- **`get_logs` del servicio `auth` viene capado a 100 entradas**, así que la ventana se desliza. Conviene comprobar el rango (`min`/`max` de los timestamps) antes de afirmar «esto solo pasó una vez».
- La primera sonda que escribí dio un **falso positivo**: buscaba la palabra «calificacion» en la respuesta, y el mensaje de un 404 incluye la URL. **Comprobar por código de estado, no por texto.**

---

## Sesión 2026-07-27 (cont. 5) — «Se queda procesando y no pasa nada» (no era el servidor)

Jonathan probó la calificación y reportó: *«se queda procesando, no pasó nada, me activó de nuevo enviar, lo hice 3 veces, no cierra»*.

### Lo que decían los datos
```
created_at  22:11:52
updated_at  22:12:32     → 40 s de diferencia, MISMA fila
```
**Los tres intentos se guardaron correctamente.** El preflight CORS respondía 204 con las cabeceras buenas y el `POST` devolvía 200. **No hubo ningún fallo de servidor.** Antes de tocar código conviene mirar esto: `created_at` vs `updated_at` de la fila dice cuántas escrituras llegaron de verdad, y ahorra buscar un bug que no existe.

### Los dos errores, los dos de interfaz
1. **El éxito era invisible donde el cliente miraba.** Al guardar solo cambiaba el título arriba de la tarjeta; el botón volvía de «Guardando…» a «Enviar comentario» sin decir nada. En móvil el título quedaba fuera de pantalla. **Un éxito que no se ve es indistinguible de un fallo.**
2. ⚠️ **Los errores se tragaban en silencio** (`return false` y nada en pantalla). Estaba puesto a propósito «para no molestar a quien acaba de pagar», y fue un error de criterio: **callar está bien ANTES de que alguien pulse; después de pulsar, deja a la persona sin saber si su dato se guardó — y a quien mantiene esto sin poder diagnosticarlo.**

### Cómo quedó
El estado y la acción van **juntos, al lado del botón**, en un `aria-live`:

| Estado | Se ve | Botón |
|---|---|---|
| Guardando | «Guardando…» | deshabilitado |
| Guardado | «✓ Guardado. ¡Gracias!» (verde) | **«Cerrar»** |
| Límite | «Demasiados intentos seguidos…» | «Enviar» |
| Sin red | «No hay conexión con el servidor.» | «Enviar» |

Escribir en el comentario tras guardar devuelve el estado a «sin guardar»: si no, el ✓ de la puntuación haría creer que el texto nuevo ya estaba a salvo.

### Y de tarjeta a ventana emergente
La otra mitad del reporte: *«queda súper escondido, nadie va a llegar allí»*. Cierto — al final de la página, bajo el pliegue. Ahora se abre sola al confirmarse el pedido, cerrable por cuatro vías (✕, Escape, fuera, «Cerrar») y en móvil entra como hoja inferior.

**Detalle que la incidencia destapó**: el límite de la ruta pública sube de **10 a 20** por minuto. Cada cambio de respuesta manda un `POST` (para que la opinión esté a salvo aunque cierren la ventana), así que varios toques de corrección más el comentario se acercaban al tope. No fue lo que pasó, pero un 429 en mitad de una encuesta voluntaria es una respuesta perdida.

### Verificado
El pedido **`260728011017`** (Regular · 4) se calificó ya con la ventana nueva. Y en el bundle desplegado están los siete estados nuevos, con «Enviar comentario» —el texto de la versión rota— a cero.

⚠️ **Lo que compilar y desplegar NO prueba**: la primera versión pasó `type-check`, build y despliegue, y estaba inservible. Que el código llegue a producción no dice nada de si se entiende en pantalla.

---

## Sesión 2026-07-27 (cont. 4) — Calificar la experiencia de compra (fase 1)

Petición de Jonathan: saber si comprar resultó **fácil o difícil**, qué nota le pone el cliente, y poder verlo en el panel. **Sin que sea obligatorio.**

### Qué se pregunta y por qué así
Dos preguntas, una pantalla, **dos toques**: esfuerzo (CES, 3 niveles) y satisfacción (CSAT, 1–5), más comentario opcional. Son métricas **distintas** a propósito: se puede quedar muy satisfecho con una compra que costó trabajo, y al revés.

⚠️ **Las escalas tienen FORMA distinta** (tres botones con etiqueta vs. cinco caras). Dos escalas 1–5 idénticas una debajo de otra invitan a marcar el mismo número dos veces sin pensarlo, y entonces los dos datos valen lo que uno.

El comentario **aparece después de puntuar**: quien ya dio dos toques está dispuesto a escribir, y un campo de texto por delante espanta. Y se guarda **en cuanto están las dos respuestas**, sin esperar a un botón: si cierra la pestaña, la opinión ya está.

### El problema de fondo era la identidad
Se compra como invitado (el registro es por OTP y solo captura el email), así que calificar **no puede exigir sesión**. Se ata al pedido con un **token opaco** (`pedidos.token_calificacion`) entregado por la puerta que **ya** acredita haber pagado: `GET /pedidos/por-referencia/:ref`, cuyo razonamiento —«la referencia solo la conoce quien pagó»— ya estaba escrito en el código. Inventar un segundo mecanismo habría sido otro sitio donde equivocarse.

### Migración 042
⚠️ **NO se toca `confirmar_venta`.** El token es un `DEFAULT gen_random_uuid()` de columna. Esa función corre dentro de la transacción de un pago ya cobrado y cada vez que se abre hay riesgo de convertir un cobro en un pedido que no existe.

- `pedido_calificaciones` con **PK = `pedido_id`**: «una por pedido» sale gratis, sin lógica que mantener ni carrera que resolver. RLS activa y **cero policies**, como `direcciones_envio` desde la 035.
- `resumen_calificaciones(dias)` en SQL: la tasa de respuesta necesita contar **todos** los pedidos calificables del periodo, y traérselos para contarlos en Node chocaría con el límite de 1000 filas de PostgREST sin avisar (misma razón que `listar_clientes`).
- El **denominador** son los pedidos que *pudieron* calificarse (los que llegaron a pagarse), no todos: un pedido pendiente de pago nunca vio la página de confirmación.

### Decisiones de la ruta pública
- **El `GET` devuelve `200` con `null` y NO distingue** «token válido sin calificar» de «token que no existe». Es deliberado: si respondiera distinto sería un oráculo para saber qué UUIDs son pedidos reales. ⚠️ Mi comentario en el código decía lo contrario (que un token inexistente daba 404) y **estaba mal**: se corrigió el comentario, no el comportamiento.
- **Límite de 10 peticiones/minuto** en la ruta pública (el global son 100): aquí no hay sesión que identifique a nadie. Verificado: la décima pasa, la onceava da 429.
- **Ventana de 7 días para corregir.** Un toque mal dado no debe quedar grabado para siempre, pero una opinión reescrita meses después ya no es la de aquel día.

### Dónde se ve
`Dashboard → Experiencia de compra`. **Pantalla dentro del módulo `dashboard`, no un módulo nuevo** (decisión de Jonathan): es una métrica de gerencia, y un módulo propio obligaría a tocar el CHECK de `modulo` en la BD, el tipo `StaffModulo`, el sidebar y las plantillas de los seis cargos sin ganar nada. Los comentarios se ven con **`dashboard:lectura`**, también decisión suya: el texto del cliente es justo lo accionable.

La opinión aparece además **en la ficha del pedido**, junto a la línea de tiempo: ahí tiene contexto (quién lo tocó, cuánto tardó, qué opinó).

### Verificado en producción
El pedido **`260728018953`** salió con teléfono, dirección validada contra el INE y calificación: **Fácil · 5/5 · «nada todo muy bien»**. El resumen lo recogió (1 respuesta / 1 calificable, 100 % de tasa).

Antes, contra la API real: token inventado en `POST` → 404 · valor fuera de rango → 400 · campo colado → 400 · token no UUID → 400 · corrección dentro de ventana → 200 con una sola fila · `/admin/calificaciones` sin sesión → 401.

⚠️ **Una trampa de verificación que conviene recordar**: `pnpm start` sirve `dist/`, no compila. La primera comprobación de rutas arrancó un build de dos días antes y las rutas nuevas «no aparecían». Si no se mira el mapeo de rutas, un arranque correcto no prueba nada.

**Tests: 208** en la API (10 nuevos).

**Fases 2 y 3 aplazadas** por decisión de Jonathan — están descritas en la cola de «Al volver».

---

## Sesión 2026-07-27 (cont. 3) — Limpieza de la BD a «arranque real»

A petición de Jonathan tras validar todo: fuera clientes, pedidos, eventos **y empleados**; dentro el inventario tal como lo dejó la factura, y una sola cuenta.

**Borrado** en un único bloque atómico: `pedidos` (que arrastra `pedido_items`, `pedido_eventos` y `transacciones_pago` en cascada), `carritos` (arrastra `carrito_items`), `stock_reservas`, `checkout_datos`, `empleados` (arrastra `empleado_historial_mensual`) y **todas las cuentas menos el súper admin** — que arrastran `profiles`, `user_roles`, `direcciones_envio`, `staff_modulos`, `identities` y `sessions`.

**Conservado**: 13 productos · factura 202521188 con sus 11 líneas y su autor · 1 proveedor · 6 cargos con sus 27 filas de plantilla · el súper admin con su perfil.

**Stock fijado a la factura**: 164 unidades, `reservado = 0`, descuadre 0 en los 13 productos. Ya cuadraba antes de la limpieza (los reembolsos del 26 y del 27 habían repuesto bien), así que este paso no cambió nada — se ejecuta igual porque es idempotente y es la única definición de «como lo dejó la factura».

### Cómo repetirlo sin destrozar nada
- **El admin se localiza por ROL, nunca por lista de correos** (`delete from auth.users where id <> v_admin`, con `v_admin` sacado de `user_roles`). Así no hay forma de llevárselo por descuido. Misma regla que la limpieza del 25.
- **El bloque lleva sus propias comprobaciones y `raise exception` al final**: si quedara algún usuario de más, se hubiera tocado el inventario o la factura se quedara sin autor, **todo se revierte**. Una limpieza que se valida después de haber hecho `commit` no se puede deshacer.
- **Cascadas comprobadas antes de borrar, no supuestas.** Las que importan: `pedido_eventos`, `pedido_items`, `transacciones_pago` y —desde la 042— `pedido_calificaciones` son `CASCADE` desde `pedidos`; `direcciones_envio`, `profiles`, `user_roles` y `staff_modulos` son `CASCADE` desde `auth.users`. En cambio `empleados.user_id` es **SET NULL**, así que borrar la cuenta **no** borra la ficha del empleado: hay que borrarla aparte (por eso los empleados sobrevivían a la limpieza del 25, que no los tocaba).
- ⚠️ `facturas_compra.creado_por` es **FK a `auth.users` con `ON DELETE SET NULL`**: borrar al admin dejaría la factura sin autor. El bloque lo comprueba explícitamente.
- ⚠️ `user_roles.asignado_por` es **NO ACTION**: si una cuenta que se va hubiera asignado el rol de otra, el borrado fallaría. Se comprobó antes que ninguna fila lo tiene puesto.

---

## Sesión 2026-07-27 (cont. 2) — Direcciones: el código postal manda

Petición de Jonathan, la última de la cola de siempre. Los cuatro campos de la dirección eran texto libre y ya habían dejado «españa» escrito como ciudad.

### La palanca que lo resuelve
**Los dos primeros dígitos del código postal español SON el código de provincia del INE.** Así que la provincia no hay que preguntarla: se deduce. Eso convierte tres campos en uno y elimina el ruido de raíz en vez de perseguirlo.

| Campo | Antes | Ahora |
|---|---|---|
| `provincia` | Texto libre; la única validación era «no vacía» | Derivada del CP, de solo lectura, y **recalculada en el servidor** |
| `ciudad` | Texto libre | Desplegable de los municipios de esa provincia (8.132 del INE) |
| `codigo_postal` | La API solo miraba `MaxLength(10)` | 5 dígitos **y** prefijo de provincia real (01–52) |
| `pais` | `char(2)`, aceptaba cualquier par de letras | CHECK de 2 mayúsculas ISO |

⚠️ **La provincia se recalcula en el servidor, no solo en el formulario.** Lo que llegue en el DTO se descarta. Es lo que hace que «españa» no pueda volver a entrar **por ninguna vía** — ni una web antigua, ni un cliente manipulado, ni una ruta nueva que alguien añada.

⚠️ **El municipio se valida contra la provincia DEL CP**, no contra las 8.132 de toda España: «Barcelona» con un código postal de Madrid es un error de datos, no una dirección.

**Tolerante al escribir, canónico al guardar**: `alcala de henares` y `MEJORADA DEL CAMPO` se aceptan (la comparación ignora mayúsculas, acentos y espacios de más) y se guarda el nombre oficial. Así el campo deja de acumular variantes del mismo sitio sin castigar a quien teclea rápido.

### El dataset se genera, no se pega
`node scripts/generar-municipios.mjs` descarga el diccionario del INE y escribe **las dos salidas desde la misma fuente**, para que no puedan desincronizarse. Comprueba además que los códigos de provincia cuadran con `PROVINCIAS_ES` y **falla al generar** si no: sin eso, un CP válido podría quedarse sin municipios y el desplegable saldría vacío sin ningún error.

Dos fuentes descartadas por el camino, que conviene no volver a considerar: el repo `oscarnovasf/ccaa-provincias-municipios` es de **enero de 2012** y está bajo **GPL-3.0** (copyleft sobre un proyecto comercial cerrado). Se fue a la fuente oficial del INE, edición vigente.

⚠️ **Los nombres van LITERALES del INE, sin dar la vuelta al artículo** («Acebeda, La»). Se estudió invertirlos para que se lean mejor y **se descartó**: 611 nombres traen el artículo al final, pero entre ellos hay comas legítimas — `Cruïlles, Monells i Sant Sadurní de l'Heura`, `Alqueries, les/Alquerías del Niño Perdido` — y una regla de «mover lo que va tras la última coma» las destrozaría en silencio. El precio es que en el desplegable se lee un poco raro; la ventaja es que el dato casa con cualquier fuente del INE sin traducción por medio. Mismo criterio en `PROVINCIAS_ES` («Rioja, La»).

### Dos decisiones de empaquetado que no son cosméticas
- **Para la API se emite un `.ts`, no un `.json`.** Importar JSON exigiría `resolveJsonModule` **y** configurar los assets del build de Nest para que el fichero llegue al `dist`. Si eso falla, la API no arranca en Render — y es la que cobra. Un módulo TypeScript no puede quedarse fuera del paquete.
- **En la web los municipios NO van en el bundle ni por la API.** No en el bundle porque son 127 KB para usar 3. No por la API porque **Render duerme** en el plan gratuito y el formulario de dirección no puede quedarse esperando a que despierte. Son 52 ficheros estáticos en `public/municipios/`, servidos por el CDN de Vercel, que `useMunicipios` cachea por provincia.

### Migración 041
CHECK de CP válido, país ISO y provincia entre las **52 oficiales** (52 valores estables desde hace décadas: caben en un CHECK y cierran «españa» para siempre).

- **El municipio NO se comprueba en la BD**: son 8.132 nombres de los que cambian algunos cada año. Meterlos obligaría a mantener el diccionario en dos sitios y a una migración por cada cambio del INE. Se valida en la API, que es la única que escribe en esa tabla (la 035 dejó su RLS en solo lectura para los clientes).
- ⚠️ **`pedidos.envio_*` se queda SIN restricciones, a propósito.** Esas columnas las rellena `confirmar_venta` **dentro de la transacción que confirma un pago ya cobrado**. Un CHECK que falle ahí no protege un dato: convierte un cobro en un pedido que no existe, y el webhook reintentaría sin éxito. El snapshot se copia de datos que la API ya validó; proteger un campo de texto no vale el riesgo de perder una venta cobrada.

### El hueco que cazó la prueba
Un `PATCH` con **solo la ciudad** no lo puede validar el decorador del DTO, porque no ve el CP guardado. La coherencia se resuelve en el servicio contra la fila actual (`dto.codigo_postal ?? actual.codigo_postal`). Sin eso, cambiar la localidad a secas se colaba sin validar.

### Verificado contra la API desplegada
```
99999                            → 400 código postal
Barcelona con CP 28001           → 400 no es municipio de esa provincia
"Madrit"                         → 400 no es municipio de esa provincia
provincia="españa" + resto bien   → pasa (se recalcula a Madrid)
"alcala de henares"              → pasa (se guarda «Alcalá de Henares»)
```
Y en el remoto: las tres restricciones de la 041 rechazan «99999», «españa» como provincia y un país no ISO, y aceptan la dirección buena. La BD quedó intacta.

**Tests: 198** en la API (35 nuevos).

---

## Sesión 2026-07-27 (cont.) — Teléfono de contacto del cliente

Jonathan lo detectó probando el módulo de clientes: **el teléfono no se pedía ni se capturaba en ninguna parte.**

### El diagnóstico era peor de lo que parecía
`profiles.telefono` existía y `listar_clientes` lo leía, pero **solo podía rellenarlo el personal a mano** desde el panel. Para un invitado era **imposible**: `pedidos` no tenía columna donde guardarlo y la rama `sin_cuenta` de la RPC devolvía `NULL` cableado. Y la ficha del pedido remataba etiquetando «Teléfono / referencia de pago» un campo que mostraba **la referencia de pago**: llamaba teléfono a un dato que no lo era, mientras el de verdad no se pedía.

### Migración 040
`direcciones_envio.telefono` y `pedidos.envio_telefono`, ambas **nullable**: las filas anteriores no lo tienen y no hay valor honesto que inventarles. Lo exige el formulario, no la tabla.

- El teléfono viaja al pedido como **COPIA**, mismo criterio que el resto de `envio_*`: si el cliente cambia de número, el pedido antiguo sigue diciendo a qué teléfono se avisó para aquella entrega.
- **La firma de `confirmar_venta` no cambia**, así que la API anterior seguía funcionando contra esta BD. Eso es lo que permitió desplegar en dos fases.
- `listar_clientes` **deriva el teléfono del pedido** cuando el perfil no lo tiene, igual que ya hacía con nombre y documento — y también para los invitados.

### Una sola regla de validación
En `@valatino/types`: `normalizarTelefono`, `telefonoValido` y `formatearTelefono`. La API la consume con un decorador `@EsTelefono` **en vez de copiar la regex**, que es como el CHECK de `modulo` acabó reescrito cuatro veces. Se guardan **9 dígitos pelados**: aceptar lo tecleado llenaría la columna de «+34600112233», «600 11 22 33» y «600-11-22-33» para el mismo número, que es el mismo ruido que ensució las direcciones.

**Obligatorio para pagar** — decisión tomada en la sesión: es por donde el repartidor avisa o pregunta si no encuentra el portal. Si algún día molesta, es una línea en `direccionCompleta()`.

**Las direcciones guardadas antes de la 040 no tienen teléfono.** El selector del checkout avisa en ámbar y lo pide ahí mismo, guardándolo **en la dirección** y no solo para ese pedido: es un dato de la dirección, la RPC lo lee de ahí y así el cliente no vuelve a tropezar. Hasta que lo tenga, no se puede pagar.

### ⚠️ El despliegue en dos fases no era teoría
El `ValidationPipe` global usa `forbidNonWhitelisted`, así que una web que enviara `telefono` contra la API anterior recibiría un **400 al pagar**. Se subió API primero y la sonda contra Render lo confirmó en vivo:

```
{"statusCode":400,"message":["direccion.property telefono should not exist"]}
```

Eso es lo que habría recibido cada cliente durante los ~8 minutos de ventana. Se esperó a que la API cambiara (empezó a fallar por «El carrito está vacío», lo correcto para una sonda sin carrito) y entonces se subió la web.

### Verificado end-to-end
En transacción revertida por los dos caminos —invitado con teléfono en el snapshot (sale en `listar_clientes` con su número, antes imposible) y usuario con dirección guardada (la RPC lo lee de `direcciones_envio`)— y después **en producción por Jonathan**: pedido `260727014265` con `envio_telefono = 658498049`, y el cliente aparece en el listado con su teléfono.

**Tests: 163** en la API (16 nuevos).

---

## Sesión 2026-07-27 — Quien solo consulta no ve botones que no puede pulsar

Jonathan, probando con una cuenta de solo lectura: *«siguen viendo el botón de guardar o los iconos de eliminar, pero cuando dan clic no funciona»*.

### El patrón estaba a medias
Tres comportamientos distintos convivían: unas pantallas **ocultaban** el control, otras solo lo **deshabilitaban** (botón gris que no responde, que es lo que se veía) y otras **no comprobaban nada**. Se unifica en una regla: **lo que no se puede hacer, no se pinta.**

En un formulario que existe para editarse la regla no basta —esconder el botón dejaría campos rellenables que no se pueden guardar—, así que ahí los campos se bloquean con un **`<fieldset disabled>`** (apaga todo lo de dentro de una vez, así ningún campo nuevo se olvida) y el botón de guardar no se renderiza.

| Pantalla | Qué se colaba |
|---|---|
| Catálogo | «+ Nuevo producto» gris, y lápiz + papelera **siempre visibles** |
| Inventario | «+Stock» en cada fila, **sin ninguna comprobación** |
| Proveedores | Formulario de alta **entero y rellenable** |
| Gestión Humana | Tarjeta «Generar histórico» con botón gris |
| Fichas de empleado y cliente | Formulario editable con «Guardar» gris |
| TI → Usuarios | «Dar acceso» y lápiz visibles con `ti:lectura` |

En los listados de clientes y empleados el icono pasa de **lápiz a ojo** cuando no hay `edicion`: la ficha sí se consulta con lectura, pero un lápiz promete editar.

### Tres agujeros que aparecieron por el camino
1. **Borrar producto exige `catalogo:total`**, no `edicion`. Quien tenía edición veía la papelera y se comía un 403.
2. **`/backoffice/compras/nueva` y `/backoffice/gestion-humana/nuevo` eran alcanzables por URL con solo lectura** — el layout del módulo solo pedía `lectura`. Cada una gana su layout con `edicion`. **Esto no era cosmético.**
3. Los textos de estado vacío decían «Crea el primero con…» a quien no puede crear nada.

Los niveles se sacaron **uno a uno de los decoradores `@Nivel` de la API**, no de memoria.

---

## Sesión 2026-07-26 (cont.) — Ficha del pedido y trazabilidad de quién lo tocó

Dos peticiones de Jonathan: poder **abrir un pedido y ver sus artículos**, y saber **quién cambió cada estado**, visible para todo el equipo.

### El problema técnico que decidió el diseño
El estado de un pedido se cambia por **cuatro caminos**, y **dos ocurren dentro de SQL**: `PATCH /admin/pedidos/:id/estado` (persona), el webhook por referencia de pago (sistema), la RPC `confirmar_venta` del checkout (sistema) y la RPC `reembolsar_pedido_total` (persona). Registrar el historial desde Node dejaría fuera los dos últimos. **Un trigger es la única forma de que no se escape ninguno**, ni hoy ni cuando alguien añada un quinto camino.

⚠️ **Hacen falta DOS triggers**: el checkout **no actualiza** el estado, **inserta** el pedido ya en `PROCESANDO`. Sin el de `INSERT`, la línea de tiempo empezaría en blanco y el pedido parecería haber aparecido de la nada.

### Migración 039 (+ una corrección)
Tabla **`pedido_eventos`** con toda la línea de tiempo: alta, cambios de estado, pagos, reembolsos y correos. Nuevas RPC `cambiar_estado_pedido`, `registrar_evento_pedido` y `reembolsar_pedido_total` con autor.

- **El autor viaja en una variable de transacción** (`app.actor_id`) que fijan las RPC que saben quién actúa. Un `UPDATE` suelto no la trae y el evento queda como `sistema` — que es la verdad del webhook, no un hueco.
- **El nombre y el correo se copian, no se referencian**: si mañana se da de baja a un asesor y se borra su cuenta, el historial sigue diciendo que fue él. Mismo criterio que `pedidos.envio_*`.
- **`reembolsar_pedido_total` cambió de firma**, así que hubo que **soltar la versión de un argumento**: `create or replace` distingue las funciones por su lista de parámetros y habrían quedado las dos vivas, con la llamada de un argumento ambigua.

⚠️ **Dos fallos que cazó la prueba en seco** (corregidos como `039_fix_orden_y_fuga_de_actor`):
1. **Fuga de autor**: `set_config(..., true)` dura **toda la transacción**, no solo la sentencia siguiente. Un cambio posterior en la misma transacción heredaba el autor de la RPC anterior y el historial **atribuía a una persona algo que hizo el sistema**. Las RPC ahora limpian la variable en cuanto han hecho su update.
2. **Orden descolocado**: `created_at` usaba `now()`, que devuelve la hora de **inicio de la transacción**; los eventos empataban y el desempate lo decidía un UUID aleatorio. Ahora es `clock_timestamp()`.

### Los eventos que un trigger no puede ver
`EventosPedidoService` (módulo propio, porque lo necesitan `PedidosModule` y `EmailModule` y el primero ya importa al segundo — al revés sería circular, igual que pasó con `StripeService`):
- **Pagos y reembolsos** se anotan dentro de `registrarTransaccion`, el **único** sitio donde se escribe en `transacciones_pago`: ahí no puede desincronizarse con el registro contable.
- **Correos**: `EmailService.enviar` pasa a devolver si el correo salió de verdad, y **solo entonces** se anota. Anunciar en el historial un correo que nunca llegó es peor que no anotarlo, porque nadie iría a comprobarlo.
- **Registrar un evento nunca tumba la operación que lo provocó**: el historial es la consecuencia del hecho, no el hecho.

### La ficha
`GET /admin/pedidos/:id` con **nivel `lectura`** — que el equipo entero pueda ver quién tocó un pedido es el objetivo. Pinchar una fila abre el modal con cabecera, cliente y envío, artículos con subtotales, y la línea de tiempo.

⚠️ **La celda de acciones lleva `stopPropagation`**: ahí viven el desplegable de estado y el botón de reembolso, y abrir la ficha al usarlos sería un incordio. La fila es accesible por teclado (`role="button"`, Enter/Espacio) y el modal cierra con Escape.

**El cliente NO ve el historial**: `findByUser` y `findOneByUser` seleccionan `pedido_items` y `direcciones_envio`, nunca `pedido_eventos`. Los nombres del personal no salen de la casa.

### Verificado end-to-end contra el Supabase real
Con un pedido de prueba de 2 líneas y una cuenta de asesor con `pedidos:edicion` (**todo borrado después**: 0 pedidos, 0 eventos, 0 direcciones, 1 usuario):
- La ficha devolvió artículos, cliente, documento y dirección completa.
- Cambiar a `ENVIADO` → **200**; intentar `CANCELADO` (exige `total`) → **403**.
- La línea de tiempo salió: `(alta) → PROCESANDO` *Sistema (checkout)* · `PROCESANDO → ENVIADO` **Jhoanna Mendoza** · `correo «Tu pedido va en camino»`.
- En transacción revertida: un `UPDATE` suelto saltándose la RPC **también** queda registrado, y un update que no toca el estado no genera nada.

**Tests: 147** en la API (13 nuevos).

---

## Sesión 2026-07-26 — Niveles de permiso por módulo y plantillas por cargo

Pregunta de Jonathan que lo originó: con seis cargos creados y gente entrando, **¿asignar un módulo da todo lo que el módulo contiene, o se pueden dar unos permisos sí y otros no?** La respuesta era «todo», y eso no aguantaba lo que viene.

### Los tres huecos del modelo de dos roles
1. **El cargo no otorgaba nada.** Con quince asesores, TI marcaba módulos quince veces a mano y nada garantizaba que dos «Asesor Comercial» acabaran igual.
2. **No había sitio para un director.** O `admin` (y entra a TI, cambia roles, borra cuentas), o `asesor` sin poder reembolsar aunque llevara el módulo de pedidos.
3. **No existía el solo lectura.** El Director Administrativo no podía consultar compras sin poder modificarlas.

### Decisiones de diseño (elegidas por Jonathan)
| | |
|---|---|
| Cargos directivos | **Sin rol nuevo.** Siguen 2 roles en BD; un director es un `asesor` con nivel `total`. La interfaz muestra su **cargo real** de RRHH |
| Plantillas | **Molde que se copia** al provisionar, editable por persona, con botón «Aplicar al equipo» |
| Quién las edita | **Solo TI.** El cargo lo crea RRHH; los permisos los pone TI, para que quien gestiona personas no pueda concederse acceso creando un cargo a medida |
| Alta suelta sin ficha | **Eliminada.** Todo pasa por RRHH → TI |

### Semántica de los niveles (fija la clasificación de cada endpoint)
- **`lectura`** — consultar. No escribe en BD ni fuera.
- **`edicion`** — el día a día: crear y modificar. Reversible o corregible.
- **`total`** — irreversible, destructivo, con efecto económico, o que toca credenciales y permisos.

### Dos capas que NO se mezclan
- **`@Nivel` protege el negocio** → reembolsar, borrar cliente y borrar empleado dejan de ser admin-only. Dejarlos cableados al rol vaciaría de contenido el nivel `total`, que es justo lo que se le da a un director.
- **`@Roles("admin")` protege la frontera del sistema de permisos** → cambiar rol, bloquear y eliminar cuentas siguen siendo del súper admin. Si un `ti:total` pudiera cambiar roles, se auto-promovería a admin.

⚠️ **En el módulo TI no existe un `edicion` seguro**: cambiar la contraseña o el correo de otra persona es apropiarse de su cuenta, y crear una cuenta es poder fabricarse permisos. Solo `lectura` (auditar) y `total` (administrar). Por eso GER lleva `ti: lectura` en la plantilla.

### Migración 038 (+ una corrección)
`staff_modulos` gana la columna `nivel`; nueva tabla `cargo_modulos` con la plantilla de cada cargo, sembrada para los seis. Tres RPC nuevas: `reemplazar_staff_modulos`, `aplicar_plantilla_cargo` y `mi_cargo()`.

- **La PK sigue siendo `(user_id, modulo)`**: meter `nivel` en ella permitiría dos filas del mismo módulo con niveles distintos y obligaría al guard a quedarse con el máximo.
- **Default `'lectura'`**: el único valor que falla cerrando, y cubre la ventana en que la API vieja siga insertando sin `nivel`.
- **Dominio `nivel_permiso`** en vez de un CHECK copiado: el CHECK de `modulo` ya se ha reescrito cuatro veces por estar duplicado.
- ⚠️ **`mi_cargo()` es `security definer` por necesidad**: `empleados` y `cargos` tienen **RLS activa y CERO policies**, así que leerlas con la sesión del usuario devuelve **0 filas en silencio**. El cargo saldría siempre vacío sin ningún error visible.
- La prueba en seco cazó un fallo real antes de que lo usara nadie: `nombre_completo` es `varchar(200)` y la RPC declaraba `text`. Corregido en el remoto como `038_fix_tipo_nombre_en_aplicar_plantilla`.

### «Aplicar al equipo» pisa los ajustes individuales — a propósito
Es un **reemplazo**, no una suma. Un merge que solo añadiera nunca convergería a la plantilla y con el tiempo todo el mundo acumularía permisos. La objeción legítima se resuelve con **confirmación informada**: `GET :id/afectados` devuelve el diff por persona y la pantalla avisa en ámbar de quién tiene permisos personalizados que se van a perder. La RPC omite siempre al súper admin, a quien no tiene cuenta y a quien está de baja.

**Salvaguarda que sí existe**: un TI no admin que reaplique la plantilla de **su propio cargo** tiene que confirmarlo (`incluirme`). **La que no**: el invariante «siempre queda alguien con `ti:total`» es complejidad defensiva que nunca podría dispararse, porque `updateRol` ya impide degradar al último admin.

### Cuatro agujeros preexistentes cerrados de paso
1. `GET /productos?soloActivos=false` miraba el rol pero **no el módulo**: un asesor que solo llevara `gestion_humana` listaba todos los borradores del catálogo.
2. `DELETE /admin/proveedores` no tenía ningún freno: cualquier asesor con `compras` borraba un proveedor del maestro.
3. `PATCH /admin/usuarios/:id/modulos` permitía que un `ti:total` **se quitara `ti` a sí mismo** y quedara fuera de la única pantalla desde la que recuperarlo.
4. El reemplazo de permisos era DELETE + INSERT en dos viajes: un fallo a mitad dejaba a la persona **sin ningún permiso**. Ahora es una RPC transaccional.

### Interfaz
`SelectorPermisos` sustituye las tres copias de casillas: **un desplegable de cuatro opciones por módulo** (Sin acceso · Solo lectura · Edición · Control total) en vez de casilla + nivel, lo que elimina el estado imposible «marcado pero sin nivel». Nueva pantalla **TI → Cargos**. Los chips de módulo llevan el nivel (`total` en **ámbar, no rojo**: el rojo se lee como error, no como privilegio).

Los permisos bajan **una sola vez** desde el layout por contexto. Antes convivían tres mecanismos: un endpoint `/permisos` que se consultaba tras montar (los botones aparecían de golpe), una prop, y una derivación frágil que se buscaba a uno mismo dentro de la lista cargada. Los dos endpoints `/permisos` desaparecen.

Los siete layouts de módulo, que repetían el mismo bloque de tres líneas, llaman ahora a `exigirModulo()`.

### Verificado end-to-end en local contra el Supabase real
Se creó un empleado ASECOM desde RRHH, se le provisionó cuenta desde TI (con la plantilla precargada) y se entró con ella. **Todo se borró después**: 0 empleados, 0 `staff_modulos`, 0 usuarios de prueba, 1 usuario total (el admin).

- Con `pedidos:edicion, clientes:lectura, catalogo:lectura`: listar pedidos y clientes **200**; editar cliente **403**; reembolsar **403**; borrar cliente **403**; compras, dashboard, RRHH, usuarios y cargos **403**.
- **Revocación inmediata con EL MISMO token, sin volver a entrar**: subir a `pedidos:total` deja de dar 403 al instante, y bajar a `lectura` lo devuelve. Los permisos se leen por petición, no viajan en el token.
- Los dos agujeros: con solo `gestion_humana`, `?soloActivos=false` da **403** (antes 200); con `compras:edicion`, borrar proveedor da **403**.
- DTOs: formato viejo `{modulos:[…]}` **400**, módulo duplicado **400** (no 500), nivel inventado **400**.
- Reaplicar: el diff anunció el `compras:edicion` puesto a mano → se quita, y la plantilla se restaura. Segunda pasada, **0 divergentes**.

**Tests: 134** en la API (49 nuevos). La web sigue sin tests; la red ahí es `pnpm turbo type-check`, que rompe exactamente en los puntos afectados al cambiar el shape de `@valatino/types`.

⚠️ **Ventana de despliegue**: Render y Vercel auto-despliegan del mismo push, así que **no se puede** ordenar API antes que web — y como Render en plan free tarda más, la combinación mala (web nueva contra API vieja) es la probable. Por eso la web tolera el formato anterior **solo en lectura** durante una release (`permisos ?? []`). ← **Sigue ahí y ya sobra** (ver el punto 5 de «Al volver»); el razonamiento de esta nota se corrigió el 27: el orden seguro depende de qué lado se vuelve más estricto, no siempre es «API primero». En escritura no se acepta a propósito: mapearlo a un nivel por defecto reintroduciría un fail-open silencioso.

---

## Sesión 2026-07-25 (cont. 4) — Limpieza de la BD a «arranque real»

A petición de Jonathan, tras validar el flujo de reembolsos: fuera clientes y pedidos, dentro el inventario tal como lo dejó la factura.

**Borrado** (hijos antes que padres, en un solo bloque atómico): `transacciones_pago`, `pedido_items`, `pedidos`, `carrito_items`, `carritos` (22 filas de sesiones de prueba), `stock_reservas`, `checkout_datos`, y las cuentas con **rol `cliente`** de `auth.users` — que arrastran en cascada `profiles`, `user_roles`, `direcciones_envio`, `identities` y `sessions`.

**Conservado**: 13 productos · factura 202521188 con sus 11 líneas · 1 proveedor · 6 cargos · el **súper admin** con su perfil.

**Stock fijado a la factura** (`stock_disponible = suma de factura_compra_items`, `stock_reservado = 0`). Verificado: **descuadre 0 en los 13 productos**. Eso resolvió de paso el `−1` de `Tostados la Gitana` (2 → 3) que había dejado el reembolso del camino viejo.

Dos detalles que conviene no olvidar si hay que repetir esto:

- El borrado se filtra por **rol `cliente`**, nunca por lista de correos: así no hay forma de llevarse al admin por descuido. Se comprobó después que el admin sigue con su perfil y con la factura a su nombre.
- `facturas_compra.creado_por` es **FK a `auth.users` con `ON DELETE SET NULL`**: borrar al admin dejaría la factura sin autor. Otra razón para no tocar esa cuenta.

---

## Sesión 2026-07-25 (cont. 3) — Avisos por email al cambiar de estado y reembolsos reales

### El fallo de fondo que se arregla
Elegir **«Reembolsado»** en el desplegable del panel **solo cambiaba la columna `estado`**: no movía un euro en Stripe ni avisaba al cliente. El panel aparentaba reembolsar sin reembolsar, y el dinero solo salía si alguien entraba a mano en el dashboard de Stripe. Por eso **REEMBOLSADO desaparece de `TRANSICIONES_PEDIDO`**: ya no es un estado que se teclea, es la consecuencia de haber devuelto el dinero.

### Aviso al cliente en cada cambio de estado
`PATCH /admin/pedidos/:id/estado` envía correo tras guardar. Textos en `email/templates/estado-pedido.ts` (`COPIAS_ESTADO`):

| Estado | Asunto |
| --- | --- |
| `PROCESANDO` | Estamos preparando tu pedido |
| `ENVIADO` | Tu pedido va en camino |
| `ENTREGADO` | Tu pedido ya está en casa |
| `CANCELADO` | Tu pedido ha sido cancelado |

`COPIAS_ESTADO` es un `Partial` a propósito: **el estado que no figura no genera correo**. `PENDIENTE_PAGO` queda fuera porque nadie transiciona *hacia* él, y `REEMBOLSADO` porque lo avisa el correo de reembolso, que además dice el importe.

- **Envío sin `await`** (`void this.notificarCambioEstado(...)`): el estado ya está guardado y un SMTP lento (o los 20 s de timeout) no debe hacer que el panel parezca roto. Los fallos van al log y **nunca** tumban la transición — hay test que lo fija.
- El andamiaje HTML (cabecera, banner, pie) se extrajo a `email/templates/formato.ts`. Antes cada plantilla llevaba su copia; con dos plantillas eso ya divergía seguro.

### Reembolsos: `POST /admin/pedidos/:id/reembolso` (solo admin)
Modal en el panel con **total o importe parcial**, motivo interno opcional, y el aviso de que la acción no se puede deshacer. Orden deliberado: **primero se cobra en Stripe y solo después se toca la BD**, para no dejar nunca un pedido marcado como reembolsado sin dinero devuelto.

- **Doble clic no cobra dos veces**: la `idempotencyKey` de Stripe es `reembolso:<pedido>:<yaDevuelto>:<importe>`. Misma situación + mismo importe = Stripe devuelve el reembolso que ya creó. Lleva `yaDevuelto` para que dos parciales iguales *seguidos* (10 € y otros 10 €) sí se cobren los dos.
- **Reembolso total** → RPC `reembolsar_pedido_total` (migración **037**): marca `REEMBOLSADO` **y repone el stock**, bajo lock de fila y **solo una vez**. El cambio de estado es lo que da permiso a reponer, así que el webhook `charge.refunded` que Stripe manda *por el reembolso que acabamos de pedir* encuentra el estado ya puesto, devuelve `false` y no vuelve a sumar. Verificado contra el remoto en transacción revertida: stock 10 → **13**, estado `REEMBOLSADO`; segunda llamada **13** y `false`.
- **Reembolso parcial** → no cambia el estado (el envío sigue su curso) y **no repone stock**: el importe no dice qué unidades vuelven. El ajuste se hace a mano desde Inventario. Asimetría decidida por Jonathan.
- **PayPal se rechaza** con un 400 explicativo (hay que devolverlo desde su panel; el webhook luego actualiza y avisa). El botón tampoco se ofrece para esos pedidos.

### ⚠️ `total_reembolsado` se calcula con MAX, no con SUM
Cada fila de reembolso en `transacciones_pago` guarda el **acumulado** devuelto, no el incremento (así lo informa `charge.amount_refunded` de Stripe). El mismo reembolso se registra **dos veces** por caminos distintos —el panel al pedirlo (`evento_id` = id del refund) y el webhook al confirmarlo (`evento_id` = id del evento)— así que la restricción de unicidad no los deduplica. **Sumar contaría el doble** y bloquearía devoluciones legítimas; quedarse con el máximo es idempotente. Hay un test que fija esta decisión para que nadie la «arregle» convirtiéndola en un `SUM`.

Del mismo principio sale el corte anti-duplicado del correo: el webhook solo avisa si el acumulado **sube** respecto a lo ya conocido. Sin eso, el cliente recibía dos correos por la misma devolución.

### Detalles de plomería
- `StripeService` pasa a su propio `StripeModule`: lo necesitan `PagosModule` y `PedidosModule`, y `PagosModule` ya importa `PedidosModule` — importarlo al revés sería circular. `PagosModule` lo re-exporta para no romper a nadie.
- `SMTP_PORT` **por defecto 2525** (Render free bloquea 465/587) y **`requireTLS` obligatorio** cuando no es 465: en 2525 la conexión abre en claro y se eleva con STARTTLS, y sin exigirlo las credenciales podrían viajar sin cifrar.
- Tests: **85** (8 suites). Nuevos: `reembolsos.service.spec.ts` (16) y `plantillas.spec.ts` (11).

### Desplegado y PROBADO end-to-end en producción (commit `749ab01`)
`POST /admin/pedidos/:id/reembolso` pasó de **404 a 401** (la ruta existe y exige sesión) · `/health` 200 · catálogo público 200 · `/admin/pedidos` sin token 401 · tienda y `/admin` 200.

**Jonathan probó el flujo completo el 2026-07-25**: pedido `260725018467` (0,50 €, Nucita), correos recibidos y **reembolso aplicado de verdad en Stripe**. Los datos de la BD confirman el diseño mejor que cualquier test:

| Hora | Evento | `evento_id` | Importe |
| --- | --- | --- | --- |
| 21:23:03 | `payment_intent.succeeded` | `evt_…0zbFI6Ao` | 0,50 |
| 21:32:50.428 | `reembolso.backoffice` | **`re_`**`…0ha9sSGM` | 0,50 |
| 21:32:51.323 | `charge.refunded` | **`evt_`**`…0Z9PJGiD` | 0,50 |

- **El mismo reembolso quedó registrado dos veces**, con 0,9 s de diferencia y `evento_id` distinto (panel y webhook). Es exactamente el caso por el que `total_reembolsado` usa `MAX`: con `SUM` el panel diría «1,00 € devuelto» sobre un pedido de 0,50 € y bloquearía cualquier operación posterior.
- **`pedidos.updated_at` = 21:32:50.18**, anterior a la fila del webhook. Si la llamada del webhook al RPC también hubiera actuado, esa marca sería de las 21:32:51.3. Devolvió `false` y no repuso stock por segunda vez.
- **Stock verificado por descuadre**: Nucita tiene 36 disponibles y la factura de compra cargó 36 → **descuadre 0** con una unidad vendida y devuelta. Se repuso una sola vez.

~~⚠️ **Descuadre preexistente de 1 unidad**~~ → **resuelto** en la limpieza de la BD (cont. 4). Venía del pedido `260725018055`, reembolsado a las **17:26**, cuatro horas antes de desplegar esto: pasó por el camino viejo (`actualizarEstadoPorReferencia`), que no reponía stock. Dejaba `Tostados la Gitana` en 2 de 3. Al fijar el stock a la factura quedó en 3.

---

## Sesión 2026-07-25 (cont. 2) — Despliegue a producción y módulo Clientes

### Despliegue de la auditoría
Merge de `fix/auditoria-2026-07-25` a `main` y push (Render y Vercel auto-despliegan). **Verificado en línea**: `/health` 200 · catálogo público 200 · `?soloActivos=false` sin token **403** (antes 200) · `POST /admin/usuarios/roles` **404** (la ruta de escalada ya no existe) · CORS permite el dominio y las previews del proyecto y **bloquea un `vercel.app` ajeno** · la web sirve el código nuevo (confirmado buscando el texto «Entrando en tu cuenta» en el chunk de `/login`) · middleware redirige `/cuenta/*` a `/login` y `/backoffice/*` a `/admin`.

**Hallazgo al configurar Render**: `CORS_ORIGIN` estaba en `http://localhost:3000` en producción. La web funcionaba **solo** porque el código viejo aceptaba cualquier `*.vercel.app` — justo el agujero que se cerraba. Desplegar sin corregirlo habría roto la pantalla de confirmación de pedido (el polling del número de pedido es la única llamada del navegador que va directa a Render y sí manda `Origin`). Configuración final:

| Variable | Valor |
| --- | --- |
| `CORS_ORIGIN` | `https://valatino-api-steel.vercel.app,http://localhost:3000` |
| `CORS_VERCEL_PREVIEW_PREFIX` | `valatino-api-steel` |
| `SUPABASE_JWT_SECRET` | **eliminada** (no se usaba) |
| `NODE_ENV` | `development` ← pendiente de cambiar a `production` |

⚠️ **Orden que importa**: `SUPABASE_JWT_SECRET` se borró **después** de desplegar. El código viejo la exigía con `getOrThrow`, así que borrarla antes habría dejado la API sin arrancar.

**Fallo encontrado al verificar**: bloquear un origen ajeno devolvía **500**, porque pasar un `Error` al callback de CORS lo convierte en excepción. Cualquiera podía llenar los logs de errores internos desde fuera. Corregido con `callback(null, false)` en un segundo deploy.

### Módulo Clientes (migración 036)
Nuevo módulo asignable `clientes`, mismo patrón que el resto (`@Modulo` en la API + layout con `puedeVerModulo` + entrada en el sidebar). Endpoints en `/admin/clientes`: listado, ficha, `PATCH` de contacto y `DELETE` (solo admin).

Dos particularidades que resuelve la RPC `listar_clientes`:
1. **`profiles` está casi vacío** (registro por OTP → solo email). El nombre y el documento reales viven en el pedido, y la RPC los toma del más reciente. Sin eso el listado saldría con emails y nada más — comprobado: el único cliente muestra `Yonathan Jiménez Duque` y documento `z4194001w`, que **solo existen en su pedido**.
2. **Clientes sin cuenta** (compraron como invitados): se agrupan por email y se marcan `tiene_cuenta = false`. Se ven y cuentan, pero no admiten edición ni borrado.

La agregación va en SQL a propósito: en Node habría que traerse todos los pedidos y PostgREST corta en 1000 filas en silencio (la deuda ya anotada del dashboard).

Decisiones de alcance (elegidas por Jonathan):
- **Editar**: nombre, teléfono, documento. **El email NO**: es el usuario de acceso (recibe el OTP) y el trigger de vinculación reasignaría pedidos al cambiarlo, pudiendo quitarle o regalarle el historial de otra persona. En la UI aparece deshabilitado con el motivo a la vista.
- **Eliminar**: borra la cuenta de auth; **los pedidos se conservan** (`user_id` es ON DELETE SET NULL y el pedido guarda su snapshot), que es lo que exige la conservación documental de las ventas. Las direcciones guardadas sí caen. Reservado a **admin**. El aviso dice cuántos pedidos se conservan y que **si el cliente vuelve a registrarse con el mismo correo recupera su historial** (el borrado no es un «derecho al olvido» completo).
- **No toca cuentas del staff**: si el id apunta a admin o asesor responde 400 y remite a TI → Usuarios, para que Clientes no sea una puerta trasera al equipo.

Tests: **53** en total (11 nuevos). Sin paginación en el listado a propósito: con los volúmenes actuales sobra y la RPC ya agrega en SQL.

### Sin verificar en vivo
- **Editar y eliminar un cliente con sesión de admin** (no hay credenciales en la sesión de trabajo). La lógica está cubierta por tests; falta abrir la ficha y guardar.
- **`capture-order` de PayPal**: responde 503 porque PayPal no está configurado en Render, así que la comprobación nueva de «esta orden es de tu sesión» no se pudo ejercitar.
- **Las tres pruebas de Jonathan**: login con código (reenviándolo a propósito), guardar dirección en `/cuenta/perfil`, y reenviar el webhook del pedido `260725018055` para confirmar que sigue habiendo un solo pedido.

---

## Sesión 2026-07-25 (cont.) — Dos fallos vistos en una compra real

Jonathan compró en producción con el código **anterior** al de la rama `fix/auditoria-2026-07-25` (que sigue sin desplegar). El backend se portó bien: pedido `260725018055` creado, 1 línea, 1 transacción, email enviado, `stock_reservado` a 0, y el pedido **se vinculó solo** a la cuenta al registrarse (rol `cliente` y `profiles` creados por sus triggers). Los dos fallos eran de la capa cliente.

### 1. Tras verificar el código OTP se quedaba en la pantalla del código
Reconstruido con los logs de Auth y PostgREST (todo en el minuto 14:00):
`:04.7` `POST /verify` **200**, sesión creada · `:05.3–:08.0` `vincular` + `fusionar` contra Render · `:08.3–:08.5` `getUser()` + `obtenerRol` · `:09.4–:09.8` el layout de `/cuenta` renderiza (**el `router.push` sí se ejecutó**) · **20 s de silencio** · `:22.9` `POST /verify` **403 `otp_expired`** ← el usuario, sin ver nada moverse, reenvía el código · `:30–:31` Render por fin responde `/direcciones` y `/pedidos`.

Cuatro cosas encadenadas en `handleVerify`:
- `setIsLoading(false)` se ejecutaba **antes** del trabajo pesado → botón activo y sin indicador durante toda la espera.
- `await Promise.allSettled([vincular, fusionar])` bloqueaba la navegación (el comentario decía «no bloqueante» pero había un `await`). Van contra Render, que en plan free duerme y tarda decenas de segundos en despertar.
- `getUser()` + `obtenerRol()` añadían dos peticiones más antes de poder navegar, **siendo redundantes**: el enrutado por rol ya lo hacen los layouts server-side (el de `/cuenta` manda al staff a `/backoffice/perfil`).
- Y lo que lo volvía irrecuperable: al reenviar el código, el OTP ya estaba consumido → `otp_expired` → `toast.error("Código inválido o expirado")` + `return`, **aunque la sesión ya existía**.

Arreglado: el trabajo posterior al login se lanza sin esperar (es idempotente), se navega con `router.replace` en cuanto hay sesión, se elimina la consulta de rol del camino crítico, se añade la fase `entrando` (botón deshabilitado + aviso «Ya estás dentro. Preparando tu cuenta…») y, si `verifyOtp` falla, **se comprueba si ya hay sesión y se continúa** en vez de dar error.

### 2. Guardar dirección daba error
Es el bug F1 de la auditoría (DTO camelCase vs snake_case), **ya arreglado en la rama pero sin desplegar**. Se confirma en los logs: hay `GET direcciones_envio` (200) pero ningún `POST`, porque la petición muere en el `ValidationPipe` de la API antes de tocar Supabase. En la BD, el usuario tenía 0 direcciones.

### Nota de datos
`envio_ciudad` del pedido llegó como `"españa"`: el ruido de direcciones que ya estaba anotado como pendiente (campos de texto libre sin validar).

---

## Sesión 2026-07-25 — Auditoría completa y correcciones

Revisión de toda la aplicación (API, web, 32 migraciones) y arreglo de lo encontrado. **Todo desplegado y verificado en producción el 2026-07-25** (ver sesión cont. 2); migraciones 033–035 aplicadas y probadas contra el remoto.

### Seguridad
- **Escalada de privilegios (crítica)**: `POST /admin/usuarios/roles` permitía a un asesor con módulo `ti` asignarse rol `admin`, saltándose los controles de `updateRol` (no degradar al último admin, no cambiar tu propio rol), y con `upsert` dejaba roles duplicados. Era código muerto: **eliminado** junto a `AssignRoleDto`.
- **Toma de cuenta admin**: un asesor de TI podía cambiar email/contraseña de un admin y entrar como él. Nuevo `asegurarStaffEditable` en `updateUsuario`/`resetPassword`: sobre una cuenta `admin` solo actúa otro admin (403). En la web se oculta el lápiz de las filas admin a quien no es admin.
- **CORS**: se admitía **cualquier** `*.vercel.app` con `credentials: true` (bastaba desplegar ahí para manipular carrito/checkout de invitados). Ahora solo los orígenes exactos de `CORS_ORIGIN` y, si se define `CORS_VERCEL_PREVIEW_PREFIX`, las previews de este proyecto.
- **Open redirect** en `/auth/callback`: `startsWith("/")` aceptaba `//evil.com`. Saneado en `lib/auth/redirect.ts`, compartido con `AuthForms` (que hacía `router.push` del mismo valor).
- **`POST /pagos/paypal/capture-order`** no tenía guard ni DTO. Ahora valida el formato del `order_id` y **comprueba que el `custom_id` de la orden es de la sesión que llama** (403 si no).
- **Catálogo inactivo público**: `GET /productos?soloActivos=false` exponía borradores a cualquiera. Ahora exige staff.
- **RLS**: la migración 018 dejó sin querer las policies de escritura de `direcciones_envio`, y `direcciones_update_own` no tenía `WITH CHECK` (se podía reasignar `user_id` a otra cuenta con la anon key). **035** las elimina.

### Corrección de datos y dinero
- **Un pago = un pedido (033)**: no había índice único en `pedidos.referencia_pago`. Dos reintentos concurrentes del webhook creaban **dos pedidos** y descontaban stock dos veces; y como `actualizarEstadoPorReferencia`/`findResumenPorReferencia` usan `.maybeSingle()`, un duplicado rompía los reembolsos y la pantalla de confirmación. Añadido índice único + **RPC `confirmar_venta`** que hace pedido + líneas + stock + vaciado de carrito **en una transacción**, idempotente por referencia (lock por referencia; si ya existe devuelve el pedido). Antes eran 6 llamadas sueltas y un fallo a mitad dejaba pedidos sin líneas o `stock_reservado` inflado para siempre (solo se logueaba).
- **Reserva de checkout atómica (034)**: nueva **RPC `reservar_carrito`** (libera previas + comprueba todo el stock + reserva, todo o nada) con advisory lock por sesión. **Desaparece el `Map` en memoria `reservasEnVuelo`** de `CheckoutService`, que dejaba de proteger en cuanto hubiera más de una instancia (Principio V de la constitución). Índice único `(session_id, producto_id)`.
- **Reembolso parcial**: cualquier importe, aunque fuese 1 € de 50 €, marcaba el pedido entero como `REEMBOLSADO` y avisaba al cliente. Ahora solo el reembolso completo cambia el estado; el parcial se registra como `reembolsado_parcial` en `transacciones_pago`.

### Funcionalidad que estaba rota
- **Guardar direcciones desde `/cuenta/perfil` devolvía 400 siempre**: el front enviaba snake_case y los DTO esperaban camelCase, y el `ValidationPipe` global (`whitelist + forbidNonWhitelisted`) lo rechazaba. Los DTO pasan a **snake_case**, alineados con lo que la API devuelve y con `DireccionSnapshotDto` del checkout.
- **`REEMBOLSADO` no existía en la UI**: al cliente se le mostraba el literal en gris y **el admin no podía marcar un reembolso** pese a que el backend lo permitía. La máquina de estados vive ahora en `@valatino/types` (`TRANSICIONES_PEDIDO`, `PEDIDO_ESTADO_LABELS`, `transicionesPermitidas`) y la consumen API y web: se acabó la tabla duplicada de `EstadoSelector`, que ya había divergido.
- **Cambio de estado con éxito falso**: `EstadoSelector` cantaba "Estado actualizado" sin esperar la llamada y la página se tragaba el error, así que un 403 se anunciaba como guardado. Ahora `onEstadoChange` devuelve el resultado real y el aviso depende de él. `/backoffice/pedidos` pasa a server component para resolver el rol y acotar las transiciones ofrecidas (`PedidosPanel`).
- **Categorías**: `Salsas` y `Licores` estaban en los datos desde el seed pero no en `CATEGORIAS_PRODUCTO`, así que esos productos **no se podían editar** (el selector no las ofrecía y `@IsIn` rechazaba el PATCH). Añadidas.
- **`/checkout/confirmacion` sin parámetros** anunciaba "¡Pedido confirmado!". Ya no.

### Limpieza
- **`SUPABASE_JWT_SECRET` era obligatoria y no se usaba**: `JwtModule` la exigía con `getOrThrow` (la API no arrancaba sin ella) pero `JwtService` no se inyectaba en ningún sitio — los tokens se verifican contra el JWKS. Fuera del módulo, de `.env.example` y de `render.yaml`.
- Carrera al crear carrito (dos peticiones concurrentes → 500 por el índice único de `carritos.user_id`): se resuelve reintentando la lectura.
- `ParseUUIDPipe` en las rutas de productos que no lo tenían; mojibake `"direcci�n"` en `DireccionesService`; deduplicada la lógica de "quitar predeterminada".

### Tests (F7) — de 0 a 42
`jest.config.js` + `tsconfig.spec.json` + `tsconfig.build.json` (para que los `.spec` no acaben en `dist`). Cubren la máquina de estados y `updateEstado` por rol, los DTO de dirección (regresión del 400), reembolso parcial vs total, `CheckoutService` contra la nueva RPC, y validación de líneas de compra (4 decimales, IVA 4/10/21).

### Deuda consciente (no tocada)
- **Dashboard**: `getPedidosPagados` no pagina y PostgREST corta en 1000 filas → los KPI se quedarán cortos en silencio pasados ~1000 pedidos/mes; `getTopProductos` mete todos los IDs en un `.in(...)`. Hay que agregar en SQL. No afecta al volumen actual.
- **`listUsers({perPage:200})`** en TI: el flag `bloqueado` deja de calcularse bien pasados 200 usuarios de auth.
- Rol resuelto en BD en **cada** petición autenticada (1–2 consultas); cachear o llevarlo en el JWT.
- Fusión de carrito no transaccional; `numero_pedido` con 4 dígitos aleatorios (colisión ~12% con 50 pedidos/día, se salva con reintentos).
- Marcar dirección como predeterminada **desde `/cuenta/perfil`** sigue sin poderse: el formulario no envía `es_predeterminada` (el backend ya lo soporta).
- La **web sigue sin tests**.

---

## Sesión 2026-07-24 (cont.) — Bloqueo de cuentas y borrado por capas

Acciones destructivas del staff, **solo súper admin**. Commit desplegado. Sin migración (bloqueo vía ban de Supabase; borrado de empleado sobre lo ya existente).

- **Bloquear/desbloquear cuenta (TI)**: `PATCH /admin/usuarios/:id/bloqueo` (`@Roles("admin")`) usa `auth.admin.updateUserById` con `ban_duration` (`876000h` bloquea, `none` desbloquea). No puedes bloquearte a ti mismo; solo cuentas de asesor. `findAll` ahora trae `bloqueado` (de `listUsers().banned_until`). Web: badge "Bloqueada" + botón bloquear/desbloquear (icono `Ban`/`ShieldCheck`), solo admin.
- **Eliminar cuenta (TI)**: `removeAsesor` pasa a `@Roles("admin")` (antes cualquier TI). Al borrar la cuenta, `empleados.user_id` queda a null (la persona sigue en RRHH).
- **Eliminar empleado (GH)**: `DELETE /admin/gestion-humana/empleados/:id` (`@Roles("admin")`). ⚠️ **Bloqueado con 409 si el empleado aún tiene cuenta** → TI debe eliminarla primero (separación por capas, decisión de Jonathan). `GET /admin/gestion-humana/permisos` → `{ esAdmin }` para que la UI muestre el botón. Web: sección "Eliminar empleado" en el detalle (deshabilitada si tiene cuenta, con aviso).
- **Verificado E2E en vivo 15/15**: empleado sin cuenta se elimina; con cuenta → 409; bloquear cuenta → el **login del usuario falla de verdad**; desbloquear → vuelve a entrar; quitar cuenta en TI → luego GH ya puede eliminar la ficha. Datos de prueba limpiados.
- 🧹 **Limpieza**: se eliminó un `auth.users` huérfano previo (`admin@valatino.es`, sin rol ni profile). Quedan solo 2 cuentas reales: **admin** `jonathanduqee+admin@gmail.com` y **asesor** `jhoannamendoza46@valatino.com`.

---

## Sesión 2026-07-24 — Flujo por capas RRHH → TI (Usuarios pasa a ser el módulo TI)

Reorganización para imitar el flujo real de empresa: **Gestión Humana contrata** (persona + cargo, sin cuenta) → **TI provisiona** (correo + contraseña + módulos) y vincula la cuenta. Commits desplegados. Migración **032**.

### Decisiones (confirmadas con Jonathan)
- Empleado **puede existir sin cuenta** (revierte la decisión del 23: ya no es 1:1 obligatorio). `empleados.user_id` **nullable**; FK a `auth.users` pasa a **ON DELETE SET NULL** (borrar la cuenta desvincula, no borra a la persona).
- "Usuarios" deja de ser admin-only suelto → vive dentro del **módulo `ti`** (asignable). Un **asesor de TI** puede gestionar cuentas/contraseñas/módulos, **pero cambiar el ROL (dar/quitar admin) queda solo para admin** (evita escalada de privilegios).
- Al provisionar, el correo de login se propone con el **`correo_empresa`** del empleado (editable).
- **Súper admin**: el rol `admin` ya pasa por encima de todos los módulos → acceso a todo el core. Se conserva `jonathanduqee+admin@gmail.com`.

### Cambios
- **Migración 032** (aplicada): `empleados.user_id` nullable + FK ON DELETE SET NULL; CHECK de `staff_modulos` += `'ti'`.
- **Tipos**: `StaffModulo` += `ti`; `Empleado.user_id` nullable.
- **API**: `UsuariosController` pasa a `@Roles("admin","asesor") + @Modulo("ti")`; `updateRol` con `@Roles("admin")` a nivel de método (override → solo admin). Nuevos endpoints: `GET /admin/usuarios/empleados-pendientes` (empleados sin cuenta) y `POST /admin/usuarios/provisionar` (crea acceso asesor + módulos + vincula al empleado, con rollback si algo falla). GH: `crear` empleado ya **no** exige `userId`; se quitó `cuentas-vinculables`.
- **Web**: `usuarios/` movido a **`/backoffice/ti/usuarios`** (con `ti/layout.tsx` guard de módulo y `ti/page.tsx` que redirige). Sidebar: **TI → Usuarios** (icono `Cpu`); se quitó el enlace admin suelto de Usuarios del shell. GH `nuevo` sin selector de cuenta; GH detalle muestra **estado de cuenta** (Activa / Pendiente de TI). TI/Usuarios: sección **"Empleados pendientes de cuenta"** + `ProvisionarCuentaModal` (correo prefijado, contraseña, módulos).
- **Verificado**: typecheck types+API+web OK · build de producción OK · **E2E en vivo 17/17** (RRHH crea sin cuenta → pendiente → TI provisiona → vinculado y fuera de pendientes → login del nuevo acceso OK → módulos correctos → 409 al re-provisionar → **asesor TI no puede cambiar rol: 403**). Datos de prueba limpiados (0 empleados, 2 cuentas originales).
- ⚠️ Recordatorio local: si al probar dan 404 rutas nuevas de la API, matar la instancia previa en el puerto 4000 antes de relanzar.

---

## Sesión 2026-07-23 — Limpieza de raíz + constitución vinculante + edición de usuarios + responsive + rediseño del panel

**Para reanudar**: todo commiteado y **desplegado** (5 commits, push a `main`). Typecheck + build de producción del web OK. La constitución (`specs/constitution.md`) es ahora la **guía vinculante** del proyecto. Pendiente: revisar en el móvil el rediseño del panel y el responsive en vivo (Jonathan lo valida visualmente).

### ✅ Limpieza de la raíz (retirado Spec-Kit)
- Eliminados por no usarse en la app (no había CI real, `.github/workflows` no existía): `.specify/` (18 archivos de andamiaje), `.github/agents` + `.github/prompts` (20 archivos `speckit.*`), `.vscode/` (incluía un `mcp.json` duplicado del de la raíz + `settings.json` solo de Spec-Kit) y `DEPLOY.md` (su info ya vive en este ESTADO).
- **Conservado**: `.mcp.json` de la raíz (la conexión Supabase que usa Claude Code, verificada), `specs/001-valatino-ecommerce/` (documentación real) y todo lo de `apps/`, `packages/`.
- ⚠️ Secretos locales `Contraseñas.txt` y `.env.vercel` siguen **fuera de git** (gitignored), intactos.

### ✅ Constitución como guía vinculante (v1.1.0)
- La "constitution" de Spec-Kit se **rescató** y movió a **`specs/constitution.md`** (git lo registró como rename, conserva historial). Es la fuente de verdad de principios del proyecto y se debe hacer respetar.
- Actualizada **1.0.0 → 1.1.0** para alinearla con la implementación real:
  - Despliegue backend **Railway → Render** (`valatino.onrender.com`).
  - **Prisma NO es ORM**: `schema.prisma` es solo modelo/referencia; el acceso a datos en runtime es `@supabase/supabase-js` (service_role en la API). Los tipos del dominio viven en `@valatino/types`.
  - Migraciones = **SQL versionado** aplicado por la Management API de Supabase (no `prisma migrate` ni `supabase db push`). Añadidos supabase-js y Sonner al stack oficial.

### ✅ Edición completa de usuarios del staff por el súper admin
- **API** (`apps/api/src/auth/usuarios.controller.ts`, todo `@Roles("admin")`), 3 endpoints nuevos + DTOs:
  - `PATCH /admin/usuarios/:id` → editar **nombre y correo** (sincroniza `auth.users` vía admin API + tabla `profiles`; `email_exists` → 409).
  - `PATCH /admin/usuarios/:id/password` → **restablecer contraseña** directa (se aplica al instante; se comparte al usuario).
  - `PATCH /admin/usuarios/:id/rol` → cambiar **rol admin↔asesor** con salvaguardas: no puedes cambiar tu propio rol, no puedes degradar al **último admin**; al pasar a asesor se fijan sus módulos, admin ve todo (sin filas). Usa **borrar+insertar** en `user_roles` (PK **compuesta** `(user_id, role_id)`) para garantizar un solo rol — ⚠️ el viejo `POST /admin/usuarios/roles` con `upsert` tenía ese riesgo latente; se dejó intacto (sin UI, fuera de alcance).
- **Web**: modal `EditarUsuarioModal` (datos · contraseña · rol+módulos) desde el botón "Editar" de cada fila; el rol propio queda bloqueado. La edición de módulos se unificó en el modal. El admin actual se identifica con el browser client (`getUser`) para bloquear su propio rol/borrado.
- **Verificado E2E en vivo** (login admin real, API local contra BD real): **20/20 checks** — 401 anónimo, crear, editar datos, reset password + re-login con credenciales nuevas, admin↔asesor con módulos, bloqueos (rol propio → 400, rol 'cliente' → 400), borrado + limpieza. BD sin residuos (solo admin + asesora reales). Typecheck types+API+web OK.

### ✅ Responsive del backoffice en móvil
- **Causa**: el layout tenía un sidebar fijo `w-56` **siempre visible**, sin menú móvil → contenido aplastado en el teléfono.
- **Fix**: nuevo `BackofficeShell` (client) — en escritorio sidebar fijo; en móvil se oculta y aparece **barra superior con hamburguesa** que abre un **drawer** con backdrop (se cierra al navegar). `min-w-0` en la columna principal para que las tablas scrolleen.
- `PedidoTabla` y `ProductoTabla`: `overflow-hidden` → `overflow-x-auto` (antes **recortaban** columnas en pantallas estrechas). Inventario/Compras/Usuarios ya tenían scroll.

### ✅ Rediseño del panel — sidebar oscuro + canvas premium (petición: "se veía muerto/antiguo")
- Dirección elegida por Jonathan: **sidebar oscuro + contenido claro pulido** (tipo Linear/Vercel), a juego con el login `/admin` y sin perder el toque premium.
- **Sidebar** zinc-950 con texto claro y **acento naranja de marca** en el módulo activo (barrita lateral); enlaces, subitems, perfil y logout adaptados a fondo oscuro.
- Scope **`.theme-admin`** (en `globals.css`): lienzo gris muy suave (`--background`) para dar profundidad a las tarjetas blancas — se aplica a **todo el back-office vía el shell**, sin tocar página por página.
- **Sombra sutil** en todas las `.bg-card` con `:where()` (especificidad baja → respeta `shadow-lg` de los modales). Drawer móvil oscuro con backdrop desenfocado. **Micro-animación fade-in** por página al navegar.
- El login `/admin` (ruta aparte) conserva su propio look oscuro premium; sin conflicto.
- Verificado: typecheck web OK + **build de producción OK** (todas las rutas compilan). Validación visual en dispositivo pendiente de Jonathan.

### ✅ Iconos Lucide + cabeceras de página premium (continuación del rediseño)
- **Iconos**: reemplazados todos los emoji del back-office por **Lucide** (el set que acompaña a Shadcn/UI, ya instalado). Mapa centralizado en **`apps/web/lib/backoffice/iconos.tsx`** (`MODULO_LABELS` sin emoji, `MODULO_ICONOS` por módulo, `NAV_ICONOS` por clave serializable — el layout es server component y no puede pasar componentes como props, por eso `SidebarNav` recibe `iconKey` string y resuelve el icono).
  - Sidebar: Dashboard=`LayoutDashboard`, Pedidos=`ShoppingCart`, Catálogo=`Store`, Inventario=`Boxes`, Compras=`ShoppingBag`, Proveedores=`Truck`, Usuarios=`Users`, Mi perfil=`UserCircle`; hamburguesa=`Menu`.
  - **Acciones Editar/Eliminar → botones-icono** (`Pencil` / `Trash2`, con `title` + `aria-label`) en usuarios, catálogo (`ProductoTabla`) y proveedores. Chips y checkboxes de módulos con su icono.
- **Cabeceras**: nuevo componente **`PageHeader`** (icono en chip con acento naranja de marca + título + descripción + enlace "volver" opcional + slot de acciones a la derecha). Aplicado a las **10 páginas** del back-office, unificando el patrón (antes cada una repetía `<h1>` a secas). Los "← Compras" pasan a `back` con `ChevronLeft`; "Ver factura" con icono `FileText`.
- Verificado: typecheck web OK + **build de producción OK**. Cero emoji en el back-office.
- Pendiente opcional anotado: dar un toque a los **StatTiles del dashboard** (icono + acento) para rematar la portada del panel.

### 🔒 Nota de seguridad (consultada por Jonathan, sin cambios de código)
- "Sigo logueado como admin al reabrir la web" es **comportamiento normal** (persistencia de sesión por navegador/dispositivo), **no** un agujero remoto: un cliente desde su propio dispositivo nunca ve tu sesión. El acceso al panel está gateado **por rol y en el servidor** (middleware + layout que redirige a no-staff + guards `@Roles` de la API + rol leído de `user_roles`, nunca de metadata). Único riesgo real: **dispositivo compartido** sin cerrar sesión → mitigación: usar "Cerrar sesión". Jonathan decidió **dejarlo como está** (opciones ofrecidas: auto-logout por inactividad / ajustar duración de sesión).

### ✅ Módulo de Gestión Humana (RRHH) — empleados, cargos e histórico mensual

Nuevo módulo del backoffice `gestion_humana` (asignable a asesores; admin siempre). Commit `35883a7`, desplegado.

- **Migración 030** (aplicada por Management API vía tool MCP `apply_migration`, verificada):
  - **`cargos`**: los "roles" de RRHH con **identificador único** (`codigo`). Semilla de 6: `GER` Gerente General · `DIRCOM` Director Comercial · `DIROP` Director de Operaciones · `DIRADM` Director Administrativo y Financiero · `COORTH` Coordinador de Talento Humano · `ASECOM` Asesor Comercial.
  - **`empleados`**: `user_id` NOT NULL UNIQUE → `auth.users` ON DELETE CASCADE (**cada empleado se vincula 1:1 a una cuenta de acceso**), documento (unique), teléfono, `correo_personal`, `correo_empresa` (unique), `cargo_id` FK, `tipo_contratacion` (CHECK, contexto España: Indefinido/Temporal/Prácticas/Formación en alternancia/Fijo discontinuo/Autónomo·Mercantil), `fecha_vinculacion`, `fecha_desvinculacion`, `salario` (opcional), `activo`, notas.
  - **`empleado_historial_mensual`**: snapshot por `(empleado_id, anio, mes)` **unique** → historia mes a mes (nombre, cargo, contrato, correo, salario, estado, fecha vinculación). RPC **`generar_historial_gh(anio, mes)`** idempotente (upsert; solo empleados ya vinculados a fecha del mes). EXECUTE revocado de anon/authenticated.
  - RLS activa **sin policies** en las 3 tablas (solo service_role). CHECK de `staff_modulos` ampliado con `'gestion_humana'`.
- **Tipos** (`@valatino/types`): `StaffModulo` += `gestion_humana`; `TIPOS_CONTRATACION`, `Cargo`, `Empleado`, `EmpleadoHistorialMensual`, `CuentaVinculable`.
- **API** (`apps/api/src/gestion-humana/`, `@Roles("admin","asesor")` + `@Modulo("gestion_humana")`): `GET cargos`, `GET cuentas-vinculables` (staff sin empleado), `GET/POST empleados`, `GET empleados/:id` (detalle + histórico), `PATCH empleados/:id`, `POST historial/generar`, `GET historial?anio=&mes=`. 409 en documento/correo_empresa/cuenta duplicados; 400 en cargo/cuenta inválidos.
- **Web** (`/backoffice/gestion-humana`): lista + generador de histórico mensual (selector mes/año), alta (`nuevo` — vincula cuenta + datos), detalle (`[id]` — edición + histórico del empleado). Sidebar e icono `Briefcase` integrados; `PageHeader` en las 3 páginas.
- **Verificado**: typecheck types+API+web OK · **build de producción OK** · **E2E en vivo (login admin real) 19/19** (alta, validaciones, edición de cargo/salario, generar histórico enero+julio idempotente, lectura de snapshots, 401 anónimo). Datos de prueba limpiados (0 empleados, 6 cargos).
- ⚠️ **Decisión con impacto**: empleados vinculados a cuenta de login → sin cuenta previa (en `/backoffice/usuarios`) no se puede crear el empleado. Hoy 2 cuentas → máx. 2 empleados. Alternativa futura si se quiere: permitir empleados sin cuenta (hacer `user_id` opcional) o crear la cuenta desde el alta del empleado.
- **Migración 031 — código de empleado estable** (aplicada): `empleados.numero_empleado` (BD `identity`) + `codigo_empleado` (columna **generada**: `EMP-0001`, único e inmutable, independiente del cargo). Decisión de modelado con Jonathan: el `codigo` del cargo identifica el puesto (lo comparten varios); el `codigo_empleado` identifica a la persona y **no cambia** aunque ascienda → correcto para el histórico y futuros modelos de datos. El snapshot histórico guarda también `codigo_empleado`. La web muestra el `EMP-0001` en la lista (badge) y en la cabecera del detalle. Verificado: typecheck+build OK (el patrón columna-generada-desde-identity se probó antes de aplicar).
- ⚠️ Incidencia de la sesión (resuelta): al probar E2E, un proceso viejo de la API seguía en el puerto 4000 sirviendo código antiguo (`EADDRINUSE`) → daba 404 en las rutas nuevas. Se mató el PID del 4000 y se relanzó. Recordatorio: si las rutas nuevas dan 404 en local, comprobar que no haya una instancia previa de la API ocupando el 4000.

---

## Sesión 2026-07-22 — Arreglo del checkout en producción (carrito, webhook Stripe, email) + diagnóstico de rendimiento

**Contexto**: primera prueba real del checkout en línea. Salieron 3 fallos encadenados; los 3 arreglados y desplegados. Tokens de Render/Vercel reutilizados (Jonathan no los regeneró, seguimos en test).

### ✅ Carrito no funcionaba en línea (cookie cross-domain) — arreglado
- **Causa**: web (Vercel) y API (Render) en dominios distintos → la cookie de sesión del carrito es *cross-site*. Salía con `SameSite=Lax`, que el navegador NO envía en fetch/XHR cross-site → cada petición abría sesión nueva → carrito siempre vacío. En `localhost` no se veía (mismo host).
- **Fix 1** (`carrito/session.middleware.ts`): sobre HTTPS la cookie se emite `SameSite=None; Secure` (detectado por `X-Forwarded-Proto`, NO por `NODE_ENV` — la instancia de Render no tenía NODE_ENV=production fiable). En local (http) sigue `lax`.
- **Fix 2 — proxy same-origin** (imprescindible para **iPhone/Safari**, que bloquea cookies de terceros): `next.config.mjs` reescribe `/api/*` → API de Render; `lib/api/client.ts` (`apiFetch`) llama a `/api` (mismo origen de la web) → la cookie pasa a ser de **primera parte**. Los server components y el polling público siguen usando la URL absoluta (no dependen de la cookie). Verificado E2E local: el proxy relaya `Set-Cookie` y el carrito persiste.

### ✅ "Se queda generando el número de pedido" + no llega email — causa raíz doble
- **Faltaba el webhook de Stripe**: el pedido (y el vaciado del carrito y el email) solo se crean cuando llega `payment_intent.succeeded` a `/pagos/stripe/webhook`. En producción **no había ningún webhook configurado en Stripe** → el pago se cobraba pero el pedido nunca se creaba. Hasta ahora los pedidos solo se creaban en local con `stripe listen`.
  - **Fix**: webhook creado por API de Stripe (`we_1Tw2mHL...`) → `https://valatino.onrender.com/pagos/stripe/webhook`, eventos `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`, `charge.refunded`. Su signing secret puesto en Render como `STRIPE_WEBHOOK_SECRET` (el viejo era el de `stripe listen` local, no valía). Pedidos atascados recuperados con `stripe events resend <evt> --api-key <key> --webhook-endpoint <we_id>` (idempotencia OK: el reenvío duplicado se ignora con "ya procesado").
- **Email del pedido no salía — Render estrangula la salida SMTP por 465/587**: `email_cliente`, plantilla y credenciales estaban bien; el envío se colgaba. Diagnóstico (endpoint temporal, ya eliminado): desde Render, `verify()` conecta por 465/587/2525, pero `sendMail()` **se cuelga en 465 y 587** (Connection timeout ~90s) y **entrega por el 2525** (`250 queued`, ~200 ms). El 2525 es el puerto alternativo de SendGrid justo para redes que estrangulan.
  - **Fix**: `SMTP_PORT=2525` en Render (EmailService usa `secure: port===465` → 2525 = STARTTLS). Además timeouts en `EmailService` (`connectionTimeout`/`greetingTimeout`/`socketTimeout`) para que un envío colgado falle rápido y no bloquee el webhook ~2 min (eso causaba reintentos de Stripe → el warning "ya procesado").
  - Nota de entrega: se envía desde `jonathanduqee@gmail.com` vía SendGrid → Gmail puede marcar spam a veces (falla DMARC de gmail.com). El OTP y emails simples llegan; al tener dominio propio, autenticarlo en SendGrid deja la entrega impecable.

### ✅ Carrito seguía mostrando el ítem tras pagar + "Iniciar sesión" a usuario ya logueado — arreglados
- **Carrito obsoleto en el cliente**: el servidor SÍ vacía el carrito al crear el pedido; el `CarritoProvider` no se remonta al volver de Stripe y mostraba el ítem comprado. Fix: `confirmacion/page.tsx` llama a `reload()` del carrito al confirmarse el pedido.
- **Flujo de sesión**: la confirmación ofrecía "Iniciar sesión" aunque el cliente ya tuviera sesión. Fix: comprueba la sesión (Supabase browser client); logueado → botón "Ver mis pedidos" (`/cuenta/pedidos`); invitado → bloque de login. Se comprueba antes de renderizar (sin parpadeo).

### 📊 Diagnóstico de rendimiento (revisión sin cambios, petición de Jonathan)
- **La estructura es adecuada y escalable** (Next/Vercel + NestJS + Supabase). La lentitud es de *configuración de despliegue*, no de diseño.
- **Causa nº1**: Render **plan free se duerme** (~15 min) → 1ª carga 30-60s. Un plan de pago lo elimina.
- **Causa nº2 (no la arregla pagar)**: **desajuste de regiones** — Render en `oregon` (EE.UU.), Supabase en `eu-west-1` (Irlanda), clientes en España → cada consulta a BD cruza el Atlántico (~150 ms). La web ya cachea catálogo/fichas (`revalidate: 60`), así que esto se paga sobre todo en carrito/checkout/backoffice.
- **Plan de producción recomendado (orden de impacto)**: 1) **API en EU (Frankfurt) + plan de pago Render** — ⚠️ Render no cambia la región de un servicio existente, hay que **recrearlo** en Frankfurt (mismo repo/blueprint, reconfigurar variables); 2) Supabase de pago cuando haya tráfico real; 3) Vercel Hobby basta por rendimiento (Pro es más por términos comerciales). El proxy del carrito añade un saltito de latencia, trivial cuando todo esté en EU.

### ✅ Perfil de cliente enriquecido + UX de cuenta
- `/cuenta/perfil` (solo email + direcciones antes) ahora tiene: **saludo con nombre** (de la dirección predeterminada o, si no hay, del `envio_nombre` del último pedido; si nada, "Hola 👋"), **resumen** (tarjetas Nº pedidos / Total gastado [estados pagados] / En curso), **último pedido** destacado y **accesos rápidos** (Seguir comprando · Mis pedidos · Contacto valatino@hotmail.com). Misma estética gris de cliente; datos ya existentes, sin cambios de backend.
- Si el cliente no tiene dirección guardada, la sección Direcciones muestra la del **último pedido** (snapshot `envio_*`) con botón **"Guardar en mis direcciones"** (POST /direcciones). El cliente confirma (la dirección de un pedido puede ser puntual).
- **Nav superior de /cuenta eliminado** (estaba duplicado con los accesos rápidos); en "Mis pedidos" se añadió **"← Volver a mi perfil"**.
- **Login del cliente aterriza en `/cuenta/perfil`** por defecto (antes /cuenta/pedidos); redirects explícitos (checkout, "ver mis pedidos") intactos.
- Toasts (Sonner) movidos a **abajo-derecha**, más pequeños y 2,5s (tapaban navbar/parte superior en móvil).

### ✅ Limpieza de BD a "arranque real" (2026-07-22, confirmada por Jonathan)
- Borrado vía REST service_role + GoTrue admin API: **7 pedidos** (+líneas +transacciones), **29 carritos** (+ítems), checkout_datos, reservas y direcciones guardadas → **todo a 0**. Eliminadas las **3 cuentas de cliente** de prueba (jonathanduqee@gmail.com, jonathanduqee@hotmail.com, jhoannamendoza46@gmail.com): auth + profiles + user_roles.
- **Conservado**: 13 productos, primera factura (202521188), y usuarios **admin** (jonathanduqee+admin@gmail.com) y **asesor** (jhoannamendoza46@valatino.com).
- **Inventario restaurado** a las cantidades de la primera factura (`stock_disponible` = cantidad de `factura_compra_items`, `reservado=0`): Bon Bon Bum 48 · Festival Chocolate 12 · Festival Limón 12 · Ducales Noe 2 · Queso Mantequilla 2 · Saltín Noel 3 · Milo 400G 2 · Nucita 36 · Pony Malta 24 · Sparkies 20 · Tostados la Gitana 3 · (Festival Fresa/Vainilla 0). Verificado end-to-end.

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