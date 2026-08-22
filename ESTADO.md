# Estado del proyecto Valatino — Sesión de trabajo

**Última actualización**: 2026-08-22

---

## ▶️ Para reanudar (leer primero)

**El proyecto está DESPLEGADO y funcionando en local y en línea** (con claves de test).

### ⭐ LA TIENDA YA VIVE EN SU DOMINIO: `valatino.es` (2026-08-05)

**El dominio propio está en pie y verificado de punta a punta.** Ver «Sesión 2026-08-05» más abajo para el porqué del diseño y las ocho trampas que salieron.

| Host | Verificado |
|---|---|
| **https://valatino.es** | 200 · home con los 13 productos · ficha de producto, checkout y login a 200 |
| **https://www.valatino.es** | 308 al apex |
| **https://api.valatino.es** | `/health` 200 con certificado válido · dominio `verified` en Render |
| CORS | `valatino.es` y `www.valatino.es` permitidos; el `.vercel.app` viejo **también**, a propósito; origen ajeno denegado |
| `NEXT_PUBLIC_API_URL` | `https://api.valatino.es`, **comprobado dentro del bundle** (2 chunks con el dominio nuevo, 0 con `onrender.com`) |
| Cookie de sesión | emitida con `secure` + `httpOnly`, y ahora **same-site** |

✅ **Supabase hecho y probado en pantalla** (`site_url` = `https://valatino.es`; `uri_allow_list` con `https://valatino.es/**` y la variante sin comodín, conservando localhost y el `.vercel.app`). **Login por código verificado en los logs de Auth**: `POST /otp` 200 → `POST /verify` 200 con `login_method: otp` → `/user` 200 y `jwks.json` 200 (la API aceptó el JWT). Sin rechazo del `redirect_to`, sin 429, sin el 502 de plantillas. ⚠️ **El MCP de Supabase NO expone la config de Auth** — se hizo por Dashboard; la Management API necesita un token `sbp_`, y **`sb_publishable_…` / `sb_secret_…` NO sirven** para eso (401): son claves del proyecto, no de la plataforma.

✅ **Stripe hecho**: el webhook ya apunta a `https://api.valatino.es/pagos/stripe/webhook`, `enabled`, con sus **5 eventos** intactos.

⚠️⚠️ **Y la lección de cómo se hizo, que es lo que hay que recordar: se EDITÓ la URL del endpoint que ya existía (`we_1Tw2mHL1kwgv5hCuBoKht7CL`), NO se creó uno nuevo.** El signing secret pertenece al endpoint y **no cambia al cambiarle la URL**, así que no hubo que tocar `STRIPE_WEBHOOK_SECRET` ni redesplegar, y no hubo ninguna ventana ciega. Crear uno nuevo trae **su propio secret**, y como `stripe.service.ts` valida con **uno solo** (`config.getOrThrow("STRIPE_WEBHOOK_SECRET")`), habría que haber hecho el cambio en Render + redeploy, con los eventos del endpoint viejo fallando la firma mientras tanto — y un `payment_intent.succeeded` que falla es un pedido que no se crea hasta el reintento.

✅ **Compra de prueba verificada en el dominio nuevo**: pedido `260805010148` (1,00 €, `card`), y su línea de tiempo entera en 2,5 s — `estado → PROCESANDO`, `pago · payment_intent.succeeded`, `email · Confirmación de tu pedido`. El webhook entrega en `api.valatino.es`.

✅ **SendGrid hecho**: dominio `valatino.es` autenticado (id **32239900**, subdominio `em6156`), los 3 CNAME **`valid=True`** —`mail_cname`, `dkim1`, `dkim2`— y `EMAIL_FROM` = `Valatino <pedidos@valatino.es>`.

⚠️ **El From del dominio necesitó un `Reply-To`, y el motivo hay que recordarlo**: `valatino.es` **no tiene registros MX**, así que `pedidos@valatino.es` **no recibe nada** — quien respondiera a la confirmación de su pedido se llevaba un rebote, y antes esa respuesta llegaba a un buzón real. Se añadió `EMAIL_REPLY_TO` (ver `email.service.ts`): el correo sale autenticado y la respuesta llega a alguien. **Se quita cuando el dominio tenga buzón propio.** Autenticar el dominio sin resolver esto habría mejorado la entrega empeorando la atención al cliente.

⚠️ **Lo que este cambio NO cubre: el correo del código de acceso.** Ese lo manda **Supabase Auth** con su propia configuración SMTP y su propio remitente (Dashboard → Project Settings → Auth → SMTP Settings). Ahora mismo hay **dos remitentes distintos**: los de pedidos desde `pedidos@valatino.es` y el del login desde lo que haya ahí. Ya se puede poner una dirección de `valatino.es` sin riesgo, porque el dominio firma DKIM.

⚠️ **Dato que corrige un susto**: `_dmarc.gmail.com` es `p=none; sp=quarantine`, así que el remitente anterior (`jonathanduqee@gmail.com`) **no estaba siendo cuarentenado** por política — fallaba la alineación y puntuaba mal, pero no era la sangría que parecía. La urgencia era menor de lo que se dijo al principio.

**Lo que falta para cerrar el paso a producción:**
1. **Correo: ✅ resuelto y comprobado por Jonathan** — llega a la **bandeja de entrada**, con `From: Valatino <pedidos@valatino.es>` y `Reply-To: jonathanduqee@gmail.com`. Quedan dos mejoras **opcionales**, no bloqueantes (ver la sesión de abajo):
   - **TXT `@`** = `v=spf1 include:sendgrid.net ~all` — el dominio del remitente no declara SPF; el subdominio de envío sí. El DMARC ya pasa por DKIM, pero varios filtros miran esto.
   - **MX** — `valatino.es` sigue sin poder **recibir** correo. Resolverlo (reenvío de GoDaddy, Zoho o Workspace) permite **quitar `EMAIL_REPLY_TO`** y deja de ser una señal de spam.
   - **Remitente del correo de acceso**: sigue saliendo por **Supabase Auth** con su propio remitente, que no es del dominio → por eso el cliente marca ese correo como «no comprobado». Se cambia en Supabase → Project Settings → Auth → SMTP Settings.
2. **Quitar `https://valatino-api-steel.vercel.app` de `CORS_ORIGIN`** (y de la lista de Supabase) cuando todo esté rodado. **Comprobado el 2026-08-12 contra producción** qué hay hoy: se admiten `https://valatino.es`, `https://www.valatino.es`, `https://valatino-api-steel.vercel.app` y `http://localhost:3000`; las previews de Vercel **no** (`CORS_VERCEL_PREVIEW_PREFIX` sin poner) y un origen ajeno se deniega. El valor a dejar es `https://valatino.es,https://www.valatino.es,http://localhost:3000`. ⚠️ Es del **dashboard de Render** (`sync: false`), y **cambiarlo por API no basta**: hay que forzar un deploy o guardarlo en el panel. Y la misma lista alimenta el middleware anti-CSRF, así que quitar el origen le corta también las escrituras — que es justo lo que se quiere.
2. **Revocar los CINCO secretos y borrar `C:\YJIMENEZ\tokens-despliegue.env.txt`**: Vercel (`vcp_`), Render (`rnd_`), SendGrid (`SG.`, que es de **acceso total**, 210 permisos) y las dos de Supabase. ⚠️ La `sb_secret_…` es la que más prisa tiene: **salta el RLS** y puede leer y escribir toda la base de datos.
3. Cuando se pase a **Stripe `live`**: los webhooks son **por modo**, así que hay que crear el de producción desde cero con los 5 eventos y su secret nuevo en Render. Y si algún día se activa Apple Pay, Stripe exige **registrar el dominio**.

⚠️⚠️ **LA REGLA DE ORDEN, que es donde esto se podía romper**: `NEXT_PUBLIC_API_URL` se cambia **solo cuando `https://api.valatino.es/health` ya responde 200 con certificado válido**. Cambiarlo antes deja la tienda viva llamando a un host que no resuelve — carrito y checkout caídos. Es el mismo problema de ventana de despliegue del 2026-07-27, agravado porque Vercel **congela el valor en el build**: no basta con guardar la variable, hay que redesplegar. Y para comprobar que surtió efecto **no sirve mirar el HTML**: hay que buscar el dominio en los chunks de `/_next/static/`.

### 🔜 Al volver, empezar por aquí — cierre del 2026-08-22

✅✅ **EL COSTE DE ENVÍO ESTÁ VIVO EN PRODUCCIÓN Y COBRANDO** (2026-08-22). Migración aplicada, código desplegado, y **Jonathan ya puso la tarifa desde el panel a las 01:44: 3,40 € de envío, gratis desde 50 €**. Comprobado contra la tienda real:

| Carrito | Envío | Total | |
|---|---|---|---|
| 40,00 € | 3,40 € | 43,40 € | «faltan 10,00 para el envío gratis» |
| **50,00 € (justo en el umbral)** | **0,00** | 50,00 € | envío gratis |
| 60,00 € | 0,00 | 60,00 € | envío gratis |

Y la RPC en los bordes: 49,99 → 3,40 · **50,00 → 0,00** · 50,01 → 0,00.

⚠️ **Ya NO hay nada inerte: a partir de ahora cada pedido paga su porte.** El primer pedido real con envío será el primero que pruebe la cadena fiscal completa con porte. *(Ese formato cambió el mismo día: ver la 082 — el porte va ahora en UNA sola línea.)* Merece la pena mirar esa primera factura en pantalla.

**861 tests** (480 API + 381 web), `type-check` 3/3 y los dos builds en verde. Todo commiteado.

⚠️ **Los dos builds y los dos `type-check` siguen yendo en verde SECUENCIALMENTE.** Corriendo `turbo build type-check` en la misma invocación el `type-check` de la web falla a veces. Sigue **sin diagnosticar, solo observado** (encaja con que `next build` regenere `.next/types/**` mientras `tsc` los lee). Si sale rojo en CI, mirar aquí antes de buscar un error de tipos real.

⭐⭐ **HOY: EL COSTE DE ENVÍO, que era la avería 🔴🔴 de la lista del 15/08.** Y con el 20/08 sin registrar: el OG de WhatsApp.

**Estado del remoto, comprobado al cerrar** (no de memoria):

| | |
|---|---|
| Pedidos | **2** (`260815017972` y `260817017037`, los dos REEMBOLSADO) |
| Facturas | **7** · 12 eventos (7 `emitida` + 5 `enviada`) · **0 anomalías** |
| Cadena de huellas | **íntegra en los 7 enlaces** (comprobado enlace a enlace, no de memoria) |
| Productos | 30 (29 activos) |
| Arranque fiscal | **sin marcar** — la ventana para rehacer cosas sigue abierta |
| API | `/health` 200 |

⚠️ **Y OTRA VEZ LA MISMA LECCIÓN, que ya va la tercera: la BD tenía MÁS de lo que decía este fichero.** El cierre del 17/08 se commiteó a las 23:16 y decía «1 pedido, 4 facturas, 8 eventos». La verdad eran **2, 7 y 12**: Jonathan hizo otra compra de prueba a las 23:21, cinco minutos DESPUÉS del commit. Cuadra sola (venta `VALS202600101` de 3,20 € → dos rectificativas de −1,20 y −2,00; base −2,68 y cuota −0,52, que es exactamente lo que declaró la venta), pero **preguntarle a la BD antes de creerse el markdown** sigue siendo la regla.

#### ⭐⭐ La primera venta real con envío YA SE HIZO, y salió perfecta

Jonathan la hizo él mismo la madrugada del 22/08, después de poner la tarifa. Limpió los pedidos de prueba viejos, compró, devolvió una parte y luego el resto. Comprobado contra el remoto:

| | |
|---|---|
| Pedido `260822018018` | artículos **16,20** + envío **3,40** = **19,60** · cuadra |
| Factura `VALS202600100` | 7 líneas, con **DOS de envío: 2,20 al 10 % y 1,20 al 21 %** (suman 3,40 exacto) — ⚠️ **formato anterior a la 082**, y así se queda: una factura emitida no se reformatea |
| `VALF202600100` | el canje a completa, mismo contenido |
| `VALR202600100` (parcial, 1,70 €) | **SIN** línea de envío — correcto: en una devolución parcial el porte no se devuelve |
| `VALR202600101` (cierre, 17,90 €) | **CON** las dos líneas de envío en negativo (mismo formato viejo) |
| Vuelta a cero | 10 %: 11,55/1,15 → **0,00/0,00** · 21 %: 5,70/1,20 → **0,00/0,00** |
| Anomalías | **0** |

⭐ O sea que la 080 funciona con dinero real y en la secuencia difícil (parcial primero, cierre después), que es justo donde el porte podía contarse de más o de menos. Ya no queda nada del envío pendiente de ver en pantalla.

⚠️ **Y otra vez la lección, esta vez contra mi propia medición**: a las 01:00 medí «2 pedidos de 3,72 y 3,20» y lo di por el estado actual. A las 11:45 la base decía «1 pedido de 19,60». No me había equivocado: **la tienda siguió viva mientras yo no miraba.** Una medición tiene fecha, y a las diez horas es historia.

#### Lo primero al volver: decidir el ámbito de envío, que ahora está contradicho

Los términos reescritos hoy dicen **«enviamos a España peninsular y Baleares»**, y el checkout sigue aceptando **las 52 provincias**. Hay que alinearlo, y la decisión es de negocio:

- **Restringir los CP en el checkout** para que coincida con lo prometido. Horas de trabajo, y de paso **desactiva el riesgo del IVA de Canarias/Ceuta/Melilla** sin implementar nada (punto 3 de la cola).
- **O abrir de verdad a las islas**, y entonces hay que resolver antes el IGIC/IPSI, que es días de trabajo y consulta con la gestoría.

Mientras no se haga una de las dos, la promesa de los términos protege a la tienda pero no impide la venta problemática.

⚠️ Y con la tarifa puesta, el reparto del porte entra en `pedido_iva` de cada venta nueva. La ventana del arranque fiscal sigue abierta, así que si algo del reparto no gustara, todavía se puede rehacer.

#### ⭐⭐ Cómo se aplicó, y la técnica que hay que recordar

⚠️⚠️ **`supabase db push` NO SE PUEDE USAR EN ESTE PROYECTO, y conviene no descubrirlo a la mala.** El historial del remoto está desincronizado con los nombres de los ficheros locales: el CLI lee unas pocas entradas (`001`, `002`, `003` y varias con marca de tiempo) y da las locales `004`–`080` por «no aplicadas». Un `push` reaplicaría de la 004 en adelante, y varias de esas **no son idempotentes** (`cron.schedule` duplicaría tareas, y hay inserts). Comprobado con `supabase migration list`.

⚠️ **Y tampoco se pudo usar el ensayo revertido de `scripts/aplicar-sql.mjs`**: la contraseña de la base **no se puede consultar en Supabase** —solo restablecer, en Project Settings → Database— y no estaba a mano. Dato útil para la próxima: **restablecerla no rompe nada en este proyecto**, comprobado uno a uno (0 referencias a `DATABASE_URL` en `render.yaml`, 0 usos de `PrismaClient` en tiempo de ejecución —el `schema.prisma` solo genera tipos—, 0 en el CI y 0 en `apps/api/.env`). La API habla con Supabase por su API REST con la `service_role`, no por Postgres.

Así que se aplicó con `apply_migration` del MCP de Supabase, que obliga a reescribir el SQL por el canal en vez de leer el fichero.

⭐⭐ **Y eso tenía un riesgo real —una errata de copia en 66 KB de SQL fiscal es invisible— que se cerró con una comprobación que merece la pena recordar porque sirve siempre:**

```sql
select md5(prosrc) from pg_proc
where proname = 'X' and pronamespace = 'public'::regnamespace;
```

**Postgres guarda el cuerpo de cada función LITERALMENTE en `prosrc`**: no lo reformatea, no lo normaliza. Así que el md5 del texto entre los delimitadores `$$` del fichero y el md5 de `prosrc` **tienen que coincidir byte a byte**. Se validó primero contra una función ya desplegada (`emitir_rectificativa` de la 078, md5 `a93f392e…` en las dos partes) y luego se usó de verdad.

⚠️ **Ojo con `length(prosrc)`: cuenta CARACTERES, no bytes.** Con `ñ`, acentos y emojis en los comentarios da un número distinto del tamaño en bytes del fichero, y parece un descuadre cuando no lo hay. El md5 es lo que vale.

**Resultado: 9/9 funciones idénticas byte a byte, y una sola sobrecarga de cada una** (o sea que no quedó ninguna firma vieja colgando, que es el otro fallo clásico de reemplazar funciones con `default`s).

| Comprobado | Resultado |
|---|---|
| `md5(prosrc)` de las 9 funciones vs. el fichero | **9/9 idéntico** · 1 sobrecarga cada una |
| Columnas nuevas (6) y CHECK nuevos (3) | todas en su sitio, con sus tipos y defaults |
| Los 2 pedidos que ya existían | `coste_envio = 0` y su desglose cuadrando con su total |
| Facturas / cadena / anomalías | 7 · intacta · **0** |
| Tarifa tras aplicar | **0,00 sin umbral** — o sea inerte, la tienda no cambió |

#### ⭐⭐ El ensayo de punta a punta: 24/24, con los números reales

`scripts/ensayo-080-envio.sql`, corrido en **transacción revertida** contra el remoto. Carrito MIXTO (10 % + 21 %), que es el caso que importa:

| Bloque | Qué salió |
|---|---|
| **A · tarifa** | 6/6 en los bordes: 9,00 → 4,95 · **39,99 → 4,95** · **40,00 → 0** · 55,00 → 0 · 0 → 0 · null → 0 |
| **B · venta** | artículos **2,20** + envío **4,95** = total **7,15**, y el desglose suma 7,15 |
| **B · reparto** | 1,00 al 10 % → **2,25** · 1,20 al 21 % → **2,70** · suma **4,95 exacta** |
| **C · factura** | `VALS202600102`, base 6,17 + cuota 0,98 = **7,15** = lo cobrado |
| **C · líneas** | **4 líneas: 2 artículos + DOS de envío, una por tipo**, y las cuatro declarando su `iva_pct` — ⚠️ **con la 082 salen 3**, y la del envío con `iva_pct` NULL. Quien reejecute el ensayo y compare con esta fila verá una diferencia que **no es una avería** |
| **D · porte** | marcado como devuelto en `re_ensayo_080` |
| **D · vuelta a cero** | 10 %: declarado 2,95/0,30 · rectificado −2,95/−0,30 → **0,00/0,00** · 21 %: 3,22/0,68 · −3,22/−0,68 → **0,00/0,00** |
| **D · rectificativa** | `VALR202600104` con 4 líneas en negativo, **las dos del envío incluidas** — con la 082 son 3, con una sola de envío |
| **D · eventos** | solo `emitida`. Ninguna anomalía |

⭐ Que la **vuelta a cero sea exacta en los dos tipos** es la prueba de que §6 funciona: es justo el agujero que avisó la 078 («dinero declarado que no se puede devolver»), y se cierra sin haber tocado `reembolso_lineas`.

⚠️ **Y el ensayo necesitó un truco que sin él daba un FALSO NEGATIVO**: la factura y la rectificativa las emiten **triggers de constraint DIFERIDOS**, que corren al commit — y en una transacción revertida el commit no llega nunca. Sin `set constraints all immediate` los bloques C y D salen VACÍOS y se lee como «no se emite la factura», que es lo contrario de la verdad. Está escrito en el fichero del ensayo.

**Rollback comprobado después**: 2 pedidos, 7 facturas, contadores en `VALS→102 VALR→104 VALF→101` (sin consumir), tarifa otra vez en 0, ni un carrito ni un `checkout_datos` de prueba. El ensayo no dejó nada.

#### ⚠️⚠️ Un patrón que salió DOS VECES en esta sesión, y merece la pena fijarlo

**Una comprobación cuya aguja casa con otra cosa parecida no comprueba nada, y encima sale en verde.** Pasó dos veces el 22/08, con el mismo perfil las dos:

1. En los tests del correo, `toContain("Envío")` **pasa siempre**: la plantilla ya dice «Dirección de envío» más abajo. Los tres tests de ausencia estaban en verde sin probar nada. Se cazó porque salieron ROJOS al ejecutarlos, y la aguja pasó a ser la celda (`>Envío</td>`).

2. En un poll de despliegue, `grep '"subtotal":1.86,'` casó con el subtotal del **carrito** en vez del de la **línea**, que era lo que se esperaba. Dijo «ARREGLO LIVE» a los 4 segundos con el fallo todavía en producción. Se arregló parseando el JSON y mirando `items[0].subtotal`.

⭐ **La disciplina que habría cazado las dos, y que no cuesta nada: comprobar que la comprobación SALE ROJA antes de que exista el arreglo.** Una aserción que nunca se ha visto fallar no es una aserción, es un adorno. Es la misma lección que la del 17/08 con los límites del multipart —el primer intento de reproducirlos con un `req` falso «demostraba» un fallo que no existía— y la de la 077, cuyos tests estaban en verde probando un camino muerto.

#### ⭐⭐ HECHO EL 2026-08-22 (tarde) — El bloque de confianza (migración 081)

Salió de una auditoría por lentes independientes. **Las tres cosas eran la misma**: un desconocido intentando averiguar si esto es una tienda real. Miraba los textos legales, buscaba quién vende, intentaba preguntar — y las tres puertas estaban cerradas.

1. 🔴 **Las dos páginas legales le decían al cliente que la tienda no estaba lanzada.** Terminaban, en producción, con «Este texto es provisional y será revisado por asesoría legal antes del lanzamiento». Es la peor frase posible en la página donde alguien entra justo a tranquilizarse antes de pagar.

2. 🔴 **No había aviso legal ni identidad del vendedor en ninguna parte** (art. 10 LSSI-CE). Cero apariciones de NIF, nombre o domicilio en toda la web pública; el pie era «© 2026 Valatino» y dos enlaces.

3. 🔴🔴 **El único contacto publicado era un agujero negro.** La política de privacidad mandaba ejercer los derechos del RGPD a `soporte@valatino.es`, y **valatino.es no tiene registros MX**: ese buzón no recibe nada. Una obligación legal enrutada a la nada durante meses, invisible porque **nadie prueba el correo ENTRANTE** — solo el saliente, que sí funciona. El único buzón vivo estaba detrás del login, o sea invisible para quien aún no ha comprado.

**Lo que se ha hecho**: migración 081 (canales de contacto en `ajustes_tienda` + `identidad_publica()`), endpoint público `GET /tienda/identidad`, páginas `/aviso-legal` y `/contacto`, reescritura de las dos legales, el pie con nombre y NIF impresos, y su pantalla en TI → Ajustes.

⭐ **La identidad NO se duplica**: sale de las MISMAS columnas `emisor_*` que firman cada factura (071). Escribir el NIF en el JSX habría creado un segundo sitio donde vive, y el día que difirieran nadie lo vería — porque nadie mira el aviso legal.

⭐ **La frontera de lo público vive en la base, no en un `select`.** `identidad_publica()` devuelve exactamente lo que puede salir a internet. `ajustes_tienda` guarda también el IBAN de cobro y el titular de la cuenta, así que un `select *` escrito con prisa en un endpoint público los publicaría; con la función, esa equivocación no es posible.

⚠️ **Esto publica el NIF y el domicilio de una persona física.** La LSSI lo exige y son los mismos datos que ya van impresos en cada factura, pero sí es información nueva para un buscador. Si algún día se quiere separar el domicilio publicado del fiscal, lo que hay que añadir es una columna `publica_direccion` que caiga a la fiscal cuando esté vacía.

⚠️ **Y los textos legales eran FALSOS, que era peor que incompletos**: decían «Aceptamos tarjeta (Stripe) y PayPal» cuando también hay Bizum y transferencia, y no mencionaban el envío. Lo que necesita revisión profesional queda marcado **en comentarios de código** al principio de cada página, no impreso al cliente.

⚠️ **El párrafo de cookies es verdad HOY y deja de serlo con la primera analítica.** Dice que no se piden cookies de análisis porque no las hay (comprobado: cero rastreadores). El día que se añada medición hay que hacer dos cosas inseparables: reescribirlo y montar el banner. Poner el rastreador sin el banner infringe el art. 22.2 LSSI y además deja esa página mintiendo.

#### ⚠️⚠️ Y una cicatriz del 22/08 que conviene no repetir: red en un layout

El primer intento del pie pintaba el nombre y el NIF leyéndolos de `/tienda/identidad`. Es bonito y **rompió el build entero**.

Un layout corre en CADA página, así que esa llamada se hacía **38 veces** al generar el sitio. Con la API caída, cada página esperaba a que el `fetch` fallara y se pasaba del **límite de 60 s** de generación estática de Next; tres reintentos por página y el build se rindió. La portada, el login y el checkout —que nunca habían necesitado la API para construirse— pasaron a depender de ella.

⚠️ **Y no era un problema solo local.** La API vive en el **plan gratuito de Render, que duerme**. Un despliegue de Vercel con la API fría habría fallado igual, y el fallo habría salido en el peor sitio: al desplegar, no al programar.

**Las dos lecciones, por orden:**

1. **Nada de red en un layout** salvo que se acepte que todas las páginas dependan de ella al construirse. Lo que la LSSI pide —acceso «permanente, fácil y directo»— lo cumple un ENLACE desde todas las páginas; los datos se pintan en las tres que van de eso.
2. **Todo `fetch` de build lleva `AbortSignal.timeout`.** Un `try/catch` no basta: no protege del *tiempo*, solo del error. Un fetch a una API dormida no falla rápido, y en Windows además reintenta IPv6 y luego IPv4.

⭐ Lo que salió bien: **el build local lo cazó antes del push**. Merece la pena seguir construyendo en local antes de desplegar, aunque el CI también lo haga.

#### La cola

1. 🟡 **§7 de la 080: el 303 en el caso de fallo.** Deliberadamente sin hacer, y con su porqué escrito en la propia migración. `liquidacion_iva` referencia `reembolso_lineas` en cinco sitios; tres necesitarían ver también el porte, y los otros dos no. Pero **esos tres solo entran en juego cuando una rectificativa NO se ha emitido**: si se emitió —el caso normal— el 303 la lee del bloque `doc`, donde el porte ya está, y el número es correcto. Cuando falla, el aviso `devolucion_sin_rectificativa` **sí salta** (lo disparan las líneas de artículos) y el botón de «emitir pendientes» lo arregla; lo único que se queda corto es el importe que ese bloque adelanta. **La dirección del error es la conservadora: declararía DE MÁS.** No se arregló hoy porque `create or replace` obliga a reescribir 430 líneas para cambiar tres CTEs, y transcribir SQL fiscal a mano parecía cambiar un fallo acotado y avisado por el riesgo de un error de copia **silencioso** en el 303.

   ⚠️ **PERO ESE ARGUMENTO YA NO SE SOSTIENE IGUAL, y hay que decirlo**: la comprobación de `md5(prosrc)` de más arriba hace que un error de copia **deje de ser silencioso** — se demuestra byte a byte si el resultado coincide con el fichero. Lo que queda es el trabajo de reescribirla con cuidado, no el riesgo de no enterarse. Cuando se haga: reescribir `liquidacion_iva` entera con los tres CTEs tocados, aplicarla, y comprobar el md5 contra el fichero antes de dar nada por bueno. Con su ensayo revertido, que además ya tiene herramienta.
2. ⚠️⚠️ **Verifactu con la gestoría. Sigue siendo lo único grande que separa esto del arranque fiscal.** El **QR** en la factura y confirmar que el **orden de campos de la huella** es el que exige la AEAT. **La cadena se puede recalcular mientras el arranque no esté marcado; después, no.** Llevar también la fecha con la que se deduce el IVA soportado (la de registro, ver la 068), el `TipoRectificativa` (las de aquí son **por diferencias**) y —nuevo— **el tratamiento del porte**: la 080 lo reparte a prorrata entre los tipos de la mercancía por el art. 78.Dos.1º LIVA, y conviene que lo confirmen antes del arranque.
3. 🔴 **EL IVA DE CANARIAS, CEUTA Y MELILLA. Destapado hoy y sin tocar.** El checkout acepta **las 52 provincias**, incluidas Las Palmas (35), Santa Cruz (38), Ceuta (51) y Melilla (52). Esos territorios están **fuera del ámbito del IVA** (IGIC / IPSI), así que una venta enviada allí no lleva IVA español — y hoy se le cargaría el 10 % o el 21 %. Es una avería fiscal **distinta** de la del envío pero de la misma familia, y se toca en la misma consulta con la gestoría. Además arrastra la tarifa: enviar a las islas no cuesta lo mismo, y la 080 dejó a propósito una tarifa plana sin zonas para no mezclar las dos decisiones.
4. **El logo y el pulido del PDF** — Jonathan pasa el modelo. ⚠️ Requisitos y la trampa del `nest-cli.json` (funciona en local y falla en Render) están en `factura-pdf.service.ts`. Ahí va también la **causa de la rectificación** (art. 15.3), que hoy no se imprime.
5. 🟡 **Decidir el cortafuegos de Vercel.** Sigue a medias desde el 17/08. El tráfico que entra por el proxy `/api` se agrupa bajo las IPs de salida de Vercel, así que una IP abusiva puede gastar la cuota de otros clientes de su zona. Quien SÍ ve la IP real es Vercel, y su cortafuegos está **accesible y vacío**. ⚠️ Mal calibrada rechaza compras sin que te enteres.
6. **Migrar `DireccionForm`** al componente compartido de ubicación, con la pantalla delante: es checkout.
7. **Higiene de producción, pendiente desde el 05/08**: revocar los secretos y borrar `C:\YJIMENEZ\tokens-despliegue.env.txt`, y quitar `https://valatino-api-steel.vercel.app` de `CORS_ORIGIN`. El que más prisa tiene sigue siendo `sb_secret_…`, que **salta el RLS**.
8. La cola de fondo: tests de componentes de la web, accesibilidad, la CSP a obligatoria, y el paso a Stripe `live`.

#### 🔴 Lo que se destapó al mirar la tienda como tienda (2026-08-15) — actualizado

1. ✅ **El coste de envío — HECHO HOY, migración aplicada y verificada.** Era el 🔴🔴. Solo falta pushear y poner el número en el panel.
2. ✅ **Compartir un enlace de la tienda** — hecho el 20/08 (`6e8ab9e`) y **verificado hoy en producción**.
3. **No hay `sitemap.ts`, ni `robots.ts`, ni datos estructurados** (`Product` con precio y disponibilidad). Es la continuación natural del OG y vive en el mismo `lib/seo/`.
4. **El catálogo no escala**: sin buscador, sin filtro por categoría y sin paginación — `limit=50` fijo. Con 30 productos aguanta; con 100 se rompe sin avisar.
5. **Sin analítica y sin banner de cookies.**
6. **Sin reseñas de producto.** `pedido_calificaciones` mide la experiencia de COMPRA, que es otra cosa.

#### Herramienta nueva de esta sesión

Para ejecutar `.sql` contra el remoto sin pasar por el CLI (que no sirve, ver arriba) está **`scripts/aplicar-sql.mjs`**, con `pg` como `devDependency` de la raíz.

```
node scripts/aplicar-sql.mjs --dry fichero.sql   # BEGIN … ROLLBACK  ← el ensayo
node scripts/aplicar-sql.mjs --go  fichero.sql   # BEGIN … COMMIT
```

⚠️⚠️ **Y UN FALLO DE ENTORNO QUE COSTÓ CUATRO COMPROBACIONES SEGUIDAS EL 22/08, para no repetirlo: `/tmp` de Git Bash y el `python` de Windows NO ven el mismo sistema de ficheros.** Git Bash mapea `/tmp` a su propio directorio; el `python.exe` de Windows lee `/tmp/x.json` como una ruta literal con barras invertidas que no existe. Un script que escribe con `curl -o /tmp/x` y lo lee con `python` falla **en silencio** si el error va a `/dev/null`, y entonces el poll se queda dando vueltas o sale con la comprobación vacía. **Usar rutas absolutas de Windows** (el scratchpad de la sesión) en cuanto se mezclen `curl` y `python`.

⚠️ Lee la URL de `supabase/.temp/pooler-url`, **que no lleva contraseña**, y la contraseña de `supabase/.temp/db-password` (o de `SUPABASE_DB_PASSWORD`, con la trampa de la herencia de entorno que se explica arriba). El `--dry` es lo que hacía falta y no había: aplica de verdad y lo deshace, así que un error de sintaxis o un guardia que salta se ven sin dejar rastro. Ya está en `scripts/`, junto con `ensayo-080-envio.sql`.

---

## ⭐⭐ HECHO EL 2026-08-22 (cont.) — El envío en UNA sola línea (082), y el `AbortSignal` que impedía repintar las legales

Dos cosas, y la segunda no estaba planeada.

### 1 · El porte, en una línea

Jonathan miró la primera factura real con envío y pidió lo contrario de lo que se había diseñado por la mañana: **«que salga el envío total y ya, menos complicado para el cliente».**

| | antes | ahora |
|---|---|---|
| Factura de un carrito mixto | `Gastos de envío 10 % 2,20` + `Gastos de envío 21 % 1,20` | `Gastos de envío — 3,40` |

⚠️⚠️ **La 080 lo prohibía por escrito, con tres razones.** No basta con cambiar el código: si el argumento se queda de pie, la próxima sesión lo revierte creyendo que arregla algo. Las tres, respondidas:

1. **«El art. 6.1.f RD 1619/2012 pide que la factura exprese el tipo aplicado.»** Se sigue cumpliendo, pero por el bloque de totales, no por la línea: el PDF imprime `Base imponible al 10 %` y `al 21 %` con sus cuotas, copiadas de `pedido_iva`. Eso es lo que diferencia la base de cada tipo, que es lo que el reglamento exige. Y **el porte no es una operación aparte**: el art. 78.Dos.1º LIVA lo mete dentro de la base de la entrega, así que darle un tipo propio siempre fue comodidad de presentación.
2. **«El PDF imprimiría "undefined %".»** ⭐ **Era cierto, y se vio.** El test nuevo salió rojo con `Gastos de envío · 1 · null % · 3,40` impreso en el PDF. Arreglado en el mismo cambio: la columna pinta `—` cuando no hay un tipo único.
3. **«El desglose queda atribuible línea a línea.»** Es la única que se pierde de verdad, y se compensa sin devolverle complejidad al cliente: **el reparto viaja dentro de la línea congelada** (clave `reparto`), y el PDF lo imprime en 7,5 pt bajo la tabla, solo cuando cae en más de un tipo. El cliente ve una cifra; quien cuadre el papel tiene los sumandos.

⭐ **Y de paso se cerró una duplicación que nadie vigilaba**: la 080 armaba la línea DOS veces, con el mismo jsonb copiado a mano en `emitir_factura` y en `emitir_rectificativa`. Nada comprobaba que siguieran iguales — tocar una y olvidar la otra daba una venta con un formato y su devolución con otro. Ahora las dos piden la línea a **`linea_envio_factura`**, y el cambio no fue «editar dos sitios» sino dejar uno.

**Lo que NO se tocó, y está comprobado, no supuesto:**

- `reparto_envio_pedido`, `pedido_iva` y `recalcular_iva_pedido` — **el IVA declarado no cambia ni un céntimo.** Esto es presentación.
- La huella de Verifactu: `factura_huella` hashea nif, número, fecha, tipo, cuota, total y la huella anterior (072:199). **No cubre `lineas`.** La cadena ni se entera. ⚠️ Ojo: el `comment on table` de la 072 dice que la huella cubre «el documento completo» y **eso es falso** — leerlo y creerlo daba un susto que no existe.
- El guardia del cuadre de `emitir_factura`: compara el **desglose** contra `pedidos.total`, no suma las líneas.
- **Las facturas ya emitidas.** Son inmutables por trigger y así se quedan: `VALS/VALF202600100` y `VALR202600101` conservan sus dos líneas para siempre. Convivirán dos formatos en el libro, y es lo correcto.
- **Ni una pantalla de la web, ni un correo.** Se mapeó el repo entero antes de tocar: el panel, la ficha del cliente, el carrito, el checkout y el correo de confirmación **ya pintaban una sola línea** leyendo `pedidos.coste_envio`. El PDF era el único sitio del proyecto que renderiza `facturas_emitidas.lineas`. O sea que el papel y las pantallas llevaban desde la mañana contradiciéndose, y esto los alinea.

#### ⚠️⚠️ Lo que este cambio enseña sobre los tests de aquí

**Ni un solo test de Jest se habría puesto rojo.** De los 44 spec del repo, los 9 que hablan de «envío» son de la tarifa, de la dirección o del correo: **ninguno construía una factura con línea de envío.** El cambio habría entrado en CI en verde y el «null %» habría salido impreso en un papel camino de la gestoría.

Y `factura-pdf.service.spec.ts` tampoco: casi todas sus aserciones eran `%PDF-` y `length > 1000`, que un PDF con «null %» pasa sin despeinarse. **El propio fichero ya lo confesaba en su línea 8** — y aun así el hueco siguió ahí hasta que hizo falta.

Tampoco TypeScript: `${l.iva_pct} %` **compila igual con `null`**. Abrir el tipo a `number | null` no protege de nada. Lo que lo impide es el test, no el tipo, y así queda escrito en `packages/types`.

⭐ Por eso `scripts/ensayo-080-envio.sql` ha dejado de ser solo columnas para leer: ahora tiene **un bloque que lanza** con cuatro comprobaciones (una línea · el importe es el porte entero · el reparto suma eso mismo · el tipo solo cuando hay uno). **Las cuatro se vieron discriminar antes de darlas por buenas**: la 1 saltó de verdad contra `VALS202600100`, que tiene el formato viejo, y las otras tres se probaron contra tres versiones corrompidas a propósito de la línea, fallando cada una solo con su avería.

#### Cómo se aplicó (la técnica, mejorada)

Sigue sin poderse `supabase db push` ni el ensayo revertido de `aplicar-sql.mjs` (la contraseña no está a mano). Pero retranscribir 465 líneas de SQL fiscal por el canal del MCP es donde vive la errata invisible, así que esta vez:

1. El fichero `082` se montó **con un script**, extrayendo las dos funciones de la 080 y aplicándoles el parche — nunca a mano.
2. Y en la base **se parcheó lo que la base ya tenía**: `pg_get_functiondef` → `replace()` → `execute`, con guardias que lanzan si algún fragmento no encaja.
3. Luego `md5(prosrc)` contra el md5 del cuerpo del fichero.

⭐ Son **dos caminos independientes** —un parche en Python sobre el repo, otro en SQL sobre la base— que tienen que converger en el mismo byte. **3 de 3 idénticos.** Es más fuerte que la comprobación de la mañana: allí se verificaba que lo escrito llegó entero; aquí, además, que lo escrito era lo que se quería escribir.

### 2 · Las tres páginas legales seguían vacías, y no era cuestión de esperar

Ayer quedaron desplegadas diciendo «todavía no están configurados» y se dijo que **se curaría solo** con el `revalidate` de 5 minutos. **No se curó.** El poll expiró a los 15 minutos con los tres contadores a cero.

Lo que la medición dijo, y por qué importa el orden:

- `x-vercel-cache` pasaba de `STALE` a `HIT` con `age: 0` → **el ISR sí regeneraba**. No era falta de tiempo.
- La API respondía **200 en 1,5 s** con el NIF y el correo dentro.
- Y la página **recién regenerada seguía saliendo vacía** → el `fetch` fallaba en el servidor, siempre, y el `catch` lo convertía en silencio.

⭐ **Lo delató la comparación, no la inspección**: `productos/[slug]` hace el mismo `fetch` a la misma API con el mismo `next: { revalidate }` y **sí trae datos en producción**. La única diferencia era el `signal: AbortSignal.timeout(5000)` que se puso ayer para salvar el build.

La regeneración de ISR corre en segundo plano, después de haber respondido, con el bucle de eventos congelado entre medias: el temporizador se dispara en cuanto el bucle revive y aborta la petición antes de que llegue a nada. Durante el build no pasa —el bucle está vivo— **y es justo donde el corte hace falta**, porque ahí está el límite de 60 s por página. Así que ahora el `signal` existe **solo durante el build** (`NEXT_PHASE`).

⚠️⚠️ **La lección, que es la de ayer con otra cara.** Ayer: «un `try/catch` no protege del TIEMPO, solo de los errores». Hoy: **el mismo `catch` que salvó el build es el que ocultó que la página nunca se arreglaba.** Un fallo tragado no desaparece — se convierte en una pantalla que miente educadamente. Y solo se vio porque la comprobación del despliegue tenía una **sensibilidad medida de antemano** (NIF=0 antes, NIF=0 después): sin esa línea base, «la página carga y se ve bien» habría pasado por éxito.

⚠️ **Esto es inferencia, no mecanismo demostrado.** Lo demostrado es que el `fetch` falla en cada regeneración y que la única diferencia con el que funciona es el `signal`. Si tras desplegar las páginas siguen vacías **una vez pasados los 5 minutos y con datos cambiados en el panel**, la causa es otra y hay que volver aquí.

---

## ⭐⭐ HECHO EL 2026-08-22 — El coste de envío (migración 080 + API + web)

**Hasta hoy la tienda enviaba gratis a toda España, y no por una decisión comercial: no existía el concepto.** Ni columna, ni campo en el checkout, ni línea en la factura. `pedidos` solo tenía una columna de dinero —`total`— y valía la suma de los artículos. Se han vendido Quipitos de 0,62 € con el porte pagado por la casa.

### Las tres decisiones, y por qué

1. **Tarifa plana con umbral de gratuidad**, dos números en `ajustes_tienda` con su pantalla en el panel. No hay tabla de zonas a propósito: arrastra la decisión del IVA de Canarias, que es otra avería (punto 3 de la cola).
2. **El envío sigue el tipo de la mercancía, repartido a prorrata.** Es el art. 78.Dos.1º LIVA: los portes forman parte de la base imponible de la entrega, no son un servicio aparte. Con tres tipos vivos en el catálogo (4 % ×1, 10 % ×21, 21 % ×8) un carrito mixto es lo normal, así que el reparto **no es un caso raro: es el caso**. Cobrarlo todo al 21 % —lo que hacen muchas tiendas— le cobraría al cliente 21 % sobre el porte de unas galletas al 10 %.
3. **El envío se devuelve solo en la devolución íntegra.** Lo exige el art. 107 RDL 1/2007 en el desistimiento. En una parcial no, porque el transporte se prestó.

### ⭐⭐ La cuenta pendiente que esto salda

La 078 lo dejó escrito con estas palabras: «**No hay coste de envío ni ningún otro concepto fuera de los artículos** […] Si algún día se cobra el envío aparte, esta proporción hay que revisarla: **sería dinero declarado que no se puede devolver**».

Era literal: `reembolso_lineas.pedido_item_id` es `not null`, así que el porte no cabe como línea de devolución. Metido en `pedido_iva` sin más, devolver TODOS los artículos dejaría el porte declarado para siempre y el 303 con una venta que no vuelve a cero.

### El reparto vive en UNA función, y es lo más importante del diseño

`reparto_envio_pedido(pedido_id)` devuelve, por tipo de IVA, lo que aporta de artículos y lo que le toca de envío. **La llaman los tres sitios que lo necesitan**: el desglose (`recalcular_iva_pedido`), las líneas de la factura (`emitir_factura`) y el desglose de la rectificativa (`emitir_rectificativa`).

⚠️⚠️ Escribirlo tres veces habría sido **exactamente el patrón que costó la 074** —el formato del número de factura vivía en tres sitios y la huella certificaba uno mientras la impresión sacaba otro—, y aquí peor: el documento diría un reparto y el 303 otro, sobre el mismo dinero.

### El redondeo acumulado, y el número que lo justifica

Repartir 4,95 € entre tres tipos y redondear cada trozo por separado **no suma 4,95 €**. Mismo céntimo que costó la 078, misma solución:

```
envio_acum(i) = round(envio × Σ_{j≤i} articulos(j) / articulos_total, 2)
envio(i)      = envio_acum(i) − envio_acum(i−1)
```

La suma es exacta **por construcción**: el último acumulado es `round(envio × 1, 2)` = `envio`, y los trozos son sus diferencias.

⭐ **Y no es higiene teórica: en el barrido de 64 combinaciones, el redondeo ingenuo falla en 24.**

### ⚠️⚠️ El arreglo de riesgo que salió por el camino: el porte se congela al cobrar

Buscando dónde poner el cálculo salió que **el importe se cobra en un sitio y el pedido se crea en otro**: `create-payment-intent` cobra `carrito.total`, y el webhook crea el pedido minutos después **recalculando** el total. Y **nadie compara `intent.amount` con `pedidos.total`**.

Con los artículos eso ya estaba resuelto (`carrito_items.precio_unitario` es una copia, no una lectura viva). Con el envío no lo estaría: editar la tarifa en el panel a mitad de un checkout dejaría al cliente pagando 4,95 € y al pedido diciendo 6,95 €, **en silencio**.

Así que el porte se congela en `checkout_datos.coste_envio` al crear el pago, y `confirmar_venta` factura **eso**. `checkout_datos` es exactamente para esto («staging de datos de checkout por sesión para webhooks», 019). Sin snapshot —sesión anterior a la 080, o webhook pasadas las 48 h de la limpieza— se aplica la tarifa vigente, que es lo único que se puede hacer.

### El hueco del porte solo, que es real y alcanzable

La rectificativa la dispara un trigger `after insert on reembolso_lineas` (077 §3). Y hay un camino que devuelve el porte **sin insertar ninguna línea**:

1. Se devuelven TODOS los artículos en reembolsos parciales. El pedido **no se cierra**, porque lo devuelto (artículos) es menor que el total (con porte).
2. Queda un último reembolso por el resto — que es exactamente el porte. `reembolsar_pedido_total` no encuentra artículos pendientes y no inserta nada. **El trigger no se dispara.**

No es teórico: es la secuencia de cualquiera que devuelva una compra artículo por artículo desde el panel. Se cierra en dos sitios: `reembolsar_pedido_total` llama ella misma a `emitir_rectificativa` cuando devolvió el porte y no dejó líneas —con el **mismo `exception when others`** del trigger, porque cuando eso corre el dinero ya salió de Stripe—, y `emitir_rectificativas_pendientes` aprende a verlo para que el botón de ponerse al día lo recupere.

### ~~La línea de la factura va UNA POR TIPO DE IVA~~ — ⚠⚠ **DEROGADO EL MISMO DÍA POR LA 082**

**No busques aquí el comportamiento actual: hoy el porte sale en UNA sola línea con el total.** Jonathan lo pidió al ver la primera factura real («que salga el envío total y ya, menos complicado para el cliente»), y las tres razones de abajo están respondidas una a una en la cabecera de la 082 — la 2 era cierta y se arregló en el mismo cambio. Se deja escrito porque es exactamente el razonamiento que llevaría a «arreglarlo» de vuelta.

Lo que se argumentó entonces, y no una sola sin tipo, por tres razones en este orden:

1. El **art. 6.1.f RD 1619/2012** pide que la factura exprese el tipo aplicado. Una línea sin tipo mientras el desglose lleva dos es un documento que no se explica solo — y esto va a la gestoría.
2. `factura-pdf.service.ts` imprime `${l.iva_pct} %` de cada línea: sin tipo saldría **«undefined %»**. Y el PDF es el sitio con la trampa del `nest-cli.json` que funciona en local y falla en Render: cuanto menos se toque, mejor. **Así el PDF no se ha tocado.**
3. El desglose queda atribuible línea a línea.

Con un carrito de un solo tipo —el caso corriente— sale UNA línea de envío.

### Lo que cambió fuera de la base

- **`carrito.total` cambió de significado**: antes eran los artículos, ahora artículos + envío. **A propósito que siga llamándose `total`**: los dos sitios que crean el pago (`createPaymentIntent`, `createOrder`) cobran ese número, así que el envío entró en el cobro sin poder olvidarse. El desglose viaja aparte (`subtotal`, `costeEnvio`, `envioGratisDesde`).
- ⚠️ **La tarifa NO se aplica en TypeScript.** El carrito llama a `coste_envio_de` y usa la respuesta tal cual; el umbral se lee suelto solo para enseñarlo. Hay un test que se pone rojo si alguien reescribe la regla en el cliente: subtotal 9 € bajo un umbral de 40 € y la base responde 0 → el servicio dice 0.
- ⚠️ **Un fallo de la RPC del envío no tumba el carrito: cobra 0 y lo grita en el log.** De los dos fallos posibles —dejar de cobrar un porte, o dejar la tienda sin carrito— el barato es el primero. Y no queda en silencio.
- **El correo de confirmación llevaba las de perder**: enseña las líneas y un «Total», así que con envío diría 9 € de producto y 13,95 € de total **sin nada que explicara la diferencia**. Es el recibo del cliente y el primer papel que mira cuando algo no cuadra. Ahora lleva su línea de «Envío», y solo si se cobró (nadie necesita ver «Envío: 0,00 €»).
- Misma fila añadida en la ficha del pedido del panel y en la del cliente, por lo mismo: las líneas suman menos que el total y quien lo mire pensará que falta un artículo.
- **`lib/tienda/envio.ts`** con el aviso de «te faltan X € para el envío gratis», fuera del JSX y con 12 tests, por lo mismo que `lib/seo/metadatos.ts`: **falla en silencio**. Un aviso mal calculado no da error, solo empuja a añadir 3 € que no sirven de nada — o calla cuando faltaba un euro.
- ⚠️ En los tests del correo, `toContain("Envío")` **pasa siempre**: la plantilla ya dice «Dirección de envío» más abajo. Los tres tests de ausencia salieron rojos con el código correcto hasta que la aguja pasó a ser la celda (`>Envío</td>`). Queda anotado en el spec.

### Lo que la migración NO cambia por sí sola

`envio_coste` nace en **0**, que significa envío gratis: exactamente lo que la tienda hace hoy. **Nada cambia hasta que alguien ponga el número en el panel.** Los dos pedidos que ya existen se quedan con `coste_envio = 0`, que es la verdad: se enviaron gratis.

⚠️ Y aquí el default sí es correcto, al contrario que en la 071 (`emisor_nif` sin default, «un dato que parece puesto es un dato que nadie revisa»). La diferencia: un NIF vacío no tiene lectura válida; un coste de envío de 0 tiene una lectura válida, verdadera y conservadora.

---

## ⭐ HECHO EL 2026-08-20 — El OG de WhatsApp (no quedó registrado en su día)

`6e8ab9e`. **Verificado hoy contra producción**, no de memoria:

| | |
|---|---|
| Portada | `og:image` → `/portada.png` · 200 · `image/png` 33 KB · `max-age=31536000` |
| Ficha (`colcafe-clasico-85g`) | `og:title` sin la plantilla «\| Valatino», precio en la descripción, `canonical` correcto |
| Imagen de la ficha | 200 · **`Content-Type: image/jpeg`** 35 KB · `max-age=3600` |

Las cuatro cosas que solo salieron por medirlas están en el mensaje del commit, que es largo a propósito: las fotos del catálogo son WebP pero la transformación de Supabase con `format=origin` las devuelve en **JPEG de verdad** (y sin ese parámetro sirve bytes JPEG bajo cabecera `image/webp`, que es lo que hace que un crawler estricto descarte la imagen); `resize=contain` y **no** `cover`, porque con `cover` al tarro de Colcafé se le iban la tapa y la base; `recortar()` usaba `\s`, que también casa el espacio duro que `Intl` mete en «4,92 EUR» y WhatsApp podía partir el precio en dos líneas; y `alternates.canonical` **no puede ir en el layout raíz** porque se hereda igual que `openGraph`, así que `/carrito`, `/checkout`, `/login` y las dos legales decían ser duplicados de la portada.

⚠️ `/portada.png` es **provisional**: sin logo, el diseño es la tipografía. Cuando llegue el modelo se sustituye ese fichero y **la URL no cambia**, así que no hay que esperar a que WhatsApp suelte su caché.

---

### Cierre anterior — 2026-08-17

**Todo commiteado y pusheado** (`8f01a8a`), árbol limpio, 0 sin pushear. **787 tests** (448 API + 339 web).

⚠️ **Los dos builds y los dos `type-check` van en verde, pero SECUENCIALMENTE.** Corriendo `turbo build type-check` en la misma invocación, el `type-check` de la web falla a veces. Encaja con que `next build` regenere `.next/types/**` —que el `tsconfig` de la web incluye— mientras `tsc` los lee. **No está diagnosticado, solo observado**: se llegó a atribuir a una carrera de turbo y era falso (`dependsOn: ["^build"]` ya estaba bien puesto). Si sale rojo en CI, mirar aquí antes de buscar un error de tipos real.

⭐ **La tarde fue de dos averías, y ninguna de las dos era lo que parecía al empezar.**

**Estado del remoto, comprobado al cerrar** (no de memoria):

| | |
|---|---|
| Pedidos | **1** (`260815017972`, REEMBOLSADO, 3,72 €) — sin cambios |
| Facturas | 4, contadores intactos · 8 eventos · sin actividad desde el 15/08 12:53 |
| Productos | **30** (29 activos) — Jonathan dio de alta 3 el 17/08 a las 19:07-19:09 UTC |
| API | `8f01a8a` live en Render · `/health` 200 · `/diagnostico/red` 401 sin sesión |

#### Lo primero al volver: NADA pendiente de comprobar

Las dos averías están desplegadas Y verificadas contra producción. La de las imágenes la verificó Jonathan sin saberlo: los tres productos que subió a las 19:07 llevan su `.webp` en el bucket, y son de después del despliegue del arreglo.

#### La cola

1. 🟡 **Decidir el cortafuegos de Vercel.** Es lo único que quedó a medias hoy. El tráfico que entra por el proxy `/api` se sigue agrupando bajo las IPs de salida de Vercel, así que una IP abusiva puede gastar la cuota de otros clientes de su misma zona. Quien SÍ ve la IP real es Vercel, y su cortafuegos está **accesible y vacío** (`{"active":null,"draft":null,"versions":[]}`). Una regla conservadora de límite por IP lo cierra. ⚠️ Mal calibrada rechaza compras sin que te enteres, así que el techo va muy por encima de lo que hace una persona navegando.
2. ⚠️⚠️ **Verifactu con la gestoría. Sigue siendo lo único grande que separa esto del arranque fiscal.** El **QR** en la factura y confirmar que el **orden de campos de la huella** es el que exige la AEAT. **La cadena se puede recalcular mientras el arranque no esté marcado; después, no.** Llevar también la fecha con la que se deduce el IVA soportado (la de registro, ver la 068) y el `TipoRectificativa` (las de aquí son **por diferencias**).
3. **El logo y el pulido del PDF** — Jonathan pasa el modelo. ⚠️ Requisitos y la trampa del `nest-cli.json` (funciona en local y falla en Render) están en `factura-pdf.service.ts`. Ahí va también la **causa de la rectificación** (art. 15.3), que hoy no se imprime.
4. **Migrar `DireccionForm`** al componente compartido de ubicación, con la pantalla delante: es checkout.
5. **Higiene de producción, pendiente desde el 05/08**: revocar los secretos y borrar `C:\YJIMENEZ\tokens-despliegue.env.txt`, y quitar `https://valatino-api-steel.vercel.app` de `CORS_ORIGIN`. ⚠️ **El token de Vercel se regeneró el 17/08** (el viejo ya estaba muerto: daba 403 pidiendo reautenticar el ámbito `yonathanjis-projects`). El que más prisa tiene sigue siendo `sb_secret_…`, que **salta el RLS**.
6. La cola de fondo: tests de componentes de la web, accesibilidad, la CSP a obligatoria, y el paso a Stripe `live`.

#### 🔴 Lo que se destapó al mirar la tienda como tienda (2026-08-15) — SIGUE TODO PENDIENTE

1. 🔴🔴 **NO EXISTE EL COSTE DE ENVÍO. En ningún sitio.** Ni columna, ni campo en el checkout, ni línea en la factura: `recalcular_iva_pedido` **aborta** si el desglose no suma exactamente `pedidos.total`, y ese total es la suma de los artículos. Hoy **se envía gratis a toda España** y se venden Quipitos de 0,62 €. Toca `pedido_iva`, las líneas de la factura y el 303, así que hay que diseñarlo **antes del arranque fiscal**.
2. 🔴 **Compartir un enlace de la tienda no enseña nada.** Sin `metadataBase` ni `openGraph` ni imagen de portada: en WhatsApp sale un enlace pelado que parece spam. Barato y se nota el mismo día.
3. **No hay `sitemap.ts`, ni `robots.ts`, ni datos estructurados** (`Product` con precio y disponibilidad).
4. **El catálogo no escala**: sin buscador, sin filtro por categoría y sin paginación — `limit=50` fijo. Con 30 productos aguanta; con 100 se rompe sin avisar.
5. **Sin analítica y sin banner de cookies.**
6. **Sin reseñas de producto.** `pedido_calificaciones` mide la experiencia de COMPRA, que es otra cosa.

### Cierre anterior — 2026-08-15

**Todo está commiteado y pusheado** (`e41439f`), árbol limpio, 0 sin pushear. **757 tests** (430 API + 327 web), `type-check` y los dos builds en verde.

⭐ **La tarde fue de tienda de cara al cliente** (seis cambios, todos desplegados y probados por Jonathan en el móvil): la tira de miniaturas de sabores/formatos, el carrito sobre la foto, y la barra que se esconde al bajar. Ver «La tienda del cliente» más abajo.

⭐⭐ **HOY LA CAPA 2 SE PROBÓ CON DINERO REAL DE PUNTA A PUNTA, Y ADEMÁS SE LIMPIÓ LA BASE.** La operación entera —compra, simplificada sola, canje a completa, PDF, envío por correo, dos devoluciones parciales con su rectificativa automática— cursó sobre el pedido `260815017972` y **volvió a cero exacto**.

**Estado del remoto, comprobado al cerrar** (no de memoria):

| | |
|---|---|
| Pedidos | **1** (`260815017972`, REEMBOLSADO, 3,72 €) — el del 14/08 se limpió |
| Facturas | `VALS202600100` (sustituida) · `VALF202600100` · `VALR202600100` · `VALR202600101` |
| La suma de las rectificativas | **base 3,38 · cuota 0,34** = exactamente lo que declaró la venta |
| Contadores | `VALS→101` `VALF→101` `VALR→102` |
| Cadena de huellas | **intacta** · 0 anomalías en `factura_eventos` |
| 3T | **−25,10 €** · repercutido **0,00 / 0,00** · único aviso: `sin_arranque_fiscal` |
| Descuadres de stock | **0** |
| Arranque fiscal | **sin marcar** — la ventana para rehacer cosas sigue abierta |
| CHECK de la 076 | **convalidado** (079) — ya no es `NOT VALID` |

⚠️ **La regla de siempre, que ayer salió cara y hoy volvió a acertar**: este fichero se escribe al final de la sesión y la tienda sigue viva entre sesiones. Al reanudar hoy, la BD tenía **dos rectificativas que este documento no mencionaba** —Jonathan había hecho las tres pruebas de pantalla después del cierre— y de ahí salió todo lo demás. **Preguntarle a la BD antes de creerse el markdown.**

#### Lo primero al volver: NO hay nada pendiente de mirar en pantalla

Por primera vez en varias sesiones, todo lo construido se ha visto funcionando en un navegador y con dinero real. La cola es de trabajo, no de comprobaciones.

#### La cola

1. ⚠️⚠️ **Verifactu con la gestoría. Es lo único grande que separa esto del arranque fiscal.** Ya no es código: el **QR** en la factura y confirmar que el **orden de campos de la huella** es el que exige la AEAT. **La cadena se puede recalcular mientras el arranque no esté marcado; después, no.** Llevar a la misma consulta: la fecha con la que se deduce el IVA soportado (hoy la de registro, ver la 068) y el `TipoRectificativa` que se declara (las de aquí son **por diferencias**).
2. **El logo y el pulido del PDF** — Jonathan pasa el modelo. ⚠️ Requisitos y la trampa del `nest-cli.json` (funciona en local y falla en Render) están en `factura-pdf.service.ts`. Ahí va también la **causa de la rectificación** en la rectificativa (art. 15.3), que hoy no se imprime.
3. **Migrar `DireccionForm`** al componente compartido de ubicación, con la pantalla delante: es checkout.
4. **Higiene de producción, que lleva pendiente desde el 05/08**: revocar los **cinco secretos** y borrar `C:\YJIMENEZ\tokens-despliegue.env.txt` (la `sb_secret_…` salta el RLS), y quitar `https://valatino-api-steel.vercel.app` de `CORS_ORIGIN`.
5. La cola de fondo: tests de componentes de la web, accesibilidad, la CSP a obligatoria, y el paso a Stripe `live`.

#### 🔴 Y lo que se destapó al mirar la tienda como tienda (2026-08-15)

Comprobado en el código, no supuesto. Por orden de lo que cuesta dinero:

1. 🔴🔴 **NO EXISTE EL COSTE DE ENVÍO. En ningún sitio.** No hay columna, ni campo en el checkout, ni línea en la factura: `recalcular_iva_pedido` **aborta** si el desglose no suma exactamente `pedidos.total`, y ese total es la suma de los artículos. O sea que **hoy se envía gratis a toda España**, y se venden Quipitos de 0,62 €. No es trabajo de pantalla: toca `pedido_iva`, las líneas de la factura y el 303, así que hay que diseñarlo antes del arranque fiscal.
2. 🔴 **Compartir un enlace de la tienda no enseña nada.** No hay `metadataBase` ni `openGraph` ni imagen de portada: en WhatsApp —que es por donde se va a compartir— sale un enlace pelado, que parece spam. Es barato y se nota el mismo día.
3. **No hay `sitemap.ts`, ni `robots.ts`, ni datos estructurados** (`Product` con precio y disponibilidad). Google no tiene por dónde entrar al catálogo ni con qué pintar el resultado enriquecido.
4. **El catálogo no escala**: sin buscador, sin filtro por categoría y sin paginación — un `limit=50` fijo y todo en una rejilla. Con 20 productos funciona; con 100 se rompe, y no avisa.
5. **Sin analítica y sin banner de cookies.** No se sabe qué se mira ni de dónde viene la gente; y en cuanto se ponga analítica, en España el banner deja de ser opcional.
6. **Sin reseñas de producto.** `pedido_calificaciones` mide la experiencia de COMPRA, que es otra cosa y no se enseña en la ficha.


## ⭐⭐ HECHO EL 2026-08-17 — Dos averías, y ninguna era lo que parecía

### 1. No se podían subir imágenes al catálogo (roto seis días)

Jonathan avisó de que no le dejaba subir imágenes y que «decía algo con *many to*». Reproducido y arreglado (`4018169`).

**La causa: `parts: 1` en los límites del multipart de `productos.controller.ts` no admite una parte, admite CERO.** En busboy (`types/multipart.js:548`) el contador se incrementa ANTES de comparar:

```js
if (++parts === partsLimit) this.emit('partsLimit');
```

⚠️ **Y `files` y `fields` NO se cuentan igual**: esos comparan antes de incrementar (líneas 340 y 369), así que `files: 1` sí admite un fichero. Solo `parts` va desfasado en uno. **`parts: N` admite N−1.**

Lo que lo rompió fue lo que se creyó al escribirlo, el 11/08 a las 21:34 (`649a2e3`): «el envío es un fichero y ningún campo, así que los números son los exactos y no de holgura». El número exacto para un fichero es **2**. `compras` se libró solo porque allí sí se dejó holgura (`parts: 10` para 6 partes reales).

⚠️ **El fallo era invisible para los tests porque los límites vivían en un objeto literal que nadie ejecutaba.** Ahora hay `productos.controller.spec.ts` con `supertest` contra la app de verdad, comprobado que se pone rojo si alguien vuelve a apretar `parts`.

⚠️⚠️ **Y la lección de método, que casi cuesta el diagnóstico entero**: el primer intento de reproducirlo con un `req` falso (un `Readable` con cabeceras a mano) daba «sin fichero» **incluso con los límites buenos**. O sea que habría «demostrado» un fallo que no existe y dejado pasar el que sí. Solo con un servidor HTTP real y `FormData` generado por el navegador/Node salió el `Too many parts`. Está anotado en el test para que nadie lo reescriba con un mock.

De paso: `tsconfig.spec.json` recortaba `types` a `node` y `jest`, y eso dejaba fuera `@types/multer`. Ningún spec de un controlador con subida de ficheros podía ni compilar.

### 2. Los errores de fichero salían en inglés — y la traducción era código muerto

`ca7340b`. La tabla de traducción al castellano **ya existía** en `common/errores/subidas.ts`, y aun así el panel enseñaba `Too many parts`.

⚠️⚠️ **El motivo hay que recordarlo, porque se repetirá con cualquier error de Multer**: `FileInterceptor` pasa el error por `transformException()` de `@nestjs/platform-express` **antes de que lo vea ningún filtro**, y ahí deja de ser un `MulterError` — se convierte en un `BadRequestException` cuyo mensaje es la cadena inglesa. Para cuando llegaba al filtro global, `name` ya no era `"MulterError"` y el `code` se había perdido, así que el reconocimiento por pato no casaba nunca.

⚠️ **Sus tests estaban en verde probando el camino muerto**: el spec fabricaba a mano un `MulterError` que Nest jamás entrega. Se dejaron (por si algún día se parsea un multipart a mano) y se añadieron los del caso real, más uno de punta a punta con el filtro global montado.

También se cambió lo que dicen los tres errores de «cuenta» (partes, campos, ficheros): el formulario manda lo que manda, así que si no cabe es que el límite del servidor está mal puesto. Ahora dicen **«Es un fallo nuestro: avísanos»**. Un «trae más partes de las admitidas» a secas se lee como culpa propia y no se reporta — que es exactamente por qué esto estuvo seis días roto.

### 3. ⭐⭐ El límite de peticiones no limitaba a nadie (y llevaba así desde antes)

Salió tirando de un cabo suelto, y resultó ser lo más gordo del día.

**⚠️⚠️ LA TOPOLOGÍA REAL NO ES LA QUE SE CREYÓ. Hay un Cloudflare delante de Render que nadie había contado.** Medido con `/diagnostico/red`, no supuesto:

```
Directo:      94.73.34.5 , 172.71.146.191 , 10.199.135.225
              (cliente)    (Cloudflare)     (interna de Render)

Por el proxy: 94.73.34.5 , 15.237.214.233 , 172.71.146.136 , 10.194.229.222
              (cliente)    (Vercel)          (Cloudflare)      (interna de Render)
```

Con `TRUST_PROXY_HOPS=1`, `req.ip` salía **una IP interna de Render** (`10.x`), y encima cambiaba entre peticiones. El límite de 100/min no agrupaba por cliente ni por nada estable: **no protegía de nada y repartía la cuota a ciegas.** «Corto pero seguro» resultó ser también «inútil».

**Subido a 3** (`8f01a8a`). Por qué 3 y no 4, medido con las cadenas reales mandando un `X-Forwarded-For` inventado:

| | directo normal | directo mintiendo | con 3 mentiras | por el proxy |
|---|---|---|---|---|
| 1 (antes) | interna Render | interna Render | interna Render | interna Render |
| 2 | Cloudflare | Cloudflare | Cloudflare | Cloudflare |
| **3 (hoy)** | ✅ IP real | ✅ IP real | ✅ IP real | 🟡 Vercel |
| 4 | ✅ IP real | 🔴 **falsificada** | 🔴 `3.3.3.3` | ✅ IP real |

Funciona porque **Cloudflare AÑADE la IP real detrás** de lo que traiga el cliente, y Render añade dos más: el cliente de verdad queda **siempre a profundidad 3**, por muchas mentiras que se pongan delante.

⚠️ **Se sostiene sobre que no exista forma de llegar con menos saltos.** Comprobado: `api.valatino.es` y `valatino.onrender.com` responden los dos con `Server: cloudflare` y `CF-RAY`. **Si algún día se sirve la API por un host que no pase por Cloudflare, este 3 pasa a ser falsificable.**

Verificado contra producción tras desplegar: directo normal y directo mintiendo dan los dos `94.73.34.5`.

#### Lo que queda apagado a propósito: el secreto del proxy

Está construido, probado y **desplegado inerte** (`7b941a7`): la web se identifica ante la API con un secreto compartido y solo entonces la API se cree la IP que le declara. Arregla el trozo que los 3 saltos no cubren (el tráfico de la tienda, que lleva un salto más).

🔴 **NO ACTIVARLO todavía, y el motivo es un dato:** probando tres veces cómo trata Vercel un `X-Forwarded-For` falsificado del cliente, **una de las tres lo reenvió tal cual** en vez de sustituirlo por la IP real. No hay explicación para la variación. Y como el middleware estuvo **inerte las tres veces** (sin secreto en Vercel → `NextResponse.next()` pelado), **no fue artefacto de nuestro código: es Vercel.**

Activarlo así abriría un camino por el que un cliente puede a veces elegir su propio cubo — el mismo agujero por el que se descartó subir a 4 saltos. Se activa el día que haya una fuente fiable de la IP en el borde de Vercel, y se verifica con `/diagnostico/red`.

⚠️ **`PROXY_API_SECRETO` no está en ningún sitio, y es a propósito.** Se llegó a poner en Render y se borró el mismo día: una variable inerte solo sirve para que alguien la vea, la crea necesaria y la replique en Vercel — que es exactamente lo que NO hay que hacer. Tampoco se declara en `render.yaml` con `sync: false`, porque eso la pediría al aplicar el blueprint. El aviso vive ahí en forma de comentario.

#### `GET /diagnostico/red` (solo admin) — el instrumento

Se ganó el sitio en la primera pasada: sin él se habría dado por bueno un reinicio que no aplicó la variable. Devuelve qué IP usa de verdad la cuota, la cadena `X-Forwarded-For` entera, si el proxy se identificó y por qué no. **Nunca devuelve el secreto.**

⚠️ **Distingue `sin-cabecera` de `secreto-no-coincide` a propósito**: la primera versión los juntaba y decía «algo pasa» sin decir dónde mirar. Sin cabecera = la web no la manda (falta la variable o falta redesplegar); no coincide = los valores difieren.

⚠️ **Abrirlo en el navegador NO vale**: la API se autentica con Bearer, no con cookie, así que una URL pelada da 401. Es la misma trampa anotada en `client.ts` para el PDF.

#### Tres trampas de despliegue que costaron vueltas

1. ⚠️⚠️ **Cambiar una variable de entorno en Render por API NO la aplica. Un `restart` TAMPOCO.** Hace falta un **deploy** (`POST /v1/services/{id}/deploys`). Estaba avisado en este mismo fichero desde el 12/08 y se tiró por el atajo igual; lo cazó el diagnóstico (`secretoConfigurado: false`).
2. ⚠️ Para tocar variables por API, usar `PUT /v1/services/{id}/env-vars/{KEY}` (una sola clave). El `PUT /env-vars` sin clave **reemplaza TODAS** y se llevaría por delante las otras catorce.
3. ⚠️ En Vercel, `process.env.PROXY_API_SECRETO` se **inlinea en el bundle del middleware al construir**: guardar la variable no basta, hay que redesplegar. Misma trampa que `NEXT_PUBLIC_API_URL` el 05/08.

#### Un detalle menor pero real

El comentario de `limites-peticiones.ts` dice que el límite global «reparte la MISMA cuota entre todas las rutas». **No es así**: la clave del throttler es `sha256(Clase-manejador-nombre-IP)`, o sea que cada ruta tiene su propio cubo. Y el almacén es **en memoria**: cada despliegue pone los contadores a cero, y si Render escalara a más de una instancia el límite real se multiplicaría sin avisar.


## ⭐⭐ HECHO EL 2026-08-15 (cont.) — La tienda del cliente

Seis cambios, **todos desplegados y probados por Jonathan en el móvil**. Ninguno tocó la BD ni la API salvo una columna más en un `select`: el modelo ya estaba.

### La tira de miniaturas de las presentaciones

Lo pidió con una captura de New Balance. Allí cambia el color; aquí el **sabor** o el **formato**, que es lo que ya declaraban `familia`, `variante` y `variante_tipo` desde la 057. Lo que había era una línea de texto (`Chocolate · Fresa · …`) y pasa a ser la tira pinchable.

⚠️ **Elegir una miniatura NO navega, cambia la tarjeta**: foto, precio y nombre. Se eligió frente a que cada miniatura fuera un enlace porque comparar cuatro sabores no puede costar cuatro idas y venidas — en móvil es donde se abandona.

**Las decisiones viven en `vistaDeFamilia()`, no en el JSX**, porque la web no tiene tests de componentes y una regla escrita en el render es una regla sin red:

- **Arranca en FAMILIA, no en una variante**: la tarjeta abre como siempre (foto de familia, «Desde X») y solo se concreta al elegir.
- ⚠️ **El enlace va a la ELEGIDA.** Si llevara a la representante, elegir fresa y entrar abriría chocolate, y el cliente no tiene forma de saber que no le hicieron caso.
- ⚠️ **Con una elegida manda SU stock** aunque queden hermanas: decir «disponible» porque queda otro sabor manda a alguien a la ficha a encontrarse el botón apagado.
- **Sin foto propia cae al placeholder y no a la de familia**: enseñarla haría creer que esa es su foto.

⭐ **Un test corrigió el diseño de quien lo escribió**: el resumen salía solo con varias facturas *vigentes*, y con una simplificada canjeada hay **dos filas en pantalla y una sola cuenta** — el caso donde más falta hace.

### El carrito sobre la foto, y lo que costó afinarlo

Empezó como «quitar +Carrito y poner una bolsa», y acabó en el icono `ShoppingCart` **de la barra de arriba**: eran dos dibujos para la misma idea en la misma pantalla. El componente se llama `BotonCarrito` — se renombró con el icono, o habría mentido el mismo día.

- ⚠️⚠️ **Es HERMANO del `<Link>`, nunca hijo.** Un `<button>` dentro de un `<a>` es HTML inválido y el clic haría **las dos cosas**: añadir Y navegar.
- ⚠️ **En móvil se arrincona y encoge el DIBUJO, no el botón.** El cuadro de 40 px que se toca con el dedo no se reduce: encogerlo para ganar seis píxeles sería pagar el arreglo justo donde el botón se usa peor.
- **Vive en un solo componente** y lo usan las dos tarjetas. Gracias a eso el ajuste del móvil se hizo en un sitio. Copiarlo habría dejado dos botones que se parecen hasta que alguien arregle uno — el patrón de la 074.
- ⭐ **En la tarjeta de familia aparece SOLO al elegir.** Antes de elegir no se sabe qué añadir; después, la ambigüedad desaparece. Lo levantó Jonathan probando: la condición no era «esta tarjeta no puede», era «todavía no».
- **Fuera «Elegir sabor»**: las miniaturas ya son el selector y la foto y el título ya entran. Y eso cerró solo la rejilla, que se leía en dos idiomas.

### La barra que se esconde al bajar

Suena a una línea y no lo es. Las reglas están en `decidirOculta`, pura y con un test cada una:

- **Arriba del todo no se esconde nunca**: si no, el primer golpe de rueda se lleva la cabecera y en una página corta no hay scroll de vuelta con el que recuperarla.
- **Umbral de 8 px**: el trackpad y la inercia del móvil emiten decenas de eventos de uno o dos píxeles que cambian de signo. Y en el temblor **se conserva** el estado — mostrarla ahí haría que reapareciera sola cada vez que el dedo se para.
- ⚠️⚠️ **El rebote de iOS da `scrollY` NEGATIVO.** Al estirar la página hacia abajo estando arriba, la vuelta de −60 a 0 se lee como «bajando» y la barra se escondía **justo con el gesto que pedía verla**.

Del cableado: listener `passive` (sin eso el scroll se siente pegajoso en móvil) y lectura dentro de `requestAnimationFrame` (leer `scrollY` fuerza recálculo de maqueta y el evento se dispara decenas de veces por fotograma). Se esconde con `translate` y **no** dejando de pintarla: al ser `sticky` ya ocupa su hueco, y sacarla del flujo haría saltar el contenido 64 px. No se esconde con el menú abierto, y `focus-within` la devuelve para quien navega con el tabulador.

### ⭐⭐ Y el fallo que destapó probarla, que es el más instructivo del día

Con la barra escondida, tocabas el carrito de una tarjeta y **no pasaba nada visible**. El toast se va en dos segundos y **la prueba de que el pedido creció es el contador del carrito** — que estaba justo en lo que acabábamos de esconder. **El efecto se había comido la confirmación de la única acción que da dinero.**

La solución **vigila el CONTADOR, no avisa desde el botón**, y esa es la decisión que importa: vale para la tarjeta, para la ficha y para el camino que se añada mañana, sin que ninguno tenga que acordarse de que existe una barra que puede estar escondida. Dos reglas, con tests: la **primera lectura no cuenta** (es la carga del carrito, no una compra: quien vuelve con tres cosas dentro pasa de nada a 3 al hidratar) y **solo cuando sube**.

### ⚠️ Lo que la sesión dejó sin cubrir, y hay que saberlo

**La web sigue sin tests de componentes.** Todo lo de hoy se probó con funciones puras (`vistaDeFamilia`, `decidirOculta`, `debeRevelar`) y **con el dedo de Jonathan**. Lo que ninguna de las dos cosas cubre es la unión: que el botón esté donde se cree, que el `aria-pressed` cambie, que el `translate` se aplique. Es la deuda que más ha crecido hoy.


## ⭐⭐ HECHO EL 2026-08-15 — el céntimo, la pregunta de «cuál es la factura final», y la base limpia

### Lo que la BD dijo al reanudar, y este fichero no

Otra vez, y por eso la regla está arriba. Jonathan hizo las **tres comprobaciones de pantalla** después del cierre del 14/08, y la BD lo contaba todo:

| | |
|---|---|
| `enviada` de `VALF202600100` ×2 | El PDF y el envío funcionan (y `enviarFactura` **lanza** si falla, así que el evento prueba que salió) |
| Dos rectificativas, `VALR202600100` y `…101` | Devolvió el pedido en **dos reembolsos parciales** y salieron solas |
| Dos `rectificativa_sin_receptor_heredado` | ⚠️ Y salieron **sin receptor**, por el NIF de prueba. Ver abajo |

### ⭐ El céntimo que perdían las rectificativas (078)

**El síntoma, con los números reales**: la venta declaró base 2,75 / cuota 0,27. Se devolvió **entera** y las dos rectificativas sumaron 2,74 / 0,28. El **dinero** cuadraba al céntimo (3,02 − 0,62 − 2,40 = 0,00); lo que no volvía a cero era el reparto, y el 303 quedó con `repercutido` = base **+0,01** y cuota **−0,01**. Una cuota negativa sobre una base positiva, en una venta saldada.

**La causa**: cada reembolso derivaba SU base aisladamente (`round(con_iva / (1 + pct/100), 2)`) y dos redondeos independientes no vuelven al original.

**El arreglo**: la base sale del acumulado.

```
objetivo  = round(base_venta × devuelto_acumulado / total_venta, 2)
base_doc  = objetivo − base_ya_rectificada        (por tipo de IVA)
cuota_doc = devuelto_esta_vez − base_doc          ← RESTANDO, como siempre
```

⭐ **No compensa de casualidad: converge.** Si `devuelto_acumulado = total_venta`, el objetivo ES `base_venta`. Y **la deriva no se acumula**, porque el objetivo se recalcula sobre el total y no sobre el trozo.

⚠️⚠️ **Que la proporción sea exacta hubo que comprobarlo antes de fiarse de una regla de tres sobre dinero**: `pedido_iva` se construye de `pedido_items` y `reembolso_lineas.importe` copia esas mismas líneas — **no hay coste de envío ni ningún concepto fuera de los artículos**. El universo devolvible y el declarado son el mismo. **Si algún día se cobra el envío aparte, esta proporción hay que revisarla.**

⚠️⚠️ **Y había un problema más gordo que el céntimo: la aritmética estaba DUPLICADA.** La 077 la escribía para el documento y la 068 la recalculaba para el 303 —«copiada línea por línea», decía su propio comentario—. Arreglar solo la 077 habría hecho que el papel dijera 2,19/0,21 y el 303 siguiera diciendo 2,18/0,22 **del mismo reembolso**: de un céntimo a una contradicción. **Es el mismo patrón que costó la 074** (el formato del número en tres sitios). Ahora **el 303 suma el desglose de las rectificativas emitidas** y solo deriva por su cuenta las devoluciones sin documento, con el predicado **literal** del aviso `devolucion_sin_rectificativa` de la 075.

**Ensayo en transacción revertida, 4/4**, y el que más valía era el **B**: emitir las dos al revés da el mismo resultado. Es **independiente del orden**, y lo es porque «lo ya rectificado» se lee de los **documentos emitidos**, no de los reembolsos — si una falla y se emite luego con `emitir_rectificativas_pendientes`, la última cierra el resto.

### ⭐⭐ «¿Cuál queda como factura final?» — la pregunta de Jonathan, y por qué no existe

Mirando el historial: *«la completa queda completa y las rectificativas son solo de lo que se devuelve, ¿no se debería actualizar la completa con cada devolución?»*. **No, y no se puede**: una factura emitida no se modifica jamás —lo impide la ley, `trg_factura_inmutable` y el hecho de que el número entra en la huella—. El estado fiscal de una venta es el **conjunto** de sus documentos.

La ley admite dos formas de rectificar, y conviene saber cuál es la nuestra:

| | Qué dice el documento | Cuándo |
|---|---|---|
| **Por diferencias** ← *la de aquí* | solo la diferencia (−2,40 €) | devoluciones, descuentos, impagos |
| Por sustitución | el importe corregido entero, más el rectificado | errores de la factura (precio mal, NIF mal) |

⚠️ Y *sustitución* aquí **ya significa otra cosa** (el canje simplificada → completa, vía `sustituye_a`): usar la palabra para dos mecanismos distintos es pedir un lío.

**Lo que faltaba no era fiscal, era de pantalla**, y se añadió: la ficha cierra con «Facturado · rectificado · **Neto**» y, cuando hay rectificativas, explica la regla en una línea — sin eso, ver la completa intacta por 3,72 € después de haber devuelto 3,72 € **parece un fallo del programa**. Las rectificativas van sangradas y dicen a qué factura corrigen.

- ⚠️ La suma va **en céntimos enteros**: en coma flotante `3.02 - 0.62 - 2.40` da `-4.44e-16`, que se pinta «−0,00 €» justo en la venta que quedó saldada.
- ⭐ **Un test corrigió el diseño de quien lo escribió**: el resumen salía solo con varias facturas **vigentes**, y con una simplificada canjeada hay **dos filas de 3,72 € en pantalla y una sola cuenta** — o sea el caso donde más falta hace. Manda `facturas.length`.

### La limpieza, y el `NOT VALID` cerrado (079)

`limpiar_datos_de_prueba()` se llevó el pedido del 14/08 y sus cuatro facturas. **Antes de ejecutarla se hizo inventario**, porque borra bastante más que facturas: 0 empleados, 0 cuentas no-admin (la de admin se queda), y el recálculo de stock resultó ser **un no-op** (ya cuadraba). Después, el CHECK de la 076 **quedó convalidado**.

⭐ **Y lo que costó esperar un día, que es lo aprovechable**: `VALF202600100` llevaba el NIF del propio negocio como receptor, así que al devolver ese pedido **las dos rectificativas salieron SIN receptor**. La válvula de la 077 hizo lo correcto —heredarlo habría abortado un reembolso ya cobrado— pero el precio fue **emitir dos documentos peores**. Un dato de prueba malo no se queda en su sitio: contamina lo que se construye encima.

### La línea de tiempo decía mal cuánto se devolvió, y lo decía dos veces

Dos números distintos compartían uno solo. ⚠️⚠️ **`transacciones_pago.importe` en un reembolso es el ACUMULADO devuelto del cargo, y TIENE que serlo**: `totalesReembolsados` saca el total tomando el **MÁXIMO** de esa columna, no la suma, porque el mismo reembolso se registra dos veces (panel y webhook) con `evento_id` distinto. Pero el evento de la ficha usaba ese mismo importe.

**El resultado real**: una segunda devolución de 2,40 € sobre un pedido que ya llevaba 0,62 € escribió «Devolución de **3,02 €** · 3 × Galleta Festival Sabor Chocolate». Esas galletas costaban 2,40 €, y su propia rectificativa decía −2,40 €: **la ficha y el documento fiscal se contradecían sobre el mismo dinero**.

Y al mirarlo apareció la otra mitad: el webhook anotaba **siempre** su evento, también cuando `charge.refunded` es el eco de la devolución que lanzamos nosotros. Cada devolución del panel escribía **dos** «Devolución» seguidas, y como la del webhook lleva el acumulado, la segunda contradecía a la primera. Ahora solo se anota **si trae algo nuevo** —el mismo `esNuevo` que ya evitaba el doble correo, y cuyo comentario *ya decía* que el evento con nombre lo había dejado `ReembolsosService`—; y si la devolución se hizo en el panel de Stripe, se anota con **lo devuelto de nuevo**. La transacción se guarda siempre.

⚠️ `InventarioService` **no tenía spec** y esa línea decide ahora el importe de **todos** los eventos, no solo los de reembolso. Se le hizo uno.

### La prueba de fuego, con dinero real

Pedido `260815017972` (3,72 €), de la compra a la devolución total en 6 minutos: simplificada sola → canje a `VALF202600100` → PDF y envío → dos devoluciones parciales con rectificativa automática.

- **La suma de las rectificativas: base 3,38 / cuota 0,34 = exactamente lo que declaró la venta.** 3T con repercutido **0,00 / 0,00**.
- **El historial**: «Devolución de 2,12 €» (0,62 + 1,50) y «Devolución de 1,60 €» (0,80 + 0,80), **una línea por devolución**. Ayer la segunda habría dicho 3,72 € y habría salido dos veces.
- ⭐ El receptor salió con **NIF distinto del emisor**, así que las dos rectificativas **heredaron receptor**: el efecto del dato malo desapareció con la limpieza.
- Cadena intacta, 0 anomalías en `factura_eventos`, 0 descuadres de stock.

⚠️ **Y lo que hay que decir aunque saliera bien: estos importes NO discriminan el fallo del céntimo.** Con 2,12 € y 1,60 €, la aritmética vieja da exactamente lo mismo. Esta prueba confirma todo lo demás; **la 078 la prueban los ensayos A y B**. El caso que sí lo distingue con este pedido sería devolver **las dos galletas en dos operaciones separadas** (0,80 y 0,80) y el resto después: la vieja daría 0,73 + 0,73 + 1,93 = **3,39**, un céntimo por encima de la base de la venta.


## ⭐⭐ HECHO EL 2026-08-14 (cont.) — el número de factura, y el aviso que mentía (074 y 075)

⚠️⚠️ **LAS DOS MIGRACIONES ESTÁN APLICADAS EN EL REMOTO Y COMMITEADAS, PERO *SIN PUSHEAR*.** Hay que pushear para que el repo y lo desplegado no divergan. **No hay ventana de despliegue que cuidar**, y conviene saber por qué: la API no construye el número (lo lee), y el panel pinta los avisos por lo que llegan sin tener ninguna clase escrita a mano. O sea, el código desplegado hoy ya funciona con la BD nueva. Los cambios de código son un comentario y un símbolo muerto que se quita.

### Lo que se encontró al empezar, y que este documento no decía

Mirar la BD antes de tocarla destapó **tres cosas que faltaban aquí**:

| | |
|---|---|
| **Hubo una segunda venta** (`260814010306`) | El trigger le emitió **su simplificada sola** y después se **canjeó a completa**. ⭐ **El canje ha funcionado en producción** y no estaba escrito |
| **20 productos**, no 13 | Jonathan amplió el catálogo |
| El 3T está en **−24,64 €**, no en −25,10 | La segunda venta movió el devengado (9,28 base / 0,92 cuota, 2 documentos) |

**La lección**: este fichero se escribe al final de una sesión y la tienda sigue viva entre sesiones. Al reanudar, **preguntarle a la BD antes de creerse el markdown**.

### El número de factura, y el formato triplicado (074)

Jonathan lo pidió así: «*quiero `VAL202600100`, el 2026 es el año en que estemos, y que empiece en 100 para que no inicie en 00001*». Hoy sale **`VALS202600100`**.

⚠️⚠️ **La letra de serie no podía desaparecer, y eso hubo que decírselo antes de tocar nada.** Sin ella, la simplificada y la completa de la **misma venta** imprimirían las dos `VAL202600100`: dos documentos contables con el mismo número. Y el **RD 1619/2012 art. 15.2** exige serie propia para las rectificativas, así que esa no se funde con nada. La letra va dentro del prefijo: **`VALS` · `VALF` · `VALR`**, y él eligió esa opción.

⚠️⚠️ **Y de paso salió un fallo latente que ya estaba ahí**: el formato vivía **triplicado** —la columna generada (072 §3), el motor (072 §7) y su reescritura (073 §3)—. Y no eran tres copias inocentes: **la huella se calcula del número que arma el motor, y el que se imprime sale de la columna generada.** Mientras coincidan no pasa nada; el día que difirieran, la cadena de Verifactu estaría **certificando un número distinto del impreso**, y nadie lo habría visto porque las tres expresiones son correctas por separado. Ahora hay **una** función, `factura_numero()`, y las tres la llaman.

**Arrancar en 100 es legal**: la ley exige numeración **correlativa y sin huecos**, no que empiece en uno. Una serie que empieza en el 100 no tiene huecos — no existió ninguna del 1 al 99. Vive en `factura_correlativo_inicial()`, y así **la limpieza de pruebas lo hereda gratis**: borra los contadores y el motor los recrea con ese valor.

⭐ **Por qué se borraron las tres facturas en vez de renumerarlas**: una factura emitida **no se modifica** (`trg_factura_inmutable`), y aunque se saltara el trigger, **el número entra en la huella** — cambiarlo obliga a recalcular la cadena entera. Borrar es lo único que se puede hacer **hoy**, porque el trigger solo lo permite **antes del arranque fiscal**. Si alguien reaplicara la 074 con la tienda ya arrancada, **se abortaría sola**: eso es la red, no un descuido. Los pedidos, el stock y las cuentas **no se tocaron** — esto no fue la limpieza.

- ✅ `SET EXPRESSION` sobre la columna generada funciona porque el remoto es **PostgreSQL 17.6**. En 15 habría que tirar la columna y recrearla, y eso arrastra la vista `libro_facturas_expedidas`, que la referencia vía `f.*`. **Se comprobó la versión antes de escribir la migración.**
- ✅ **Y una columna generada SÍ acepta una función propia** marcada `immutable`. Era la parte que podía no funcionar, y se ensayó primero.
- Se quitó **`FACTURA_SERIES`** de `@valatino/types`: espejaba `serie_de_tipo()` y **no lo usaba nadie**. Un espejo que nadie consume es un espejo que nadie revisa cuando la BD cambia.

**Ensayo en transacción revertida, 15/15**: el formato, las tres series, los contadores, «emitir las que faltan» (`VALS202600100` y `VALS202600101`), el canje (`VALF202600100` sustituyendo a `VALS202600101`), la cadena intacta y la sustituida fuera del libro.

### El aviso del 303 que había pasado de incompleto a FALSO (075)

La 068 puso un aviso **incondicional** que decía «todavía no existe la serie de facturas a clientes». Desde la 072 **existe**. Un aviso incompleto es mejorable; **un aviso falso en un informe que se presenta a Hacienda es peor que no tener aviso**, porque quien lo lea deja de creerse los demás.

⭐⭐ **Y la trampa de arreglarlo mal era borrarlo a secas**: con la tabla de facturas vacía el informe se habría quedado **callado**, y callar cuando no hay ni una factura para ventas que sí declaran su IVA es **tranquilidad falsa** — el mismo fallo con el signo cambiado. Así que se convirtió en dos avisos que **cuentan y se callan solos**:

| Aviso | Qué dice | Gravedad |
|---|---|---|
| `venta_sin_factura` | «N venta(s) devengadas sin factura», con los números de pedido | grave |
| `devolucion_sin_rectificativa` | «N devolución(es) sin factura rectificativa» | aviso |

⚠️⚠️ **El predicado de `venta_sin_factura` es EL MISMO que usa `emitir_facturas_pendientes`, y tiene que serlo**: si el aviso contara una cosa y el botón «emitir las que faltan» emitiera otra, el panel se contradiría a sí mismo y nadie podría saber cuál de los dos miente.

⚠️ **No se mira `vigente`, a propósito**: una simplificada sustituida no cuenta en el libro, pero su venta **sí** tiene documento (la completa que la sustituyó). Filtrar por vigencia haría que **cada canje inventara una venta sin facturar**.

El segundo aviso saca de este markdown algo que solo vivía aquí: que el libro y el 303 discrepan mientras no haya rectificativa. **La diferencia entre «lo sabemos» y «lo sabe quien firma»** es justo lo que estos avisos existen para cubrir.

**Verificado contra el remoto con línea base tomada ANTES de aplicar, 13/13.** El más importante:

- **D1 · los importes NO se han movido** — comparación `jsonb` del bloque `totales` entero, no campo a campo.
- **E3 · ⭐ emitiendo las que faltan, el aviso se calla solo.** Es la propiedad que distingue esto de haber borrado el aviso.
- **E5 · facturar no mueve el resultado** (−24,64): vuelve a demostrar que la liquidación va por `devengado_el` y es independiente de la facturación.

⚠️ **Regla para lo que venga, y está escrita en el tipo `LiquidacionIvaAviso`**: un aviso se condiciona a **un estado del mundo**, nunca a una fase del desarrollo. Si se condiciona a «esto todavía no existe», el día que exista el aviso miente y nadie se acuerda de él.

### ✅ LA LIMPIEZA SOBREVIVE AL CANJE, y el motivo hay que apuntarlo

Antes de decirle a Jonathan que podía limpiar sin riesgo, se **ejecutó** contra el remoto en transacción revertida, y con el estado en que él quedará: **2 ventas con simplificada y una canjeada a completa**, o sea con `sustituye_a` poblado. Resultado: **3 facturas y 2 pedidos borrados, 0 descuadres de stock**.

⚠️⚠️ **Y funciona por un motivo frágil que no estaba escrito en ninguna parte.** `facturas_emitidas.sustituye_a` (y `rectifica_a`) se referencian **a la propia tabla con `ON DELETE RESTRICT`**, y en Postgres `RESTRICT` **no se puede diferir**: se comprueba a lo largo de la sentencia, no al final de la transacción. Lo que salva a la limpieza es que borra **todas las facturas en UNA SOLA sentencia** (`delete from facturas_emitidas where id is not null`), así que cuando se comprueba la simplificada, la completa que la señalaba ya no está.

**Si alguien trocea ese DELETE** —por lotes, por serie, por ejercicio, «para que sea más seguro»— **la limpieza se rompe con el error del RESTRICT** en cuanto exista un canje. Es la hermana no detectada de la mina que arregló la 073 con `pedido_id`. No hay que arreglar nada hoy: hay que **no trocear ese DELETE**.

Comprobado también que la limpieza **conserva** los datos fiscales del emisor y el IBAN (no hay que volver a teclearlos), los 20 productos con sus fotos, las 2 facturas de compra con sus 23 líneas, el proveedor y los 6 cargos con sus plantillas — y que la numeración vuelve a arrancar en **`VALS202600100`**.

⭐ **Y de paso confirmó la 075 en un estado que no se había probado**: con la base limpia, el 303 vuelve a **−25,10 €** (solo compras) y el único aviso que queda es `sin_arranque_fiscal`. Los dos nuevos **se callan solos**, que es exactamente para lo que se escribieron.

## ⭐⭐ LA PRIMERA OPERACIÓN COMPLETA CON EL FORMATO NUEVO, Y LOS DOS DEFECTOS QUE DESTAPÓ (2026-08-14, cont. 2)

Jonathan limpió la base y cursó **una compra entera desde la web**. Cursó bien:

| | |
|---|---|
| Pedido | `260814015565` · **3,02 €** · bizum · **ENVIADO** |
| Líneas | Galleta Festival Chocolate 3 × 0,80 · Quipitos Pops 1 × 0,62 |
| IVA | base **2,75** + cuota **0,27** al 10 % |
| Simplificada | **`VALS202600100`** — emitida sola **1 s después del cobro** |
| Completa (canje) | **`VALF202600100`** |
| Libro | la `VALS` queda **no vigente**, «sustituida por `VALF202600100`» |
| Cadena · stock · reservas | intacta · **0 descuadres** · **0 colgadas** |
| Correos | confirmación y «va en camino», los dos registrados |
| 303 del 3T | **−24,83 €** · y **el único aviso es `sin_arranque_fiscal`** |

⭐ **Ese último dato es la 075 verificada en producción**: con toda venta facturada y sin devoluciones, los dos avisos nuevos **se callan solos**. Y el desglose de la factura es idéntico a `pedido_iva`, o sea la regla de copiar y nunca recalcular funcionando sobre dinero real.

### Pero el documento tenía dos defectos que NADA impedía → migración 076

**1. ⚠️⚠️ Emisor y receptor con el MISMO NIF.** `Z4194001W` en los dos lados y la misma dirección. El nombre cambiaba —«Leydy Jhoanna Mendoza Sanchez» vendiendo a «Yonathan Jimenez Duque»— y **eso es justo lo que lo hace fácil de pasar por alto: el NIF es la identidad, no el nombre**. La 073 validaba que el NIF tuviera *forma* válida, no que fuera de otra persona.

El arreglo va en **dos sitios, y no es duplicar la regla** — es la forma de la 069 con `fecha_factura`:
- el **CHECK** `facturas_receptor_no_es_el_emisor` es el **suelo**: vale para cualquier vía, incluida una inserción a mano por SQL, y ninguna función futura puede olvidarlo;
- el **`raise`** en `emitir_factura_completa` es el **mensaje**, porque un CHECK solo dice «violates check constraint».

~~🔴 **PENDIENTE PEQUEÑO, Y HAY QUE CERRARLO**~~ → **CERRADO en la 079** (2026-08-15): la limpieza se llevó `VALF202600100` y el CHECK quedó **convalidado**. Lo de abajo se conserva porque explica por qué nació provisional. El CHECK estaba **`NOT VALID`** porque `VALF202600100` violaba la regla y un CHECK normal no se podría ni crear. Se eligió eso en vez de borrar la factura de Jonathan sin preguntarle. En cuanto esa factura desaparezca —con `limpiar_datos_de_prueba`, o borrándola a mano mientras no haya arranque fiscal— se cierra con:

```sql
alter table public.facturas_emitidas validate constraint facturas_receptor_no_es_el_emisor;
```

**2. ⚠️ La población de un dato fiscal era texto libre, en las DOS rutas.** El emisor de TI → Ajustes hacía `trim()` y adentro; el receptor de la factura, igual. Por eso el domicilio del negocio se guardó como **«españa»** y salió impreso en la primera factura real, y por eso `VALF202600100` quedó con **«Mejorada del campo»** en minúscula mientras el pedido de esa misma venta guardaba la forma oficial.

⚠️⚠️ **Y lo que más escuece: la comprobación que lo habría cazado YA EXISTÍA.** `municipioCanonico("28001", "españa")` devuelve `null`, está probado con 264 tests desde la 041… y estas dos rutas no lo llamaban. **Un documento contable no puede validar menos que una etiqueta de envío.**

⭐ **La causa de fondo, que es la lección reutilizable**: `ubicacionParaGuardar` vivía **suelta dentro de `direcciones.service.ts`**, así que nadie más podía importarla. Ahí está el coste real de encerrar una regla de negocio en una función privada — no es que estuviera mal escrita, es que era **inalcanzable**. Se movió a `apps/api/src/common/datos/ubicacion.ts` y ahora la usan las tres rutas. La provincia deja de guardarse tal como llega: **se deriva del CP** en las tres.

En pantalla, los dos formularios del panel pasan a un componente compartido, `components/ubicacion/CodigoPostalYPoblacion.tsx`, con la regla entera: el CP manda, la población sale de un desplegable **acotado** por CP, hay salida a la provincia entera si la tabla de CP tiene una laguna, y la provincia se muestra **sin poder editarse** (la API la recalcula, y un campo editable cuyo valor se tira es una invitación a pelearse con el formulario).

🔜 **`DireccionForm` (checkout y perfil) sigue con su propia copia de esa lógica, y NO se migró a propósito**: está en la ruta del dinero y la web **no tiene tests de componentes**, así que ese cambio quiere hacerse mirando la pantalla, no de paso. Es el tercer consumidor pendiente.

### ⚠️ El ensayo falló la primera vez, y fue lo más útil de la sesión

`G3` comprobaba que se rechazara el NIF propio. **Rechazó** — pero por el **CHECK**, con el mensaje genérico, porque en ese ensayo se había aplicado el §1 y no el §2. Dos cosas salieron de ahí:

1. **El suelo funciona de verdad**: la RPC no tenía guardia y la fila no entró igualmente.
2. **Una aserción de «rechaza» habría dado por bueno un mensaje inútil.** Es literalmente la lección que la 073 ya había dejado escrita con el `text[] || 'NIF'`, repitiéndose. Por eso el ensayo **imprime el mensaje**, no solo el resultado.

Repetido con el §2: **6/6**, con el mensaje accionable, cazando el NIF en minúsculas y con espacios alrededor, y con el error de *forma* apareciendo primero — que es el orden correcto, porque teclear mal el NIF es más probable que poner el propio.

**+10 tests** en `contabilidad.service.spec.ts`, que **no cubría ninguna de las dos rutas**. 688 tests, `type-check` y **build de producción** en verde.

## ⭐ HECHO EL 2026-08-14 (cont. 3) — pedido ↔ factura, los dos sentidos

Jonathan lo pidió como dos cosas («accesos directos entre pedidos y facturas» y «que aparezca la simplificada en el pedido como consulta») y **son la misma pieza**. **Sin migración**: el dato ya existía.

- **La ficha del pedido** gana el bloque «Facturas de esta venta»: número, tipo, fecha e importe, y el canje contado como es — **una simplificada sustituida no se tacha**, porque sigue existiendo y no se anula jamás; se dice **quién la sustituyó**, que es el dato útil.
- Se lee de la **vista** `libro_facturas_expedidas`, no de la tabla, así que `vigente` **viene calculado**. Deducirlo en la ficha sería una segunda copia de la regla de la 073 §5 — la que evita contar el IVA dos veces.
- **El camino de vuelta**: la columna de pedido del libro enlaza a la ficha.

### ⚠️⚠️ NO HAY FORMULARIO FISCAL EN LA FICHA, y es deliberado

El botón lleva a **Contabilidad → Facturas con la venta ya elegida** (`?pedido=<uuid>`) en vez de repetir ahí los cinco campos del receptor. Duplicarlo significaría duplicar **el aviso del emisor, la validación del NIF y el desplegable de población acotado por CP** — y esta misma sesión costó dos migraciones justamente porque la misma regla vivía en varios sitios y una se quedó atrás. Sigue siendo un atajo: un clic y el formulario ya sabe de qué venta hablas.

Si algún día se quiere emitir sin salir del pedido, **lo que hay que mover es el formulario a un componente compartido**, no copiarlo.

### Tres detalles que no se ven pero evitan una pantalla rota

1. ⚠️ **Los dos atajos se aplican UNA sola vez.** Sin eso, cada refresco de la lista —Realtime en pedidos, recargar facturables al emitir— volvería a seleccionar o a reabrir, **deshaciendo lo que la persona acabara de hacer**, incluido el `setPedidoId("")` de después de emitir.
2. ⚠️ **Si el objetivo no está en la lista, se dice por qué**: ya tiene su completa, o el pedido es más viejo que los últimos 100 cargados. Un formulario en blanco sin explicación parece una pantalla perdida, no un enlace caducado.
3. ⚠️ **Un fallo al leer las facturas no tumba la ficha**: se registra y se sigue con la lista vacía, que la pantalla ya sabe pintar. Los artículos y el historial son lo que alguien vino a ver.

### ⚠️⚠️ El receptor NO se manda, y el `select` explícito no es la única defensa

El endpoint del detalle lo sirve **`pedidos:lectura`**, que tiene todo el equipo, y el `receptor` de una factura son **el NIF y el domicilio fiscal del cliente**. El `select` pide siete columnas — pero además **las filas se mapean campo a campo, no con un `as`**: un `select` es fácil de cambiar a `*` sin pensarlo, y con el mapeo ese descuido no filtra nada. **Es la diferencia entre confiar en que nadie toque una cadena y que no importe si la tocan.**

Emitir exige **`contabilidad:edicion`**, no el permiso de pedidos: quien mueve estados no tiene por qué poder emitir un documento fiscal.

### De paso: `Pedido` gana `devengado_el`

Existía en la BD desde la 068 y no estaba en el tipo. **Es el único signo de «esta venta existe fiscalmente», y no se deduce del estado**: un pedido tiene fecha de devengo si y solo si el cobro ocurrió, así que los `PENDIENTE_PAGO` y los cancelados antes de cobrar quedan fuera solos. Cualquier lista de estados escrita aparte sería una segunda regla que algún día discrepe.

## ⭐⭐⭐ HECHO EL 2026-08-14 (cont. 5) — LA RECTIFICATIVA, y con esto la Capa 2 está cerrada (077)

La pieza que el propio sistema venía pidiendo: desde la 075 el 303 avisaba «N devolución(es) sin factura rectificativa» cada vez que había un reembolso. **Era el único sitio donde el sistema informaba de un defecto sobre sí mismo.**

El problema con números: se devuelve un pedido de 3,02 €. El **libro** seguía diciendo que se facturaron 3,02 y el **303** ya lo había neteado. Los dos tenían razón por separado y no cuadraban entre sí.

### Las cuatro decisiones de fondo, que hay que respetar si se toca

1. ⚠️⚠️ **LOS IMPORTES VAN EN NEGATIVO.** Es lo que hace que el libro y el 303 digan lo mismo **sumando**: el 303 calcula `repercutido = devengado − rectificado`, así que con base y cuota negativas, `sum(total)` de las vigentes del libro **es** el repercutido. Con importes positivos habría que saber restar por tipo de documento — una segunda regla que algún día alguien no aplicaría.
2. ⚠️⚠️ **LA ARITMÉTICA SE COPIA DEL BLOQUE `rectificado` DE LA 068 LÍNEA POR LÍNEA.** Por tipo de IVA: `con_iva = sum(importe)`, `base = round(con_iva/(1+pct/100), 2)` y `cuota = con_iva − base`. **Restando, no multiplicando** — es lo que garantiza que base + cuota sea el importe devuelto al céntimo. Dos redondeos independientes pierden un céntimo, y ese céntimo separa el documento de la liquidación **sobre el mismo dinero**.
3. ⚠️⚠️ **LA FECHA DE OPERACIÓN ES LA DE LA DEVOLUCIÓN**, no la de la venta. El 303 mete el rectificado en el trimestre de `dia_fiscal(rl.created_at)`; si el documento dijera la fecha de la venta, quien cuadrara el libro contra el 303 encontraría la corrección **en dos trimestres distintos**.
4. ⚠️ **SE EMITE SOLA, CON UN TRIGGER DIFERIDO**, no desde la API. `registrar_reembolso_lineas` es el único sitio por donde nacen las líneas, así que cualquier vía que apunte una devolución emite su rectificativa — **incluidas las que no existen todavía**. Diferido porque cuando corre la primera línea ya están **todas**: sin eso la rectificativa saldría por el importe de una sola.

### ⚠️ Y ampliar la firma del motor obligó a `DROP FUNCTION` — la trampa de la 068, otra vez

Para que la rectificativa pueda declarar la fecha de la devolución hubo que añadirle dos parámetros a `emitir_factura`. **`create or replace` con más parámetros NO reemplaza: crea una SOBRECARGA**, y entonces `emitir_factura(id, 'simplificada')` —que es como lo llama el trigger de la simplificada— **queda ambigua y ese trigger empieza a fallar**. Se dropeó primero y se comprobó en el ensayo (`I10`).

### ⚠️⚠️⚠️ LA REGLA QUE MANDA SOBRE TODAS: esto no puede tumbar un reembolso

Cuando el trigger corre, **el dinero YA salió de Stripe**. Un fallo aquí convertiría *una devolución hecha* en un error en pantalla. Por eso la emisión va dentro de un bloque de excepciones — la misma regla que `registrarLineas` en la API («nunca lanza: se llama con el dinero ya salido»).

⭐ **Y lo que hace aceptable atrapar todo es que el fallo NO queda en silencio**: se anota como `rectificativa_fallida` y el aviso `devolucion_sin_rectificativa` del 303 **sigue cantando** hasta que el documento exista. La red estaba puesta antes que el trapecio.

### Dos minas que aparecieron al cruzar piezas, no dentro de ninguna

1. **Una venta sin factura previa no se puede rectificar**, y seguir adelante lanzaría el CHECK `facturas_rectifica_coherente` **dentro de la transacción de un reembolso ya cobrado**. Se para antes y se anota.
2. **El receptor se hereda de la factura rectificada** — pero `VALF202600100` (la prueba del 14/08) lleva el NIF del propio negocio como receptor, y la 076 lo prohíbe. Heredarlo sin mirar haría que **rectificar ESE pedido abortara el reembolso por un dato de prueba de hace días**. Se emite sin receptor y se anota.

### El ensayo: 14/14, y los dos que valen

Contra el remoto, en transacción revertida, con **`set constraints all immediate`** para forzar el trigger diferido (sin eso no correría hasta el commit, y ahí se revierte):

- **I3 · el desglose de la rectificativa es EXACTAMENTE el negativo del bloque `rectificado` que devuelve `liquidacion_iva`.** Comprobado contra la propia RPC, no contra un número escrito a mano.
- **I4 · ⭐ `sum(total)` de las vigentes del libro = 0,00 = el repercutido del 303.** Es el pago de haber puesto los importes en negativo, con una devolución total y datos reales.

Además: el aviso se calla, la cadena sigue intacta, rectifica a la **vigente** (no a la simplificada sustituida), la fecha de operación es la de la devolución, y dos llamadas dan la misma factura.

### Lo demás que trajo

- **El PDF imprime «Rectifica a la factura VALF202600100».** Sin esa línea **el documento no es válido** (RD 1619/2012 art. 15), así que se comprueba en el **texto de dentro del PDF** y no en el objeto. Para eso el spec gana `textoDe()`, un extractor de los flujos — porque `expect(pdf.length > 1000)` no prueba nada de lo que importa.
- **`factura()` pasa a leer de la vista**, así `vigente`, `sustituida_por` y `rectifica_a_numero` vienen calculados. De paso, el envío deja de hacer una consulta aparte solo para `vigente`.
- **`emitir_rectificativas_pendientes` se expone** en la ruta que ya existía, para no dejarla como código muerto. Las simplificadas van **primero**: una rectificativa necesita una factura vigente a la que rectificar.

### 🔜 Lo único que falta de esto

~~🔴 **Devolver un pedido de verdad desde el panel y ver la rectificativa aparecer sola** en la ficha, con su PDF.~~ → **COMPROBADO EN PANTALLA** el 2026-08-15, dos veces: primero con el pedido del 14/08 y después con la operación entera de `260815017972`.

## ⭐⭐ HECHO EL 2026-08-14 (cont. 4) — la factura en PDF, y el botón de mandársela al cliente

Lo que Jonathan pidió: *«que cuando ingrese al pedido, y en la parte de la factura ya sea simplificada o final se pueda dar click y muestre el PDF y un botón enviar al cliente»*. Está.

⚠️⚠️ **SIN PROBAR EN PANTALLA NI EN UNA BANDEJA DE ENTRADA.** Ver «lo que falta» abajo.

### Y una corrección de criterio, porque el argumento era mío y era flojo

Al proponer «las tres, en ese orden» se dejó el PDF para el final con el argumento de que así sabría maquetar los tres tipos de documento. **Mirando qué necesita el PDF de verdad, ese argumento no aguanta**: imprime `base_total`, `cuota_total` y `desglose` **tal como están en la fila**, y no le importa cómo se calcularon. Añadir la rectificativa después es una variante de cabecera y una línea de referencia — no rehacer la maqueta. Por eso el PDF fue primero.

### `pdfkit`, y por qué no hay ninguna tipografía empotrada

- **`pdfkit` y no `pdf-lib`**: el segundo está pensado para *modificar* PDF; el primero para *generarlos*.
- ⭐ **Las Helvetica de serie usan WinAnsi, que ya cubre acentos, «ñ» y «€»**, así que **no se empotra ningún TTF** y el despliegue de Render no carga cientos de KB. **Comprobado en el PDF generado**: `<31352c31322080>` es «15,12» seguido de `0x80`, que en WinAnsi **es el €**.
- Las métricas `.afm` de pdfkit viven en `node_modules` y el runtime las resuelve desde ahí; Render las instala. Comprobado.

### Las decisiones que hay que respetar si se toca esto

1. ⚠️⚠️ **El PDF se genera al pedirlo y NUNCA se almacena.** No es por ahorrar espacio: la fila está encadenada por huella y es inmutable, y un PDF guardado sería un **segundo sitio que puede divergir**. El día que divergieran, nadie sabría cuál de los dos enseñar a Hacienda.
2. ⚠️⚠️ **`enviarFactura` es el ÚNICO correo de la tienda que LANZA si falla.** Todos los demás salen detrás de algo que ya ocurrió, y ahí tragarse el fallo es correcto —un SMTP caído no puede tumbar una venta—. Este lo dispara una persona esperando la respuesta: devolver `false` en silencio pintaría un «enviada» sobre un correo que no salió, **y nadie volvería a intentarlo**.
3. ⚠️⚠️ **Solo se manda si la factura es `vigente`, y el guardia está en el SERVIDOR**, no solo en el botón. Una simplificada canjeada sigue existiendo, pero el documento válido es la completa: mandar la sustituida le pone al cliente en la mano un papel que el libro ya no cuenta, y él no tiene forma de saberlo.
4. **Reenviar sí se permite** —la gente pierde correos— **pero cada envío deja su evento `enviada`** en `factura_eventos`, con a quién y cuándo. Así el libro responde «¿se le mandó?». **No hizo falta migración**: `evento` es texto libre.
5. **El PDF va ADJUNTO, no enlazado.** Un enlace exigiría una URL pública a un documento con el NIF y el domicilio del cliente dentro: o un token que mantener —y que caduca justo cuando alguien busca su factura de hace un año— o algo al alcance de quien adivine la dirección.
6. **`apiFetchBlob` en la web, y hace falta**: la API se autentica con el **Bearer** de Supabase, así que un `<a href>` al endpoint del PDF daría **401** — o peor, la pantalla de login en una pestaña nueva. Se extrajo la parte común (sesión, cabeceras, mapeo de errores) en vez de duplicarla.

### ⚠️ Un fallo real que cazó el test, y una corrección a quien lo escribió

El formateador de importes hacía `Math.round((abs(n) - entero) * 100)`. Con `0.999` eso da `entero = 0` y `centimos = 100`, y el `padStart(2, "0")` no recorta nada: imprimía **«0,100 €»**, tres decimales en un documento fiscal. Arreglado pasando a **céntimos enteros antes de partir**.

Y de paso el test **corrigió la expectativa de quien lo escribió**: se esperaba que `2.675` diera `2,68` y da `2,67`. Es lo correcto —el double de ese literal es `2.67499…`— y además no es alcanzable, porque todo lo que llega viene de columnas `numeric(12,2)`.

### Cómo se verificó, que no fue «es un PDF válido»

Se generó con datos reales y **se leyó el texto de dentro** descomprimiendo los flujos. Eso comprobó lo que un `expect(pdf.length > 1000)` no ve:

- **las dos fechas salen solo cuando difieren** — la completa lleva expedición 14/08 y operación 13/08; la simplificada, una sola;
- **la simplificada DICE por qué no lleva destinatario** en vez de dejar media página en blanco que parece un fallo de maqueta;
- el desglose por tipo cuadra, y las dos filas de total solo aparecen con más de un tipo;
- la huella de 64 caracteres **cabe en el pie** sin desbordar.

**16 tests** del generador (incluido el caso `receptor: null`, que es el que tumbaría **toda** factura automática) y **704 en total** (413 API + 291 web).

### 🔜 Lo que falta de esto, y es de Jonathan

1. ~~🔴 **Pinchar una factura y ver el PDF en el navegador.**~~ → **hecho el 2026-08-15**.
2. ~~🔴 **Mandarse una factura a uno mismo y abrir el adjunto en una bandeja de entrada real.**~~ → **hecho**: los `enviada` de `factura_eventos` lo prueban, y `enviarFactura` es el único correo que **lanza** si falla, así que el evento significa que salió.
3. ⚠️ **El `Reply-To` sigue siendo un gmail** porque `valatino.es` no tiene MX. En un correo de factura queda raro; no bloquea.

### 🔜 La decisión sobre el PDF, ya ejecutada

Jonathan confirmó que **la factura hay que poder enviársela al cliente por correo**. Eso decide la vía: **se genera en el servidor** (`pdfkit` o `pdf-lib` en la API), no con los estilos de impresión del navegador. La vía sin librería era más barata y con maqueta en CSS, pero **el servidor no tendría fichero** y no se podría adjuntar nunca sin rehacerlo.

⚠️ Descartado **Chromium/puppeteer**: en el plan gratuito de Render es mala idea por memoria y arranque en frío.

⚠️ **Verifactu exige un QR en la factura** y sigue pendiente de la gestoría: al maquetar, dejarle el hueco.

⚠️ **No hay ninguna librería de PDF en el monorepo** (las de compra se *suben*, no se generan), así que es la primera dependencia de este tipo. Y cuando llegue: **se genera al pedirlo, no se almacena** — la fila es la verdad y un PDF guardado es el segundo sitio que puede divergir.

### 🔜 Lo siguiente, por orden

1. ~~Pushear y emitir las que faltan~~ → **hecho**. Jonathan limpió la base y cursó la operación entera; ver el bloque de arriba.
2. ~~🔴 **Mirar en pantalla el bloque de facturas de la ficha y los dos atajos.**~~ → **hecho el 2026-08-15**, y el bloque ganó además el **neto de la venta** (ver la sesión del 15).
3. ~~🔴 **Ver el PDF en el navegador, mandarse una factura a uno mismo, y devolver un pedido para ver su rectificativa aparecer sola.**~~ → **todo comprobado el 2026-08-15**, con la operación entera de `260815017972`.
4. ~~🔴 **Cerrar el `NOT VALID` del CHECK de la 076**~~ → **CERRADO en la 079** (2026-08-15), después de la limpieza.
5. ~~La rectificativa por devolución~~ → **HECHA** (077, cont. 5). **Con esto la Capa 2 de contabilidad está cerrada**: simplificada automática, completa a petición, rectificativa por devolución, el 303, el libro con su cadena de huellas y el PDF de los tres tipos.
6. **El logo y el pulido del PDF**, cuando Jonathan pase el modelo. Requisitos y la trampa del `nest-cli.json` en `factura-pdf.service.ts`.
7. **Migrar `DireccionForm` al componente compartido de ubicación**, con la pantalla delante: es checkout, o sea la ruta del dinero.
8. ⚠️⚠️ **Verifactu sigue pendiente de la gestoría**, y ahora es lo único grande que separa esto de estar listo para el arranque fiscal: el QR en la factura y confirmar que el orden de campos de la huella es el que exige la AEAT. **La cadena ya está y se puede recalcular antes del arranque** — que es justo la ventana que sigue abierta.

## ✅ LA 068 Y LA 069 ESTÁN DESPLEGADAS Y VERIFICADAS EN PRODUCCIÓN (2026-08-13)

**Todo lo de la liquidación del IVA está en pie**: migraciones aplicadas, código pusheado, Vercel y Render al día, y comprobado por HTTP.

### Cómo se comprobó que el deploy entró de verdad, que es lo que suele darse por hecho

Se tomó **línea base antes de pushear** y se comparó después. El discriminador limpio es que una ruta que **no existe** da 404 y una que existe pero está protegida da **401** — así se prueba que el código nuevo está arriba sin necesitar ninguna credencial:

| Ruta de `api.valatino.es` | Antes | Después |
|---|---|---|
| `GET /admin/contabilidad/iva` | **404** | **401** ✅ |
| `PATCH /admin/compras/:id/fecha-factura` | **404** | **401** ✅ |
| `GET /admin/dashboard` (control) | 401 | 401 |
| `GET /health` (control) | 200 | 200 |

**Render tardó ~90 s**, no los 10 minutos temidos. Y `valatino.es/backoffice/contabilidad` da **307** (existe y redirige por no haber sesión) frente al **404** de una ruta inventada, así que Vercel también está al día.

**Regresión de la tienda tras el deploy**: home, carrito, checkout y login a **200**, `www` en 308 al apex, `/productos` de la API a 200 y los productos saliendo en la home. Nada roto.

> ⚠️ **Ojo con `/productos` al comprobar regresiones, que ya me ha confundido una vez**: en la **API** es un listado y da **200**; en la **web** NO EXISTE como índice —solo hay `productos/[slug]`— y da **404, que es lo correcto**. Para comprobar la web hay que pedir `/productos/<slug>` de un producto real. Un 404 ahí no es una regresión.

### La ventana existió y se cerró sin incidencias

El cambio hacía que **la API fuera más estricta** (el DTO de compras exige `fechaFactura`) **y** que la web mandara un campo nuevo. Con `forbidNonWhitelisted: true`, **los dos sentidos rompían**:

| Estado transitorio | Qué pasaba |
|---|---|
| Web nueva + API vieja (lo que ocurre: Vercel llega antes) | La web manda `fechaFactura`, el DTO viejo no lo conoce → **400 «property fechaFactura should not exist»** |
| Web vieja + API nueva | La web no lo manda, el DTO nuevo lo exige → **400** |

Por la tabla de órdenes de más abajo esto es el caso «la API acepta un campo más», cuyo libro dice **dos pushes, API primero**. **Se hizo UN push, a conciencia**, y el motivo queda escrito porque vale para la próxima: la regla de los dos pushes existe por los **pagos**, donde un 400 es una venta perdida. Aquí no.

- **Afectaba a UNA pantalla**: «Compras → Registrar compra». El resto de la tienda —catálogo, carrito, los cuatro medios de pago, el panel— no se entera de nada.
- Es una operación **manual, rara (unas veces al mes) y que la hace una persona que está mirando**. Falla con un error visible y **se reintenta pulsando otra vez**. No se pierde dinero ni un pedido.
- La alternativa de dos pushes obligaba a dejar `fechaFactura` como `@IsOptional()` en el primero, y eso **crea un estado intermedio que alguien tiene que acordarse de apretar después**. Un `@IsOptional()` temporal que se queda es justo el tipo de deuda que no se ve.

⚠️ **La regla para la próxima vez, que es lo aprovechable**: antes de pushear, apuntar el código HTTP de las rutas nuevas; el salto **404 → 401** es la prueba de que el deploy entró, y no hace falta iniciar sesión para obtenerla. Mirar el HTML no sirve (lección del 05/08 con `NEXT_PUBLIC_API_URL`).

⚠️⚠️ **PERO ESO SOLO VALE PARA LA API, Y CONVIENE SABERLO ANTES DE FIARSE.** Se probó después, al desplegar el submódulo del 303, y el truco **no funciona en las rutas del panel**: el `middleware` redirige **cualquier** `/backoffice/*` con **307** cuando no hay sesión, exista la ruta o no.

```
/backoffice/contabilidad/iva            307   ← existe
/backoffice/contabilidad/inventado-xyz  307   ← NO existe
/backoffice/inventado-xyz               307   ← NO existe
/ruta-suelta-xyz                        404   ← fuera de /backoffice sí distingue
```

Tampoco sirve el `buildId`: en App Router **ya no se expone** en el HTML (se intentó y no está). Y un build fallido de Vercel deja **la versión anterior viva**, así que que la tienda responda 200 tampoco prueba que el deploy nuevo entró.

**Conclusión honesta: un cambio que solo toca pantallas del panel no se puede verificar desde fuera sin sesión.** Se comprueba abriéndolo. Lo que sí se verifica siempre por HTTP es el lado de la API.

### Y la 069 se aplicó DESPUÉS del deploy, que era la condición

`facturas_compra.fecha_factura` ya es **NOT NULL** y `registrar_factura_compra` aborta con mensaje accionable si falta. **Aplicarla antes del despliegue habría convertido la ventana de minutos en una avería permanente**, porque la API vieja no mandaba el campo. Se comprobó el 404→401 primero y se aplicó después.

## ⭐⭐ HECHO EL 2026-08-13: la liquidación del IVA (modelo 303) — migración 068

**El 303 ya se calcula y tiene pantalla propia**: **Contabilidad → Liquidación de IVA** (`/backoffice/contabilidad/iva`; el módulo redirige ahí, como TI a Usuarios). Ver la sesión 2026-08-13 más abajo para las cuatro cosas que había que arreglar antes, que no se veían.

**Lo que queda de la Capa 2:**

1. ~~**Facturas a clientes**~~ → **HECHAS** (071, 072, 073). Ver el bloque de abajo.
2. ~~**Liquidación del IVA (modelo 303)**~~ → **hecha** (068). Informe por rango de fechas con devengado, rectificado por devoluciones, deducible y la diferencia, más los avisos de lo que NO está contando.

## ⭐⭐ HECHO EL 2026-08-13 (cont.): las facturas a clientes — migraciones 071, 072 y 073

Jonathan lo pidió así: «*nos falta el módulo de emitir la factura del pedido del cliente si lo solicita*». Y lo primero que apareció es que **eso es la segunda mitad de la función**: la completa a petición es un **canje** de la simplificada, así que primero toda venta tiene que tener la suya. Decidido con él:

| Decisión | Elegido |
|---|---|
| Alcance | **Simplificada automática + canje a completa a petición** |
| Quién emite | **El staff, desde el panel** (el autoservicio del cliente exigiría un acceso para invitados) |
| Verifactu | **Con la cadena de huellas desde el día uno**, sin esperar a la gestoría |

### Lo que hay

- **Cada venta devengada emite su simplificada sola** (serie `S`), la completa a petición la **sustituye** (serie `F`), y las rectificativas tendrán la `R`.
- **Contabilidad → Facturas emitidas** (`/backoffice/contabilidad/facturas`): el libro, el emisor de guardia, «emitir las que faltan», el estado de la cadena y el formulario de la completa.
- **TI → Ajustes** gana los **datos fiscales del emisor**. ⚠️ **Sin ellos no se emite NADA.**
- **680 tests** (+21 del dígito de control del NIF). Las tres migraciones ensayadas en transacción revertida contra el remoto antes de aplicar: **11/11, 16/16 y 11/11**.

### ⚠️⚠️ Lo que hay que saber para no romperlo

- **Las líneas van en `jsonb`, NO en una tabla hija** — y eso **contradice lo que este documento decía**. El motivo apareció al escribir la cadena: la huella tiene que cubrir el documento completo, y con una tabla hija el padre se inserta cuando aún no hay líneas que hashear.
- **La base y la cuota se COPIAN de `pedido_iva`**, jamás se recalculan. La 062 dejó un solo sitio que redondea; recalcular daría una factura que no cuadra con el 303 **sobre el mismo dinero**.
- **Es un CONSTRAINT TRIGGER DIFERIDO** (`trg_pedido_simplificada`). Tenía que serlo: el trigger de devengo es BEFORE INSERT en `pedidos` y en ese momento no existen ni las líneas ni `pedido_iva`. Diferido hasta el COMMIT, todo está en su sitio y no depende del orden alfabético de los triggers de `pedido_items`.
- **Sin emisor configurado NO se lanza excepción**: se anota en `factura_eventos` y se devuelve NULL. Corre en la ruta del dinero, y una casilla sin rellenar en Ajustes **no puede tumbar una venta**.
- **El cerrojo `pg_advisory_xact_lock(10072023)` va ARRIBA**, antes de la idempotencia. La cadena es global y el `for update` del contador es por serie: dos series podrían leer la misma «factura anterior» y **bifurcar la cadena**.
- ⭐ **`vigente` es lo que evita contar el IVA dos veces.** Cuando una completa sustituye a una simplificada **las dos existen** —una factura emitida no se anula jamás—, y solo cuenta la completa. No es un campo mutable «anulada»: se deduce de que otra factura la señale con `sustituye_a` (vista `libro_facturas_expedidas`).
- **La limpieza REINICIA los contadores.** Sin eso, la primera factura real sería la `S2026/00043` con cuarenta y dos huecos que no existieron.
- **Borrar una factura solo se puede antes del arranque fiscal**, y la regla vive en el trigger `trg_factura_inmutable`, no en la limpieza: así ninguna limpieza futura podrá olvidarlo. **Modificar una, jamás.**

### Tres fallos que aparecieron al cruzar piezas, no dentro de ninguna

1. ⚠️⚠️ **La 072 dejó una mina**: `facturas_emitidas.pedido_id` es `ON DELETE RESTRICT`, así que `limpiar_datos_de_prueba` **habría fallado en cuanto existiera una factura**. Confirmado en el ensayo con el error literal del RESTRICT, y arreglado en la 073 antes de que hubiera ninguna.
2. ⚠️ **Doble documento de la misma venta**: una venta facturada como completa sin haber tenido simplificada —pasa con las anteriores a configurar el emisor— la habría visto `emitir_facturas_pendientes` como «sin simplificada» y le habría emitido una. **El IVA contado dos veces.** El guardia se puso DENTRO del motor, no en cada llamador.
3. **`text[] || 'NIF'`** reventaba con «malformed array literal»: sin `::text`, Postgres resuelve el operador como `anyarray || anyarray`. La validación que debía **nombrar** lo que falta habría dado un error inútil. Y enseñó algo del test: uno que solo comprueba «rechaza» sin mirar POR QUÉ lo habría dado por bueno.

### La cadena de huellas funciona, y está probado como se prueba de verdad

En el ensayo se **deshabilitó el trigger de inmutabilidad, se manipuló una factura por la puerta de atrás y se volvió a activar**. `verificar_cadena_facturas()` la señaló por su número: `{"rotas": ["S2026/00002"], "intacta": false}`.

### Y un dato que vale más que los tests

La factura del único pedido real sale con **base 4,64 y cuota 0,46** — exactamente lo que el 303 declaró como devengado del 3T. **El documento y la liquidación cuadran al céntimo**, que es justo lo que la regla de copiar el desglose existe para garantizar.

## ⭐ LA PRIMERA FACTURA REAL, Y LO QUE ENSEÑÓ (2026-08-14)

Jonathan configuró el emisor y emitió **`F2026/00001`** desde el panel. Cursó bien:

| | |
|---|---|
| Documento | `F2026/00001` · completa · 5,10 € |
| Base / cuota | **4,64 + 0,46** al 10 % |
| Fechas | expedida **14/08** · operación **13/08** |
| Cadena | intacta, primera de la serie |
| Emisor | Leydy Jhoanna Mendoza Sánchez · `Z4194001W` |

Tres cosas quedaron demostradas **en producción**, no en un ensayo:

1. **La base y la cuota de la factura son las que declara el 303** en el devengado del 3T. Es la regla de copiar el desglose (nunca recalcular) funcionando.
2. **El 303 NO se movió**: sigue en **−25,10 €**. Emitir una factura no cambia la liquidación, porque liquida por `devengado_el`.
3. ⭐ **Las dos fechas salieron distintas y bien.** Se emitió a las **00:12 de Madrid**; en UTC eran aún las 22:12 del día 13, y la factura dice **14**. Es `dia_fiscal()` funcionando en el único momento del día en que se nota la diferencia.

Y el guardia de idempotencia asimétrica (073) **se probó solo el primer día**: como la venta ya tiene completa, «emitir las que faltan» no le añade una simplificada. Sin él habría creado una de más y **el IVA estaría dos veces en el libro**.

### ✅ RESUELTO EL 2026-08-14 (cont.): la población, y el número de factura que quiso Jonathan

La población decía «españa» (`Calle del Arco, 9 · 28840 españa (Madrid)`). **Corregido a `Mejorada del Campo`** en la 074 §7 — y no de memoria: sale de `porCP['28840']` del diccionario del INE del propio repo, la misma fuente que valida las direcciones de envío desde la 041. Un dato fiscal no se rellena a ojo (la lección de la 069 con `fecha_factura`).

Jonathan aprovechó para cambiar **el formato del número**, y de eso salió la sesión entera: ver «**El número de factura, y el formato triplicado**» más abajo. Resumen: las facturas de prueba se borraron, el formato es ahora **`VALS202600100`** y arranca en **100**.

### ⚠️ Se facturó un pedido REEMBOLSADO, y el libro y el 303 discrepan

`260813018694` está devuelto. Facturarlo no está mal —la venta ocurrió—, pero la devolución exige una **rectificativa**, que es justo la pieza pendiente. Mientras no exista:

- el **libro** dice que se facturaron 5,10 €,
- el **303** ya lo neteó (rectificado 4,64/0,46, repercutido **0**).

Los dos tienen razón por separado y no cuadran entre sí. **Se sabe por qué y es temporal.**

### 🔜 Lo que queda de esto

1. ~~🔴 **El aviso `sin_facturas_emitidas` del 303 ya MIENTE.**~~ → **ARREGLADO en la 075** (2026-08-14). Ver la sesión de abajo. Ahora son dos avisos que cuentan y **se callan solos**: `venta_sin_factura` y `devolucion_sin_rectificativa`.
2. **La rectificativa por devolución.** Tiene ya su columna (`refund_id`) y su índice único, pero necesita usar **exactamente** la aritmética del bloque `rectificado` de la 068, o el documento y el 303 dirían cosas distintas. ⚠️ Y tiene que poder emitirse **a máquina**: la vía del webhook corre sin nadie delante.
   - ⭐ **Y ya hay quien lo pida**: el aviso `devolucion_sin_rectificativa` de la 075 lo declara en el propio informe («1 devolución(es) sin factura rectificativa»), así que la discrepancia entre el libro y el 303 ya no vive solo en este markdown. **Se callará solo** el día que la rectificativa exista.
3. **El PDF.** ⚠️ Terreno nuevo: **no hay ninguna librería de generación de PDF en el monorepo** (las de compra se *suben*, no se generan). Cuando llegue, se genera **al pedirlo desde la fila**, no se almacena: la fila es la verdad y un PDF guardado es el segundo sitio que puede divergir.
4. **El atajo desde la ficha del pedido.** Hoy la completa se emite desde Contabilidad → Facturas eligiendo la venta. Falta el botón en el detalle del pedido, gobernado por `contabilidad:edicion` y **no** por el permiso de pedidos.

### Por qué esa venta no tiene simplificada (lo preguntó Jonathan)

Porque **es anterior al sistema**: devengó el 13/08 a las 06:00 y la migración 072 se aplicó esa misma noche, así que el trigger no existía y nunca llegó a dispararse. `sustituye_a` está vacío, el contador de la serie `S` **ni siquiera se ha creado**, y la pantalla lo dice al elegir la venta. **No es un fallo.** De la próxima venta en adelante, cada una emite su `S` sola y se ve en el mismo libro; al canjearla, la `S` se queda en gris con «sustituida por».

### ⚠️⚠️ SIGUE PENDIENTE DE LA GESTORÍA (pero ya no bloquea): Verifactu

El **RD 1007/2023** obliga a que los sistemas de facturación encadenen los registros por hash, no permitan borrado, lleven registro de eventos y pongan un QR en la factura. **Las fechas de entrada en vigor se han movido varias veces y no se dan por sabidas aquí**: hay que preguntarlo.

Importa **antes** de escribir la tabla, no después: encadenar por hash desde el día uno es barato y retrofitarlo es horrible. La buena noticia es que el diseño que exige es casi el que se quiere igualmente —inmutable, append-only, rectificativas en vez de ediciones—, así que se puede avanzar en esa dirección sin apostar por una fecha.

**Y el terreno ya está preparado**: el **arranque fiscal** (064) existe, así que la tabla de facturas nace sabiendo que hay un antes y un después. ⚠️ Cuando exista, la limpieza tendrá que borrar facturas **solo en modo pruebas** — tras el arranque ya se niega entera.

### 🔜 Lo demás, al volver

✅ **LAS FECHAS DE LAS DOS FACTURAS DE COMPRA, PUESTAS** (2026-08-13, Jonathan las dio de sus PDF y se aplicaron por RPC contra el remoto):

| Factura | Fecha de la factura | Registrada | Total c/IVA |
|---|---|---|---|
| `202521188` | **15/07/2026** | 18/07/2026 | 93,64 € |
| `202521893` | **05/08/2026** | 06/08/2026 | 115,78 € |

- Las dos **anteriores a su registro**, que es lo normal: el proveedor la expide y se anota unos días después.
- **Las dos caen en el mismo trimestre que su registro**, así que el 303 no se movió: el 3T sigue en **−25,10 €**. Confirma en la práctica lo que dice el diseño — la fecha de expedición es dato del libro, y el trimestre lo decide la de registro.
- El aviso `compra_sin_fecha_factura` **ya no aparece**. En el 3T quedan solo los dos estructurales: `sin_facturas_emitidas` (Capa 2 pendiente) y `sin_arranque_fiscal` (la tienda sigue en pruebas).
- ⚠️ **No se rellenaron a dedo con `created_at` en la migración, y fue deliberado**: sería inventar una fecha que va a un libro oficial, y lo peor de un dato inventado es que parece puesto (la lección textual de la 062 con `iva_pct`). Se esperó a tener el dato real. Con `created_at` habrían quedado 18/07 y 06/08, o sea **las dos mal**.

✅ **Migración 069 aplicada** (después del deploy, que era la condición): `facturas_compra.fecha_factura` es **NOT NULL** y `registrar_factura_compra` aborta con un mensaje accionable si falta —P0001, así que la API lo publica tal cual— en vez de con el `23502` genérico del motor.
- ⚠️ **La comprobación va ANTES del insert**, así que un intento sin fecha no deja factura a medias ni mueve stock. Se verificó en el ensayo (`FALLO A3`/`A4`).
- **La firma no cambia**: `p_fecha_factura date default null` se queda, y por eso aquí **no** hubo que hacer `drop function` (la trampa de la 039 que la 068 sí tuvo que sortear). Quitar el `default` daría «function does not exist», que es el error que menos ayuda.
- El guardia **nombra las facturas** que faltaran, porque «column contains null values» no dice cuál.

⚠️ **Pendiente pequeño de Jonathan**: si la caja de **Quipitos Pops Caja 24** existe de verdad en el almacén, meterla desde Inventario con un ajuste de tipo **«recuento»**. Se quedó a 0 en la limpieza del 12/08 por ser la unidad fantasma sin apunte; ahora sí quedaría registrada.

✅ **Los cuatro bugs del 2026-07-28 están probados por Jonathan y funcionan.** (Teléfono del cliente al panel, la ventana de calificación que se cierra al enviar, el mensaje honesto del reembolso y la coma en el importe.) Ya no hay nada pendiente de comprobar de esa sesión.

✅ **TODO LO DEL 2026-08-02 ESTÁ DESPLEGADO Y PROBADO POR JONATHAN.** Fue una sesión larga; esto es lo que quedó funcionando en producción:

| Qué | Estado |
|---|---|
| **Reembolso por artículos** (044) — elegir qué se devuelve, con reposición de stock | Probado de punta a punta |
| **Vista del cliente** — sus devoluciones, ficha del pedido con seguimiento, color en los estados | Probado |
| **Bizum** — activado por API de Stripe, verificado en un PaymentIntent real | Probado (pedidos `260802017882` y `260802011696`) |
| **Transferencia bancaria** (045-047) — el primer pago asíncrono de la tienda | Probado, incluido «Pago recibido» en el panel |
| **Cuenta de cobro editable en TI → Ajustes** (046) | Funcionando, con validación del IBAN |
| **Pedidos enlazados y notas en el historial** (049-050) | Funcionando |
| **Correos de la transferencia** (instrucciones + pago recibido) | Desplegado, **sin probar a mano** |
| **051-052** (madrugada del 3) — cancelar libera stock, y las reservas de un pedido son intocables | Desplegado y verificado en el remoto |

### 🔜 Lo único pendiente al volver

1. **Probar el correo de la transferencia**: hacer un pedido por transferencia y comprobar que llega el correo con el IBAN y el concepto, y que aparece en el histórico. Es lo único sin verificar en pantalla. ⚠️ **Lo que sí quedó cubierto el 2026-08-12 son los 5 tests que faltaban** (que el correo salga, a quién, y que un fallo de SMTP no se lleve el pedido): eso cierra el hueco de regresión, pero **no sustituye a la prueba** — nadie ha visto todavía ese correo en una bandeja de entrada.
2. **Probar de nuevo el escenario que falló** (`052`): pedido por transferencia → cerrar sesión → volver a entrar → pagar con Bizum. Ahora debe enlazarse y cancelarse el anterior. Verificado en seco contra el remoto, no en pantalla.
3. **Poner el IBAN definitivo** en **TI → Ajustes**. El que hay es de prueba: `ES33 9490 0934 2392 2994 3748`.
   - ⚠️ El que se dio originalmente (`ES48 9490…`) **no era válido**: su dígito de control es **33**, no 48. Ahora el panel lo valida al guardar.
4. ⭐ **Aplicar la CSP** (del 2026-08-11): está en `Report-Only`. Recorrer la tienda con la consola abierta —login, carrito y los cuatro medios de pago— y, si no salta ningún aviso, pasarla a obligatoria. Instrucciones en `next.config.mjs`.
5. La cola de siempre: ~~tests de la web~~ → **283** (falta cubrir componentes), ~~CI~~ → **montado**, accesibilidad, paso a producción real.

⚠️ **Sigue en pie**: conviene re-guardar la plantilla del correo de acceso en el Dashboard de Supabase. (~~`NODE_ENV` en `development`~~ → **ya está en `production`**, comprobado por API el 2026-08-11.)

⚠️ **Lección de la madrugada, que vale para lo que venga**: los dos fallos peores de la sesión (las reservas barridas, el `update … from` que aplica una sola fila) **no se vieron razonando el código, salieron al ejecutar el escenario contra datos reales en transacción revertida**. Con el stock de por medio, esa prueba en seco no es opcional.

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
2. **Tests de la web — sigue a 0.** Es el hueco más grande que queda: la API va por 292 y la web no tiene ni uno. Hoy la única red ahí es `pnpm turbo type-check`. Los sitios que más lo piden: el formulario de dirección (CP → provincia → municipio, y el vaciado de la localidad al cambiar de provincia), `direccionCompleta()`, el widget de calificación (el descarte recordado y el guardado al segundo toque) y el selector de permisos.
3. **CI.** Nada corre automáticamente: los tests y el `type-check` se lanzan a mano. Un push que rompa la API no se entera nadie hasta que Render falla.
4. **Paso a producción real** — ver los pendientes manuales de abajo (región EU, Stripe `live`, dominio propio).
5. **Accesibilidad**, sin auditar todavía.
6. **Correo de acceso: quitarse la dependencia de Supabase** (opcional, pero es el flujo más crítico). Su endpoint de plantillas dio un 502 y dejó el login enviando correos en inglés con enlace. Mitigado ya, pero la causa sigue ahí. Antes de nada, lo barato: **re-guardar la plantilla en el Dashboard**. Si vuelve a pasar, mandarlo nosotros con SendGrid vía **Send Email Hook** — `EmailModule` ya tiene las plantillas en español.
7. ~~**Cabo suelto pequeño**: la tolerancia al formato anterior de permisos (`permisos ?? []`)~~ → **quitada el 2026-08-12** (ver la sesión de ese día).

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
- **Aplicar migraciones al remoto**: por Management API (ahora directo con la tool MCP `apply_migration`), NO `supabase db push`. Última aplicada: **079** (el CHECK de la 076 convalidado, ya sin `NOT VALID`, con su propia comprobación para no dejar el repo diciendo que se cerró algo abierto). Antes la **078** (el céntimo de las rectificativas: base con **redondeo acumulado** sobre `pedido_iva`, que converge a la base de la venta cuando se devuelve todo; y el 303 **sumando el desglose de las rectificativas emitidas** en vez de recalcularlo, que era la misma aritmética duplicada). Antes la **077** (la rectificativa por devolución: `emitir_rectificativa` con la aritmética del bloque `rectificado` de la 068 en negativo, el trigger diferido sobre `reembolso_lineas` que no puede tumbar un reembolso, `emitir_rectificativas_pendientes`, `rectifica_a_numero` en el libro, y **dos parámetros nuevos en el motor que obligaron a `drop function`**). Antes la **076** (una factura no se emite a uno mismo: CHECK `NOT VALID` + el mensaje accionable). Antes la **075** (los dos avisos condicionales del 303, en vez del incondicional que había pasado a ser falso; solo lectura). Antes la **074** (el número `VALS202600100`: `factura_numero()` como única definición del formato, `factura_correlativo_inicial()` = 100, las series con prefijo `VAL`, y la población del emisor corregida). Antes las **071, 072 y 073** (los datos fiscales del emisor · el libro de facturas emitidas con su cadena de huellas y el trigger diferido de la simplificada · la completa a petición y la mina del `ON DELETE RESTRICT`; ver la sesión 2026-08-13 cont.). Antes la **070** (los documentos DISTINTOS de cada bloque de la liquidación; solo lectura). Antes la **069** (`fecha_factura` a NOT NULL, aplicada **después** de verificar el deploy por HTTP). Antes la **068** (la liquidación del IVA: `pedidos.devengado_el`, `facturas_compra.fecha_factura`, el reembolso total que apunta sus líneas, el módulo `contabilidad` y la RPC `liquidacion_iva`; ver la sesión 2026-08-13). Antes la **067** (la limpieza se lleva los empleados de prueba y toda cuenta que no sea `admin`; los cargos NO se tocan). Antes la **066** (primera versión, solo cuentas de cliente). Antes la **065** (la limpieza necesitaba WHERE en cada DELETE: `safeupdate`). Antes la **064** (el arranque fiscal y la limpieza de datos de prueba). Antes la **063** (libro de ajustes de stock: `ajustes_stock` y `comprobar_stock()`) y la **062** (el IVA de venta: `productos.iva_pct`, el snapshot en `pedido_items` y la tabla `pedido_iva` con su desglose por tipo; ver la sesión del 2026-08-12 cont.). Antes la **061**. Del 2026-08-11 salieron cuatro: **058** (un usuario, un rol), **059** (revocar EXECUTE a las RPC internas), **060** (su corrección: había que revocar también a `PUBLIC`) y **061** (`get_user_role` al esquema `interno`, fuera de la API REST). Antes la **057** (`familia`/`variante` en productos). Del 2026-08-06 salieron cuatro: **054** número de factura obligatorio y único, **055** su corrección para que el único ignore espacios, **056** `desempaquetados` + la RPC, y **057** las variantes fuera del nombre del producto. Antes, la **053** (el teléfono que la 047 se llevó de `confirmar_venta`). Del 2026-08-02 salieron siete seguidas: **044** reembolso por artículos (`reembolso_lineas` + `reembolsar_pedido_total` sin reponer dos veces), **045** pago por transferencia (el plazo de pago ES el TTL de la reserva), **046** `ajustes_tienda` (la cuenta de cobro fuera de las variables de entorno), **047** el carrito no se vacía hasta que el pago existe, **048** `metodo_detalle` (decir «Bizum» y no «Stripe»), **049** `reemplazado_por` (enlazar en vez de fusionar) y **050** el tipo de evento `nota`. Antes, la **043** (el teléfono que el cliente actualiza llega al panel; trae `direcciones_envio.updated_at` y `set_updated_at_preciso()` con `clock_timestamp()`). Antes, la **042** (calificación de la experiencia de compra). Antes, la **041** (direcciones validadas), la **040** (teléfono de contacto) y la **039** con su corrección `039_fix_orden_y_fuga_de_actor`. Las 033–035 se aplicaron con la BD en «arranque real» (0 pedidos, 0 reservas), así que no tocaron ningún dato. Verificadas contra el remoto: `confirmar_venta` es idempotente (un reintento del webhook devuelve el mismo pedido) y `reservar_carrito` no apila al recargar el checkout (7/3 dos veces) y ante falta de stock deja el inventario intacto.
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
  - ⭐ **Desde el 2026-08-11 el desplegable acota por CÓDIGO POSTAL, no por provincia**: con `28840` deja «Mejorada del Campo» en vez de los 179 municipios de Madrid.
    - ⚠️⚠️ **ACOTA, NO RESTRINGE, y ese matiz es todo el diseño.** El diccionario del INE **no trae códigos postales** (el INE numera municipios; los CP son de **Correos**), así que hace falta una segunda fuente **que no es oficial** y puede tener lagunas. Si acotar cerrase la puerta, una laguna dejaría a alguien **sin poder comprar** y sin ninguna pista de por qué. Por eso siempre hay un «¿No ves la tuya? Ver las N de {provincia}», y **el servidor sigue validando contra la provincia**, jamás contra esta tabla.
    - La provincia entera se muestra sola, sin pedirla, en dos casos: el CP no está en la tabla, **o** la localidad ya elegida no pertenece a ese CP (esconderla la borraría de la vista sin avisar).
    - **El 20 % de los CP abarcan más de un municipio** (`28024` es Madrid **y** Pozuelo de Alarcón), así que acotar no siempre deja una sola opción. Es correcto: son datos reales, no un fallo del cruce.
  - El dataset **se genera, no se pega**: `node scripts/generar-municipios.mjs` lo baja del INE, lo cruza con la tabla de códigos postales y escribe las dos salidas (`apps/api/src/common/datos/municipios.generado.ts` y los 52 `apps/web/public/municipios/<cpro>.json`). Falla si los códigos no cuadran con `PROVINCIAS_ES` **o si el cruce con los CP baja del 95 %** (la última medición: 98,19 % de 14.608 filas). Regenerar cuando el INE publique edición nueva.
    - **Solo se conserva lo que casa EXACTO** con el nombre del INE; lo demás se descarta y se cuenta en la salida del script. Preferible quedarse corto —hay salida a la provincia— que ofrecer un municipio que no existe.
    - **264 tests** comprueban el fichero generado, no el código: que ningún índice apunte fuera, que ningún CP se cuele en otra provincia y que el acotado siga sirviendo para algo. Un cruce degradado no da error por sí solo; esto lo caza.
  - ⚠️⚠️ **FALLO CONOCIDO Y SIN ARREGLAR, que salió al hacer el cruce: LOS ENCLAVES.** `Condado de Treviño` y `Jurisdicción de San Zadornil` son municipios **de Burgos (09)** con código postal **de Álava (01xxx)**. Como la provincia se deduce del CP y el desplegable solo ofrece municipios de esa provincia, **un vecino de Treviño no puede completar una compra hoy**: su municipio no aparece por ningún lado, ni siquiera pulsando «ver todas».
    - Es **anterior** al acotado por CP; el cruce solo lo destapó (aparecieron como nombres que no casaban).
    - Son ~1.500 habitantes, así que no corre prisa, pero **arreglarlo cambia la regla de fondo** («la provincia sale del CP») y toca cliente **y** servidor a la vez: `provinciaPorCP`, el desplegable y `municipioCanonico`. No es un parche de una línea, y por eso se deja anotado en vez de improvisado.

### ⚠️ Pendientes de Jonathan (acción manual)

0. ⭐ **De la auditoría (2026-08-11). TODO DESPLEGADO Y VERIFICADO EN PRODUCCIÓN.** Queda solo lo que no puedo tocar yo:
   - ⚠️⚠️ **REVOCAR LOS TOKENS Y BORRAR `C:\YJIMENEZ\tokens-despliegue.env.txt`.** Sigue ahí desde el 2026-08-05 y **están vivos**: se comprobó que el de Render responde 200. Dentro van la `sb_secret_` (**se salta el RLS entero**: lee y escribe toda la BD), la de SendGrid (acceso total) y las de Vercel y Render. Es hoy el agujero más grande que queda, y no está en el código.
   - **Supabase Dashboard**: activar **MFA** para las cuentas del equipo y la **protección de contraseñas filtradas** (Auth → Policies). Las señala el Security Advisor. ⚠️ Por MCP no se puede: la Management API pide un token `sbp_`, y las claves del proyecto no sirven.
   - **Aplicar la CSP**: recorrer la tienda con la consola abierta y, si no salta ningún aviso, pasarla de `Report-Only` a obligatoria (instrucciones en `next.config.mjs`). Hace falta un navegador de verdad.
   - **Pasar los pagos por caja una vez** (tarjeta, Bizum, PayPal y transferencia) ahora que Next 15 está desplegado.
1. ~~`NODE_ENV` está en `development` en Render~~ → **ya está en `production`**, comprobado por API el 2026-08-11. El pendiente estaba desactualizado.
2. ~~Regenerar los tokens expuestos~~ → **hecho el 2026-07-25**: todos revocados.
3. **Paso a producción real** (ver "Plan de producción" en la sesión 2026-07-22): API en región **EU (Frankfurt) + plan de pago** (quita el "dormir" y el cruce transatlántico Render-Oregon ↔ Supabase-Irlanda), dominio propio, claves **Stripe `live`** + recrear el webhook con el nuevo signing secret, actualizar CORS_ORIGIN / Supabase URLs al dominio propio.

### Estado del negocio
- Catálogo real creado por Jonathan (productos con foto en la nube). Stock inicial cargado con la 1ª **compra de mercancía** (factura 202521188, IVA 10% salvo Pony Malta 21%, total c/IVA 93,64 €).
- ⭐ **BD LIMPIADA A «ARRANQUE REAL» EL 2026-08-06** (ver la sesión de ese día). **Este es el estado actual**, verificado en el remoto tras la limpieza:

| A cero | Conservado |
|---|---|
| `pedidos` · `pedido_items` · `pedido_eventos` · `pedido_calificaciones` · `transacciones_pago` · `reembolso_lineas` | **13 productos** con sus fotos, **stock 164 = la factura, descuadre 0** |
| `carritos` · `carrito_items` · `checkout_datos` · `stock_reservas` | ⭐ **TODAS las facturas de compra** y sus líneas — hoy la 202521188 con sus **11 líneas** (93,64 € c/IVA) **a nombre del admin**. Las facturas **nunca** se borran en una limpieza |
| `direcciones_envio` · `empleados` · `staff_modulos` | **1 proveedor** · **6 cargos** con sus **27 filas de plantilla** · **`ajustes_tienda`** (el IBAN de cobro) · **los PDF del bucket privado `facturas`** |
| **3 cuentas de cliente** borradas | **1 cuenta**: el súper admin `jonathanduqee+admin@gmail.com` con su perfil |

  - Las ventas del 27–28 de julio y las pruebas de Bizum/transferencia del 2 de agosto **ya no están**: sirvieron para validar el circuito y se documentaron, que es lo que quedaba de ellas.
  - Si hace falta repetirlo, **el procedimiento y sus trampas están en la sesión 2026-08-06** — más completo que el del 27 de julio, porque ahora hay que contar con `pedido_calificaciones`, `reembolso_lineas` y `ajustes_tienda`.
- **Una sola cuenta**: el súper admin `jonathanduqee+admin@gmail.com` (perfil «Admin Valatino»). Gestión Humana y TI arrancan vacíos; para volver a probar el flujo de asesor hay que rehacerlo (RRHH crea empleado → TI le provisiona cuenta). **Cualquier cliente que entre a partir de ahora es tráfico nuevo.**
  - ⚠️ Las cuentas de prueba **EMP-0018 Jhoanna Mendoza** (DIRCOM) y **EMP-0019 Valentino Jiménez** (ASECOM) **ya no existen**. Sirvieron para validar de punta a punta el flujo RRHH → TI y los niveles de permiso; si este archivo las menciona en las sesiones de abajo, es historia, no estado.
- **Los 6 cargos ya tienen plantilla de permisos** (sembrada en la 038, editable desde TI → Cargos sin tocar código): GER todo `total` salvo `ti: lectura` · DIRCOM pedidos y clientes `total` · DIROP inventario y compras `total` · DIRADM dashboard y compras `total`, pedidos y clientes `lectura` · COORTH `gestion_humana: total` · ASECOM pedidos `edicion`, clientes y catálogo `lectura`. Son **datos**, no doctrina: ajústalos el primer día. (Jhoanna tiene los suyos retocados a mano respecto a la plantilla, que es justo para lo que está.)
- Pendientes de fondo: ~~tests (0%)~~ → **659 tests: 368 en la API y 291 en la web** (`pnpm turbo test` cubre los dos). ~~la web sigue sin tests~~ → **la web ya tiene runner** (`apps/web/jest.config.js`), sobre lógica pura de `lib/` y sobre los datos generados de municipios; **los componentes siguen sin cubrir** (haría falta `jsdom` + `@testing-library/react`). ~~CI~~ → **montado el 2026-08-11** (`.github/workflows/ci.yml`). Accesibilidad. ~~Validar los campos de dirección~~ → **hecho el 2026-07-27** (migración 041 + diccionario del INE). El histórico de direcciones para analítica vive en `pedidos.envio_*` (snapshot por pedido), no en `direcciones_envio`, y desde la 040 incluye `envio_telefono`.

---

## Sesión 2026-08-13 — ⭐⭐ La liquidación del IVA (068), y los cuatro agujeros que no se veían

El plan era «una pantalla que resta»: la 062 dejó el IVA de cada venta cuadrado al céntimo y la 029 el soportado de las compras, así que parecía que el 303 era juntar las dos mitades.

**No lo era.** Antes de escribir una línea de la resta se comprobó contra el remoto qué había a cada lado, y salieron cuatro cosas. Ninguna se ve leyendo `pedido_iva`; todas se ven mirando de dónde sale cada número.

### Los cuatro agujeros

| # | Qué faltaba | Por qué rompe el 303 |
|---|---|---|
| **1** | `pedido_iva` existe para **TODOS** los pedidos con líneas, incluidos `PENDIENTE_PAGO` y `CANCELADO` | Declararía IVA de ventas que no han ocurrido. Una transferencia sin pagar no ha devengado nada |
| **2** | No había **fecha de devengo**, solo `created_at` | En tarjeta y Bizum el pedido nace pagado y coincide. En **transferencia** nace pendiente y se cobra días después: el pedido cae en un trimestre y el cobro en el siguiente |
| **3** | `reembolsar_pedido_total` **no apuntaba líneas** en `reembolso_lineas` | Un reembolso hecho en el panel de Stripe llega por el webhook `charge.refunded`, devuelve el dinero y no deja rastro de **qué artículos**. Sin artículo no hay tipo de IVA, y sin tipo no hay nada que rectificar |
| **4** | `facturas_compra` no tenía **fecha de la factura**, solo la de registro | El libro registro de facturas recibidas exige la fecha de expedición del proveedor |

Y una **anomalía de negocio** que el informe ahora señala en vez de esconder: `PROCESANDO → CANCELADO` está permitido y **no devuelve el dinero**, así que deja IVA devengado sobre una venta cancelada sin rectificativa. No se ha cambiado la máquina de estados —es una decisión de negocio, no un bug— pero deja de ser invisible.

### ⚠️⚠️ El fallo más fácil de toda la migración, y no está en el dato: LA ZONA HORARIA

Las fechas se guardan en `timestamptz` y la sesión de Supabase va en **UTC**. Comparar un `timestamptz` con una fecha suelta usa la zona de la sesión, así que una venta del **1 de abril a las 00:30 de Madrid** son las **22:30 UTC del 31 de marzo**: caería en el **primer** trimestre en vez del segundo.

Y lo peor es cómo se comporta: el 31 de marzo a las 23:30 de Madrid **sí** cae bien, así que el error solo aparece en las ventas de las **primeras horas del primer día del trimestre**. Es decir, no se nota nunca hasta que se nota — y entonces ya está presentado.

Por eso existe **`dia_fiscal(timestamptz)`**, que convierte a `Europe/Madrid` explícitamente, y **todas** las consultas del informe pasan por ella. Hay un test que lo fija: `dia_fiscal('2026-03-31 22:30:00+00')` tiene que dar `2026-04-01`.

### ⚠️⚠️ Y el peor riesgo del cambio: tocar `reembolsar_pedido_total`, que es la ruta del dinero

Se decidió cerrar el agujero 3 **en la fuente** y no solo avisar en el informe, por lo que dijo la 063 del libro de stock: *«un libro con huecos es peor que no tenerlo, porque parece completo»*. Y no se puede arreglar después: si el dinero salió sin dejar dicho qué volvió, el tipo de IVA de esa devolución no está en ninguna parte.

**La trampa, que es sutil y estuvo a punto de colarse:** las unidades a reponer se calculan restando lo que ya figura en `reembolso_lineas`. Si se insertan las líneas **antes** de reponer, la consulta de reposición las ve como «ya devueltas» y **no repone nada** — un reembolso que devuelve el dinero y no devuelve el stock. Y al revés (reponer y luego insertar consultando otra vez la tabla) tampoco: son dos lecturas que pueden diferir. La única forma correcta es calcular el conjunto **una vez** y usar el mismo para las dos cosas, que es el CTE `pendiente_por_item`.

**Se probó en transacción revertida contra el remoto antes de aplicar, y ahí se vio: sin el CTE el stock subía 0 en vez de 5.** Es exactamente la lección de la madrugada del 12/08 — con el stock de por medio, la prueba en seco no es opcional.

### El ensayo, que es lo que dio confianza para aplicar

Once comprobaciones (A a K) en una sola transacción revertida, con los datos reales del remoto y dos pedidos de ensayo construidos con **dos líneas del mismo producto** (que es la trampa del `update … from`):

| | Prueba | Resultado |
|---|---|---|
| A | El dominio acepta `contabilidad` y rechaza un módulo inventado | ✅ |
| B | El devengo del pedido real sale del evento `PROCESANDO` del historial, al microsegundo | ✅ |
| C | Un `update … set devengado_el = null` **no** lo borra | ✅ |
| D | Un pedido nacido `PROCESANDO` devenga en el acto, y su desglose suma el total | ✅ |
| **E** | **`reembolsar_pedido_total`: el stock sube 5, y las 2 líneas quedan apuntadas con su importe** | ✅ **la trampa** |
| F | Un segundo reembolso devuelve `false`, no repone dos veces y no duplica líneas | ✅ |
| **G** | **Parcial por artículos + cierre total: el stock sube 4 (+1, +0, +3) y las 5 unidades quedan apuntadas** | ✅ **la doble reposición** |
| H | Solo queda **una** versión de cada función (las firmas viejas, muertas) | ✅ |
| I | La API **ya desplegada** (6 argumentos con nombre) sigue entrando por el `default` → **sin ventana** | ✅ |
| J | La liquidación: devengado = 10,10 € (los 3 pedidos cobrados), el resultado es la resta, los avisos que tocan y **no** los que no | ✅ |
| K | `dia_fiscal` convierte a hora española | ✅ |

Y al revertir se comprobó que el stock volvía a 120 exacto, 1 pedido, 1 línea, 2 compras.

### Lo que se aplicó

- **`pedidos.devengado_el`** — la fecha fiscal de la venta. **Escritura única**: si un pedido entregado se reabriera, mover el devengo lo pasaría a otro trimestre y descuadraría un 303 **ya presentado**. El guardia va contra `OLD`, no contra `NEW`. Relleno desde `pedido_eventos` (la 039 registra también el alta, así que el pedido nacido `PROCESANDO` tiene su evento).
- **`facturas_compra.fecha_factura`** — la de expedición del proveedor. ⚠️ **Son dos fechas distintas y hacen falta las dos**: esta la exige el libro registro, y el trimestre en que se deduce lo decide **`created_at`** (cuándo se anotó). Una factura de diciembre que llega y se anota en enero se deduce en enero; usar la de expedición reabriría trimestres ya presentados cada vez que llega una con retraso. **Hay que confirmárselo a la gestoría**, que es quien presenta.
- **`reembolsar_pedido_total`** apunta lo que repone, con el `refund_id` de Stripe cuando se conoce. Y `registrar_reembolso_lineas` se lo pasa, así que **un parcial y su cierre salen como UN documento rectificativo**, no como dos — que es lo correcto: un reembolso, una rectificativa.
- **Módulo `contabilidad`** con `lectura` sembrado en **DIRADM** y **GER**. Vive aparte de Compras y del Dashboard porque el 303 cruza ventas **y** compras (ninguno es su dueño) y porque quien lo presenta no es quien registra facturas de proveedor. Es además la casa de las facturas a clientes.
  - ⭐ **Y el 303 es un SUBMÓDULO, no la raíz del módulo** (lo pidió Jonathan, «así como proveedores en compras»): vive en **`/backoffice/contabilidad/iva`** y `/backoffice/contabilidad` **redirige** ahí. Es el patrón de TI, que aterriza en Usuarios — no una página índice, porque con un solo submódulo eso sería un menú de un elemento y un clic de más. Cuando lleguen las facturas a clientes serán otro submódulo y ese redirect decidirá la puerta de entrada.
    - El guardia (`exigirModulo("contabilidad")`) sigue en `contabilidad/layout.tsx`, así que cubre el padre y todos los hijos.
    - ⚠️ **Sin enlace «volver a Contabilidad», y a propósito**: el padre redirige *aquí*, así que sería un bucle. Proveedores sí lo lleva porque Compras es una pantalla de verdad; si alguien ve la diferencia y quiere «igualarlo», este es el motivo.
    - Icono `Percent` en la cabecera y en el sidebar del hijo, no `Calculator`: el de la calculadora es el del módulo, y repetirlo haría pensar que se está en la raíz.
  - ⭐ **Y de paso, el CHECK de `modulo` deja de estar copiado.** Estaba en `staff_modulos` **y** en `cargo_modulos` y llevaba **cinco** reescrituras (023, 030, 032, 036 y esta). Ahora es el dominio **`staff_modulo`**: añadir un módulo = tocar un sitio. La 038 ya había diagnosticado el problema —creó el dominio `nivel_permiso` justo por eso— pero dejó `modulo` como estaba.
- **`liquidacion_iva(desde, hasta)`** — devengado por tipo, rectificado por devoluciones, deducible de compras, la diferencia y **los avisos**.

### ⚠️ NO se creó ningún libro de IVA nuevo, y es deliberado

Las tres fuentes —`pedido_iva`, `reembolso_lineas` y `factura_compra_items`— ya son la verdad de sus hechos. Una cuarta tabla que las copie es un segundo sitio que puede divergir del primero: exactamente lo que la 063 se negó a hacer con el libro de movimientos de stock. **El informe se calcula, no se acumula.**

### ⚠️ La regla de redondeo, un nivel por encima de la 062

**La base del periodo es la SUMA DE LAS BASES DE LOS DOCUMENTOS**, no una base derivada del bruto del periodo. Cada factura declara su propia base y su propia cuota; el 303 suma documentos. Derivar del bruto agregado daría otra base —unos céntimos— que no cuadraría con la suma de las facturas, que es justo lo que comprueba un inspector.

Por eso `pedido_iva` se **suma tal cual** (ya viene redondeado por pedido y por tipo) y las devoluciones se agrupan por **(reembolso, tipo)** antes de derivar. En el ensayo se vio la consecuencia: el rectificado dio 4 documentos y no 5, porque un parcial y su cierre son el mismo reembolso.

Y en las compras la cuota se **multiplica** en vez de derivarse: los costes de la 029 son **sin** IVA, al contrario que los precios de venta, que lo llevan incluido.

### ⚠️⚠️ Los avisos NO son decoración: son la mitad del valor del informe

Un importe solo sirve si se sabe qué **no** está contando, y van arriba, antes de los números. Los siete:

| Aviso | Qué dice |
|---|---|
| `sin_facturas_emitidas` | **El de fondo**: hoy se liquida desde los pedidos, y un 303 se soporta con el libro de facturas expedidas (Capa 2). Mismo IVA, mismos importes, pero quien firme tiene que saberlo |
| `sin_arranque_fiscal` | La tienda sigue en pruebas: estas ventas pueden borrarse y nada de esto se presenta |
| `periodo_antes_del_arranque` | El periodo empieza antes del arranque fiscal |
| `compra_sin_fecha_factura` | Falta la fecha de expedición. Su IVA **sí** se deduce; lo que falta es el dato del libro |
| `compra_sin_iva_por_linea` | Líneas anteriores a la 029: **ese IVA soportado no se está deduciendo**, así que el resultado sale más alto de lo que debería. Este vale dinero de verdad |
| `compra_descuadre_por_tipo` | La 029 redondeó el IVA una vez sobre la factura entera; el informe lo redondea por tipo. Con varios tipos pueden diferir en céntimos |
| `cancelado_ya_cobrado_sin_devolucion` | Ventas canceladas después de cobrar y sin devolución: IVA declarado sin rectificativa |
| `devolucion_reconstruida` | Devoluciones cuyo desglose se **dedujo** (refund_id `retro:…`), no se presenció |

⚠️ Y un detalle que importa: los apuntes reconstruidos se marcan con `retro:<pedido>` y **no** con `total:<pedido>`. Un apunte reconstruido no debe parecer un apunte original.

### Lo que salió del remoto al aplicarlo

**3T de 2026**: devengado 4,64 € + 0,46 € de cuota · rectificado lo mismo (el único pedido está reembolsado, así que **repercutido 0**) · deducible 184,32 € + 25,10 € en tres tipos (4 %, 10 % y 21 %) → **−25,10 €, a compensar**. Con las dos facturas de compra señaladas por falta de fecha, y **sin** descuadre contra el `total_iva` que guardó la 029.

### Un test que fallaba sin que nada estuviera roto

`permisos.dto.spec.ts` usaba literalmente **`"contabilidad"`** como ejemplo de «módulo inventado». El día que el módulo existió de verdad, el test empezó a fallar. Ahora usa `__inventado__`: **un centinela que nadie va a dar de alta**, para que el test compruebe lo que dice comprobar. Vale como regla para el resto.

### Y un fallo mío que el test destapó, que es el que más me gusta de la sesión

La validación del periodo comprobaba las fechas con `Date.parse("2026-02-31T00:00:00Z")` dando por hecho que devolvería `NaN`. **No lo devuelve**: V8 **rueda** el día al 3 de marzo y contesta un número perfectamente válido. Así que un periodo mal teclado se aceptaba en silencio y el informe salía de **otras fechas** — un 303 de un trimestre que nadie pidió, sin ningún aviso.

Lo único que sirve es el **viaje de ida y vuelta**: construir la fecha y comprobar que sus componentes son los que se pasaron. Está en `mediaNocheUtc` con seis casos de test (incluido el 29 de febrero de un año que no es bisiesto).

### Verificado antes de cerrar

- `pnpm turbo type-check` limpio · **659 tests en verde** (368 API + 291 web, +27)
- La API **arranca de verdad** con `node dist/main`: `ContabilidadModule` inicializado y las dos rutas mapeadas (`GET /admin/contabilidad/iva`, `PATCH /admin/compras/:id/fecha-factura`)
- El endpoint contesta **401 sin token** — el guard corre antes de la validación, que es el orden correcto
- Fichero de migración local **sincronizado con lo aplicado** al remoto

### Desplegado el mismo día, y la 069 detrás

Ver el bloque «LA 068 Y LA 069 ESTÁN DESPLEGADAS» de arriba: se tomó línea base por HTTP antes de pushear, las dos rutas nuevas pasaron de **404 a 401**, Render tardó **90 s** y la tienda quedó sin regresiones. La 069 (`fecha_factura` a NOT NULL) se aplicó **después** de esa comprobación, que era su condición.

También se pusieron las fechas reales de las dos facturas de compra (15/07 y 05/08), así que el aviso `compra_sin_fecha_factura` ya no sale y el 3T sigue en **−25,10 €** — confirmando que la fecha de expedición no mueve el trimestre.

### ⭐ La 070: el primer fallo que encontró Jonathan mirando la pantalla, y era real

Preguntó qué significaba la columna «Facturas» del desglose deducible: «*1 factura tiene el 4 %, 2 el 10 % y 2 el 21 %, ¿eso es?*». **Sí, era eso.** Pero al confirmarlo con los datos apareció el problema, que era mío:

> **1 + 2 + 2 = 5. Y facturas hay DOS.**

Una factura con tres tipos de IVA dentro cuenta en las tres filas:

| Factura | 4 % | 10 % | 21 % |
|---|---|---|---|
| `202521188` | — | 10 líneas | 1 línea |
| `202521893` | 1 línea | 9 líneas | 2 líneas |

La columna es correcta fila a fila y **NO ES ADITIVA**. Y la fila «Total» dejaba esa celda **en blanco**, así que nada contradecía la lectura natural.

⚠️ **No era cosmético.** Quien presenta un 303 tiene que poder decir cuántas facturas respaldan una cifra, y decir cinco cuando son dos es justo el tipo de error silencioso que este informe existe para evitar. Es el mismo principio que «la media nunca se lee sola, al lado va la tasa de respuesta» de la calificación de compra.

**Arreglado en los tres bloques**, porque pasa igual con los pedidos (uno con productos al 10 y al 21 cuenta en dos filas) y con las devoluciones:
- La RPC devuelve `devengado_documentos`, `rectificado_documentos` y `deducible_documentos` con un `count(distinct …)`. Hoy: **2 facturas** frente a los 5 de la columna.
- El total de la tabla ya trae el número real.
- Y debajo aparece una nota — **solo cuando la suma difiere**, porque avisar de una trampa que en ese periodo no existe es ruido que se aprende a ignorar: «Son **2** en total, no 5: una factura con varios tipos de IVA dentro cuenta en cada fila».
- ⚠️ Los `count(distinct …)` llevan **los mismos filtros** que el bloque que cuentan. Si el deducible contara también facturas cuyas líneas no tienen tipo de IVA, diría 3 facturas para una base que sale de 2 — y un total que no casa con lo que hay encima es peor que no ponerlo.

**La lección, que vale más que el arreglo**: un recuento por categorías junto a un total invita a sumarlo. Si no es aditivo, hay que decirlo **en el sitio**, no confiar en que se deduzca.

### ⭐⭐ Y un efecto colateral que no vi al diseñarlo: la 068 ARREGLA un agujero de `comprobar_stock()`

Se comprobó al final, preguntándose si crear más filas en `reembolso_lineas` podía provocar **doble conteo** en `comprobar_stock()` (063) o en el recálculo de la limpieza (064). No lo provoca — y resulta que arregla lo contrario. La fórmula es:

```
deducido = comprado − vendido + repuesto − abierto + generado + ajustado
  vendido  = pedido_items de pedidos cuyo estado NO es PENDIENTE_PAGO ni CANCELADO  → incluye REEMBOLSADO
  repuesto = reembolso_lineas con repuesto_al_stock = true
```

**Antes de la 068**, un reembolso total por el webhook reponía el stock pero **no dejaba línea**. Así que:

- `vendido` contaba sus unidades (REEMBOLSADO no está excluido),
- `repuesto` contaba **0** (no había línea),
- pero el stock real **sí** había subido.

Resultado: **un descuadre fantasma de +N que nadie podía explicar**, porque no había ningún apunte al que atribuirlo. Es el mismo síntoma que la caja de Quipitos Pops del 12/08 pero por otra causa, y habría vuelto a aparecer en el primer reembolso hecho desde el panel de Stripe.

Con la 068 la línea existe con `repuesto_al_stock = true`, así que los dos términos se cancelan y la fórmula cuadra. **`comprobar_stock()` devuelve hoy cero descuadres.** Y no hay doble conteo porque `repuesto` sale **solo** de `reembolso_lineas`, de ningún otro sitio.

⚠️ Lo que sí hay que recordar si algún día se encuentra un descuadre viejo «arreglado a mano» con un `ajustar_stock` que en realidad era este agujero: ese ajuste ahora **sobra** y habría que revertirlo. No es el caso hoy (0 descuadres), pero es la única forma en que esto podría contar dos veces.

### 🔜 Lo único que queda: mirarlo con un navegador

**El cálculo está verificado contra datos reales por SQL y el despliegue por HTTP, pero tres cosas no las ha pulsado nadie:**

1. **Contabilidad → Liquidación de IVA** (el módulo redirige al submódulo). Abre por defecto en el trimestre **anterior** al de hoy (el que se presenta), no el actual, que estaría a medias. Con los datos de hoy debe salir **−25,10 € a compensar** en el 3T y dos avisos (`sin_facturas_emitidas` y `sin_arranque_fiscal`). En el bloque deducible, el total de la columna de facturas tiene que decir **2** y debajo la nota de que no suma.
2. **Compras → Registrar compra**: el campo «Fecha de la factura» es obligatorio y no acepta futuro.
3. **La ficha de una compra**: el bloque de la fecha con «Corregir». Solo se pinta con `compras:edicion` (la regla de «lo que no se puede hacer, no se pinta»).

---

## Sesión 2026-08-12 (cont. 2) — ⭐ Probar sin miedo, y arrancar de verdad una sola vez (063 y 064)

Jonathan lo planteó así: «creamos ventas, las eliminamos, dejamos la base limpia, volvemos a probar… ¿qué hacemos para que cuando sea la real se pueda limpiar y arrancar?».

### ⚠️⚠️ Lo primero, porque cambia el problema: eso deja de ser legal en cuanto haya facturas

Una serie de facturación tiene que ser **correlativa y sin huecos**. Borrarla para empezar de nuevo es destruir registros contables. Así que lo que hacía falta no era una limpieza: era **un punto de no retorno explícito**, con una limpieza detrás que se apague sola al cruzarlo.

Y una asimetría que conviene tener presente: **las compras ya son reales**. Las facturas 202521188 y 202521893 son de proveedor, con mercancía y dinero de verdad, y ese IVA soportado ya es deducible. Lo que está en pruebas es solo el lado de las ventas.

### El hallazgo: el stock era reconstruible salvo por un agujero, y se pudo medir

Antes de diseñar nada se comprobó contra el remoto si el stock se deduce de lo que sobreviviría a una limpieza:

`stock = compras − ventas + reposiciones de reembolso ± desempaquetados`

**19 de 20 productos cuadraban exactamente.** El único que no: **Quipitos Pops Caja 24**, con 1 unidad y 0 compradas. Entró por un `ajustar_stock` a mano y **no había rastro de ella en ninguna parte** — no existía libro de movimientos.

⚠️ Al principio parecían dos descuadres. El otro era mío: faltaba el término de **reposición de reembolso** en la fórmula (el pedido `260812017439` está REEMBOLSADO con dos líneas devueltas). Con ese término encaja.

### 063 — el libro de ajustes, y solo el de ajustes

`ajustes_stock` guarda qué, cuánto, quién y **por qué**. Deliberadamente **no** es un libro de todos los movimientos: compras, ventas, reembolsos y desempaquetados ya tienen su fuente de verdad, y duplicarlos crearía un segundo sitio que puede divergir del primero — además de obligar a tocar `confirmar_venta`, que es la ruta del dinero. **Solo se registra la única entrada que no tenía fuente.**

- El apunte va **en la misma transacción** que el movimiento. Un libro que se escribe aparte se queda a medias en cuanto algo falle, y **un libro con huecos es peor que no tenerlo porque parece completo**.
- ⚠️ **Se BORRA la `ajustar_stock` vieja antes de crear la nueva.** Con `create or replace` quedarían las dos vivas y una llamada de dos argumentos sería **ambigua** — la trampa que documenta la 039. Y el `drop` no abre ventana: Supabase llama con argumentos **con nombre**, así que la API ya desplegada entra por los `default` de los parámetros nuevos. Se comprobó en el ensayo.
- **`comprobar_stock()`** convierte en consulta lo que hasta hoy se miraba a ojo tras cada limpieza. Un descuadre no da error por sí solo: hay que ir a buscarlo.

### ⚠️ El panel solo sabía SUMAR stock

Al poner el motivo apareció: `StockAjusteModal` era un «+Stock» con `min={1}`. O sea que **rotura, merma y caducidad —las razones por las que un inventario se descuadra de verdad— no tenían forma de entrar**, y quien las sufría no registraba nada. Un libro que solo apunta altas no explica ningún descuadre, así que el widget lleva ahora el signo.

El signo **se deduce del motivo** cuando el motivo lo implica (rotura resta, siempre) y solo se pregunta cuando no (corrección). Preguntarlo siempre invita a equivocarse en la mitad de los casos.

### 064 — el interruptor de un solo sentido

`ajustes_tienda.arranque_fiscal_el`: `NULL` = pruebas, con fecha = real. Y `limpiar_datos_de_prueba()` **se niega a ejecutarse** en cuanto tiene fecha.

⚠️ **El guardia vive en la BD, no en el servicio de Nest.** Es lo que hace que proteja también al editor SQL, a un script y a cualquier endpoint que se escriba mañana — la lección de la 055: una restricción que depende de que la aplicación se acuerde no es una restricción.

- La limpieza **recalcula el stock** desde lo que sobrevive. Sin eso el inventario queda descontado por ventas que ya no existen, y no se nota hasta que falta mercancía para servir un pedido de verdad.
- **No toca cuentas de usuario.** Borrar una es irreversible de otra manera y vive en `auth`; se limita a contarlas en el resumen.
- `marcar_arranque_fiscal` es **idempotente y no sobrescribe la fecha**: la primera es la que vale, porque es el momento en que las ventas empezaron a contar.
- En el panel exige **`admin` además de `ti:total`**: vaciar la tienda no es «administrar accesos», y el nivel más alto de un módulo no debería alcanzar para eso.

### Probado en transacción revertida antes de aplicar

| Prueba | Resultado |
|---|---|
| `comprobar_stock()` antes | 1 descuadre: **Quipitos Pops (+1)** — encuentra el fantasma |
| Llamada de **2 argumentos** (la API desplegada) | entra, apunte `motivo=sin_indicar` → **sin ventana** |
| Descuadres tras 2 ajustes nuevos | **sigue en 1**: el libro los explica |
| Limpieza | 3 pedidos fuera, todo a 0, stock recalculado, **0 descuadres después** |
| Guardia tras marcar el arranque | **salta** con fecha y motivo |

### ⚠️⚠️ Y falló al pulsarlo. La 065, y la lección más cara de la sesión

El botón dio error a la primera. En los logs, `POST /rest/v1/rpc/limpiar_datos_de_prueba` → **400**, dos veces (20:58:08 y 20:58:15), y en Postgres:

```
DELETE requires a WHERE clause
```

Es **`safeupdate`**, que Supabase precarga en el rol de PostgREST y que rechaza cualquier `DELETE` o `UPDATE` sin `WHERE`. La 064 hacía `delete from pedidos;` a secas.

> ⚠️⚠️ **EL ENSAYO EN TRANSACCIÓN REVERTIDA NO LO CAZÓ PORQUE SE HIZO CON EL USUARIO EQUIVOCADO.** El MCP conecta como **`postgres`**; la API entra por PostgREST como **`authenticator`**, que lleva:
>
> ```
> session_preload_libraries = supautils, safeupdate
> statement_timeout = 8s
> ```
>
> `postgres` no precarga esa librería, así que el ensayo pasó en verde y el botón falló en cuanto se pulsó. **Probar contra datos reales en transacción revertida no sirve de nada si se prueba con un usuario que no tiene las mismas protecciones que el que va a ejecutarlo.** Es el complemento de la lección del 2026-08-03: hay que ejecutar el escenario **y con el rol correcto**.
>
> No se pudo verificar el arreglo por el MCP: `load 'safeupdate'` está bloqueado por supautils. La prueba definitiva fue pulsar el botón.

- La **065** da a cada `DELETE` un predicado sobre una columna NOT NULL (`where id is not null`, y `session_id` en `checkout_datos`, que es su clave). **No un `where true`**: se escribe un predicado de verdad y no un rodeo para engañar a la protección.
- **Barrido de la misma familia de fallo**: se buscaron en todas las funciones del esquema los `DELETE` y `UPDATE` sin `WHERE`. **`limpiar_datos_de_prueba` era la única.** Las demás llevan el suyo y además llevan meses ejecutándose.
- ⚠️ **El otro dato del rol, para acordarse**: `statement_timeout = 8s`. Hoy con 3 pedidos esto es instantáneo, pero una limpieza sobre miles de filas se cortaría a la mitad. Si pasa, hay que trocearla — **no subir el timeout**, que es lo que protege a la API de quedarse colgada.

### ⭐ Verificado tras limpiar: la tienda queda en «arranque real» (2026-08-12)

| A cero | Conservado |
|---|---|
| `pedidos` · `pedido_items` · `pedido_iva` · `pedido_eventos` · `pedido_calificaciones` · `transacciones_pago` · `reembolso_lineas` | **20 productos**, **336 unidades = las 336 compradas**, descuadre **0** |
| `carritos` · `carrito_items` · `checkout_datos` · `stock_reservas` · `direcciones_envio` | **2 facturas de compra** con sus **23 líneas**, y el proveedor |
| **Cuentas de cliente: 0** (`jonathanduqee@hotmail.com` y `jonathanduqee@gmail.com` borradas) | **6 cargos** con plantilla · `ajustes_tienda` · **1 cuenta: `jonathanduqee+admin@gmail.com`** |

Sin perfiles huérfanos y sin stock reservado.

⚠️ **Y pasó lo avisado: la caja de Quipitos Pops quedó a 0.** Era la unidad fantasma sin apunte. Si la caja existe en el almacén, hay que meterla con un ajuste de tipo «recuento» — ahora sí queda registrada y sobrevive a la siguiente limpieza.

### 066 y 067 — la limpieza se lleva las cuentas y los empleados de prueba

La 064 contaba las cuentas y no las tocaba, por prudencia. Dejaba un cabo suelto en cada limpieza («todo a cero menos esto») que había que atar a mano.

**La 066** empezó borrando solo las de rol `cliente`. **La 067 la corrigió al pedir Jonathan que los empleados de prueba también se fueran**, y al mirarlo apareció el fallo de fondo: el flujo RRHH → TI crea **dos** cosas —la ficha de `empleados` y **su cuenta de asesor**—, así que borrar la ficha dejaba **un asesor con acceso al panel y sin nadie detrás**.

La regla se simplificó en vez de complicarse:

| Se va | Se queda |
|---|---|
| **Todas las cuentas cuyo rol NO sea `admin`** (clientes y asesores) | el `admin` |
| **Empleados** con su histórico mensual (cascada) | **los cargos con sus 27 filas de permisos** |

⚠️⚠️ **LOS CARGOS NO SE TOCAN, Y ES DELIBERADO.** No son datos de prueba: son el **organigrama del negocio** —Gerente General, Director Comercial…— con permisos ajustados a mano, sembrados en la 038. **Un empleado se contrata y se va; el puesto que ocupaba sigue existiendo.** Borrarlos dejaría TI → Cargos vacío y provisionar a alguien exigiría reconstruir el organigrama entero.

Tres detalles de orden que no son cosméticos:

1. Las cuentas se borran **después** de pedidos y empleados: `pedidos.user_id` cascadea desde `auth.users`, así que al revés se llevaría pedidos por la puerta de atrás y el recuento mentiría.
2. En **una sola sentencia**: `user_roles.asignado_por` es `NO ACTION`, así que si un asesor asignó el rol de otro, borrarlos por separado fallaría. En la misma sentencia Postgres comprueba al final.
3. `profiles`, `user_roles` y `staff_modulos` caen en cascada con la cuenta; `empleado_historial_mensual` con el empleado. No hay que borrarlos aparte.

Y una cuenta **sin rol** no se toca: es un estado anómalo (`assign_default_role` le pone `cliente` a todo el que se registra) y ante algo que no debería existir avisar es más útil que borrar en silencio. El panel lo destaca.

⚠️ Comprobado tras la 067 que **los 8 `DELETE` de la función llevan su `WHERE`** (la lección de la 065). Ojo al comprobarlo: un regex `delete from <tabla> where` da un falso positivo con `delete from auth.users u where …`, porque el alias va en medio.

La 064 las contaba y no las tocaba, por prudencia. En la práctica dejaba un cabo suelto en cada limpieza («todo a cero menos esto») que había que atar a mano, y el estado que se busca es la tienda entera recién montada. **A quién NO toca, que es lo que lo hace seguro:**

1. Solo cuentas cuyo rol sea **exactamente `cliente`** (desde la 058 un usuario tiene como mucho uno, así que no hay ambigüedad).
2. **Nunca** una cuenta ligada a una ficha de `empleados`, aunque su rol siga siendo `cliente`. Es la red para quien quede a medias del flujo RRHH → TI: la ficha existe, el rol aún no se ha cambiado, y borrarle la cuenta sería tirar el trabajo de dos personas.
3. **Nunca** una cuenta sin rol. Es anómalo —`assign_default_role` le pone `cliente` a todo el que se registra— y ante algo anómalo se **cuenta y no se borra en silencio**. El panel lo destaca en la línea de resultado.

⚠️ El borrado de cuentas va **después** del de pedidos a propósito: `pedidos.user_id` cascadea desde `auth.users`, así que al revés se llevaría pedidos por la puerta de atrás y el recuento mentiría.

### ⚠️ Lo que hay que saber antes de pulsar «limpiar»

**Tras limpiar, Quipitos Pops Caja queda a 0.** Es el fantasma sin apunte: el stock se recalcula desde los movimientos, y esa unidad no está en ninguno. **Si esa caja existe de verdad en el almacén, hay que registrarla antes con un ajuste de tipo «recuento»** o desaparece. El panel lo avisa en pantalla, con nombre y números, justo encima del botón.

**349 tests en la API** (+6 del DTO de ajustes) y 283 en la web = **632**.

---

## Sesión 2026-08-12 (cont.) — ⭐ Contabilidad, capas 0 y 1: el IVA de venta (migración 062)

Jonathan abre el módulo de contabilidad con el objetivo claro: **poder presentar el modelo 303**, que es restar el IVA que le cobran los proveedores del que cobra a sus clientes. Confirmó que está en **régimen general** (no en recargo de equivalencia, que habría invalidado el módulo entero: en ese régimen no se presenta 303).

### El hallazgo que mandó sobre todo el diseño

**El IVA repercutido de una venta no era calculable. No es que fuera difícil: no estaba el dato.**

- `productos.precio` es un número **sin tipo asociado**
- `pedido_items` guardaba `precio_unitario` y nada más
- `pedidos.total` es la suma pura de líneas (sin envío, sin descuentos, sin línea de impuestos)

Y el catálogo **mezcla los tres tipos**, así que no se podía deducir aplicando uno solo. La ironía: **el IVA soportado ya estaba montado y bien** desde la 029 (`iva_pct` por línea de compra). Estaba medio libro hecho y el otro medio a cero.

⚠️ Tenía prisa por un motivo concreto: cada venta sin el dato es una venta a reconstruir a mano. Había 3 pedidos de prueba. Era el momento más barato que iba a haber.

### ⭐ El relleno salió completo, 20 de 20, sin poner nada a dedo

| Fuente | Cuántos |
|---|---|
| Sus propias líneas de compra (lo que el proveedor declaró) | 17 |
| **Su `familia`** — la columna que la 057 puso para el selector de sabores | 3 |

Los tres huérfanos eran Galleta Festival **Fresa** y **Vainilla** (sus hermanas Chocolate y Limón están al 10%) y **Quipitos Pops Caja 24** (la unidad está al 10%, y ahí es indiscutible: **es la misma mercancía física**, que es justo lo que dice el modelo de desempaquetar de la 056). Quedó **4%: 1 · 10%: 16 · 21%: 3**.

De paso, los tipos del proveedor cuadran con la ley: queso fresco al **4%** (superreducido) y Pony Malta y Jugo Hit al **21%** (refrescos con azúcares añadidos, que salieron del reducido en 2021). Es el error fácil de este catálogo.

### ⚠️⚠️ La regla de redondeo, y por qué vive en un solo sitio

Los precios son **PVP con IVA incluido**, así que la base se deriva dividiendo — y **el orden de las operaciones cambia lo que se declara**. 7 uds a 0,95 € al 21%:

| Método | Base | Cuota | Total |
|---|---|---|---|
| línea a línea y luego sumar | 5,53 | 1,12 | 6,65 |
| **agregar por tipo y dividir una vez** | **5,50** | **1,15** | 6,65 |

El total cuadra en los dos y **la base difiere en 3 céntimos**. La que se declara es la segunda. Por eso `recalcular_iva_pedido` es el único sitio que redondea, y la cuota se saca **restando** y no multiplicando: así `base + cuota` es exactamente lo cobrado.

### ⭐ Cero cambios en la ruta del dinero: todo por triggers

`confirmar_venta` y `crear_pedido_transferencia` **no se tocaron**, y es lo mejor de esta migración. Se comprobó contra las definiciones **vivas en el remoto** que las dos insertan el pedido con su total primero y las líneas después, con la misma forma exacta. Así que:

- un trigger `before insert` en `pedido_items` copia el tipo desde `productos` (snapshot, como `nombre_producto`)
- un trigger **de sentencia** `after insert` recalcula el desglose del pedido entero

Por sentencia y no por fila: por fila lo recalcularía N veces y —peor— la primera vez con el pedido a medias, que es cuando no cuadra con el total.

El trigger además garantiza lo que un `perform` explícito no puede: **que ningún camino futuro cree un pedido sin desglose**. Es el argumento de la 039 con el historial.

⚠️ El snapshot no es purismo: si Hacienda cambia un tipo —pasó con el aceite, las mascarillas y la luz—, un `join` a `productos` **reescribiría facturas ya emitidas**.

### El guardia del invariante

`recalcular_iva_pedido` **aborta si el desglose no suma exactamente lo cobrado**. Si algún día se añaden gastos de envío o un descuento, salta en el momento de la venta y no en el 303 tres meses después con el trimestre cerrado. Probado: salta.

### Probado en transacción revertida antes de aplicar

Lo que exige esta casa cuando hay dinero de por medio. Se aplicó la migración entera, se simularon **dos ventas** (una con tipos mezclados y el caso de redondeo de arriba) y se tiró todo con un `raise exception` final, que garantiza el rollback y aun así devuelve los números. Salió todo: 20/20, las dos ventas cuadrando al céntimo, los 3 históricos desglosados y el guardia saltando.

⚠️ El primer intento falló por el fixture, no por la migración: `pedidos_localizable_check` exige que el pedido tenga a quién avisar.

### ⚠️⚠️ Y de propina, un fallo de seguridad en la regla documentada

El ensayo terminó diciendo **`EJECUTABLE POR anon/authenticated: las tres funciones`** pese a haber revocado a `PUBLIC` — que es literalmente lo que manda la «REGLA PARA LA PRÓXIMA RPC» de la sesión del 11.

**Una función nace con DOS fuentes de permiso**: la herencia de `PUBLIC` (Postgres) y un grant propio a `anon`/`authenticated` que pone Supabase con `alter default privileges`. Quitar una no cierra nada, y el REVOKE no protesta. La regla está corregida más abajo, en su sitio; y de paso queda claro que **la 059 no fue inútil**: quitó una de las dos fuentes y la 060 la otra.

### Lo que se decidió para más adelante

- **Factura simplificada por defecto** (el ticket de siempre, permitido en venta a consumidor por debajo de 400 €, sin NIF ni dirección), con un «quiero factura con mis datos» que emita la completa. Encaja con que `documento_cliente` sea hoy opcional.
- ⚠️ **Antes de escribir la tabla de facturas (Capa 2), confirmar Verifactu con la gestoría.** El RD 1007/2023 obliga a encadenar registros por hash, no permitir borrado y poner un QR; **las fechas de entrada en vigor se han movido varias veces y no las doy por sabidas**. Encadenar desde el día uno es barato; retrofitarlo es horrible. La buena noticia: el diseño que exige es casi el que se quiere igualmente (inmutable, append-only, rectificativas en vez de ediciones).

### ⚠️ Ventana de despliegue: crear un producto se rompe hasta que suba la API

`productos.iva_pct` es **NOT NULL y sin valor por defecto** a propósito: un defecto sería inventarse un número que acaba en el 303, y lo peor de un número inventado es que parece puesto. Pero la API vieja no manda el campo (`insert({...dto, slug})`), así que **entre aplicar la migración y desplegar, crear un producto en el panel da error**.

Se eligió a sabiendas: **ruidoso e inofensivo** (solo el panel, solo unos minutos, ningún camino de cliente crea productos) frente a **silencioso y equivocado** (un 21% colándose en una declaración). Vender **no** se ve afectado.

Del lado contrario, la API se vuelve **más estricta** al crear productos → según la tabla de órdenes de despliegue, **basta un push**: Vercel llega antes y la web nueva ya manda el campo. El desglose en la ficha usa `?? []` para la ventana inversa.

**343 tests en la API** (+7 del DTO de IVA) y 283 en la web = **626**.

⚠️ **La regla de redondeo NO se prueba desde TypeScript, y es deliberado**: vive en SQL, y escribirla también en TS para poder testearla sería crear el segundo sitio que redondea — justo lo que esa función existe para evitar. Se verifica en transacción revertida contra el remoto.

---

## Sesión 2026-08-12 — Cabos sueltos: el `?? []` que ya no cubría nada, y el correo que nadie comprobaba

Sesión corta y deliberadamente de bajo riesgo. Tres cosas, y una de ellas **no se hizo porque no puedo**.

### 1. Fuera la tolerancia al formato viejo de permisos

Se puso para la ventana de despliegue de la 038 —Vercel llega en dos minutos y Render tarda bastante más, así que un rato la API respondía en el formato anterior— con un comentario que decía «quitar en la siguiente release». Ya iban tres.

**Antes de quitarlo se comprobó que de verdad está muerto**, que es lo único que hacía falta decidir: la API rellena el array **en su lado** en los tres sitios (`cargos.service.ts:56`, `usuarios.controller.ts:129` y `:181`, todos con su propio `?? []`), así que la respuesta nunca puede traer el campo ausente. Los tipos lo declaran no opcional, pero un tipo es una afirmación sobre JSON que llega por la red, no una garantía; por eso se miró el servidor y no solo `packages/types`.

⚠️ **Eran TRES sitios, no los dos que decía este archivo**: se había quedado sin anotar el `plantilla ?? []` de `loadPendientes` en el mismo `UsuariosPanel.tsx`. Al quitarlo, los tres `filas.map(...)` desaparecen enteros y quedan en `setStaff(filas)`.

### 2. El correo de la transferencia: 5 tests donde había un mock mudo

El estado decía «desplegado, sin probar a mano», y al abrirlo apareció algo peor: `transferencia.service.spec.ts` **mockeaba `enviarInstruccionesTransferencia` y no afirmaba nada sobre él**. Es el correo más importante de la tienda —el único que hace falta para *poder* pagar— y no había ni una prueba de que saliera.

Ahora se fija lo que estaba solo en un comentario del código:

| Se comprueba | Por qué importa |
|---|---|
| sale con IBAN, titular, importe y concepto | el concepto **es** el número de pedido: es lo único que casa el apunte del banco con el pedido |
| va al correo **del pedido**, no al del DTO | quien compra con cuenta puede no mandarlo en el checkout |
| sin correo en el pedido, cae al del DTO | y sin ninguno de los dos no se envía nada, pero **el pedido sale igual** |
| un fallo de SMTP no se lleva por delante el pedido | el pedido ya existe y retiene stock; devolver un error sobre algo que sí se creó es lo peor que podría pasar ahí |

⚠️⚠️ **La trampa de escribirlos, que vale para cualquier aviso que salga con `void`**: el envío es fire-and-forget a propósito (el cliente está esperando su IBAN en pantalla y SMTP tarda segundos). Un test que afirme justo después de `await crearPedido()` **mira antes de que el correo haya salido** — y como afirmaría sobre un array vacío que aún no se ha llenado, un `expect(correos).toEqual([])` pasaría en verde estando todo roto. Hay que drenar la cola de microtareas primero (`dejarSalirElAviso`, con `setImmediate`).

⚠️ **Y esto NO sustituye a la prueba a mano.** Cierra la regresión: que nadie rompa el envío sin enterarse. Pero **nadie ha visto todavía ese correo en una bandeja de entrada**, y lo que falla en un correo real —que SendGrid lo acepte, que no caiga en spam, que el HTML se lea en el móvil— no lo caza ningún test. Sigue en la lista.

Los espías van sobre `Logger.prototype`, no sobre `console` (la lección del 11).

### 3. ⚠️ Lo del CORS no se hizo: es del dashboard de Render

`CORS_ORIGIN` es `sync: false` —se rellena a mano en Render— y los tokens de despliegue están revocados desde el 2026-07-25. **Se midió, que es lo que sí podía hacer**, sondeando `api.valatino.es` con distintos `Origin`:

| Origen | Hoy |
|---|---|
| `https://valatino.es` · `https://www.valatino.es` | permitidos |
| `https://valatino-api-steel.vercel.app` | **permitido** — es el que sobra |
| `http://localhost:3000` | permitido |
| `https://valatino-<hash>.vercel.app` (preview) | denegado (`CORS_VERCEL_PREVIEW_PREFIX` sin poner) |
| origen ajeno | denegado |

**Valor a dejar**: `https://valatino.es,https://www.valatino.es,http://localhost:3000`.

- ⚠️ **Cambiarlo por API no basta**: guardar la variable por REST **no dispara redespliegue** y el proceso sigue con el valor viejo en memoria (lección del 2026-08-05). Por el panel sí.
- ⚠️ **Desde la auditoría, esa lista alimenta también el middleware anti-CSRF** (`common/origenes-permitidos.ts`), no solo CORS. Quitar el origen le corta además las **escrituras**, que es justo lo que se busca, pero conviene saberlo antes de tocarlo.
- **`http://localhost:3000` se deja**: sirve para apuntar la web local contra la API de producción y el riesgo es teórico (haría falta que la víctima tuviera algo escuchando en su propio puerto 3000).
- El comentario de `render.yaml` **mentía** —decía «la URL de tu web en Vercel», de cuando la tienda vivía ahí— y se ha corregido: es el fichero que le dice a quien despliegue qué poner en el dashboard.

**619 tests** (336 en la API, 283 en la web), `type-check` y `lint` en verde.

**Desplegado y verificado**: build nuevo en Vercel a los 40 s del push; home, `www`, carrito, checkout, login y `api.valatino.es/health` a 200; las 6 cabeceras intactas y la CSP todavía en `Report-Only`. **Jonathan comprobó TI → Cargos en pantalla**: los chips de los seis cargos salen bien.

⚠️ **TI → Usuarios no sirve para comprobar esto, y conviene saber por qué**: la API devuelve `permisos: []` a los admin a propósito (un súper admin lo puede todo, los chips sobran), y hoy solo existe esa cuenta con Gestión Humana vacío. Esa pantalla saldría sin chips y sin pendientes con el cambio o sin él. Cargos era el único sitio donde se podía ver de verdad.

---

## Sesión 2026-08-11 — Auditoría de ciberseguridad: se cierra la escalada de privilegios

Jonathan encargó una auditoría (P0/P1/P2 con criterios de aceptación). Esta sesión cierra **el P0 de escalada** y **el P1 de cabeceras**; el resto va en la continuación de abajo.

> 📄 **El informe original ya no está en el árbol**: se borró al terminar, porque lo que había que hacer con él está hecho y lo que queda vive en «Pendientes de Jonathan». **Sigue entero en el historial** — se recupera con
> `git show 908af36:AUDITORIA_CIBERSEGURIDAD_2026-08-08.txt`
> y ahí están sus criterios de aceptación, por si hay que volver a certificar algo.

Primero se comprobó hallazgo por hallazgo contra el código, no contra el informe: **todos seguían vivos**.

### ⭐ 1. El rol ya no puede venir del propio usuario

`jwt.strategy.ts` decidía el rol así:

```
dbRole ?? payload.user_metadata?.role ?? "cliente"
```

⚠️⚠️ **`user_metadata` lo escribe el DUEÑO de la cuenta** (`supabase.auth.updateUser`), así que ese respaldo convertía un campo del usuario en una fuente de autorización. Bastaba con no tener fila en `user_roles` para que un token con `"role": "admin"` dentro entrase al panel.

**Ahora `user_roles` es la única fuente**, con tres salidas y las tres cerrando hacia abajo:

| Caso | Qué pasa |
|---|---|
| una fila | ese rol |
| sin fila | `cliente` — mínimo privilegio, y queda un `warn` (un cliente normal SÍ tiene la suya, la pone `assign_default_role`) |
| error de consulta, o **más de una fila** | se deniega, con el detalle solo en el log |

- **`user_metadata` se borró del tipo `SupabaseJwt`**, no solo de la expresión. Mientras el campo siga declarado en el tipo que alimenta la autorización, alguien lo volverá a usar.
- ⚠️ **Al denegar, ojo con `OptionalJwtGuard`** (carrito, checkout): se traga la excepción y la petición sigue **como anónima**, no como 401. Es la degradación correcta —sin privilegios—, pero explica por qué un usuario identificado podría verse como invitado si Supabase falla.
- **Comprobado antes de tocar nada**: el `raw_user_meta_data` del admin **no tiene rol** (solo `nombre`), así que quitar el respaldo no dejaba a nadie fuera de su propio panel. Si su rol hubiera vivido ahí, este cambio lo habría echado.

### ⭐ 2. Un usuario, un rol — y lo garantiza la BD (migración 058)

La PK era **`(user_id, role_id)`**: la tabla **admitía** que alguien tuviera `cliente` y `admin` a la vez. Lo único que lo impedía era que la aplicación borrase antes de insertar, y el comentario del código lo decía tal cual («reemplazar = borrar + insertar garantiza un único rol»).

> ⚠️ **Es la lección de la 055 otra vez**: una restricción que depende de que la aplicación se acuerde **no es una restricción**. Y aquí había además un agujero real — el borrado previo **no comprobaba su error**, así que un delete fallido dejaba dos filas y nadie se enteraba.

**Y con dos filas el rol quedaba indeterminado**: tanto `get_user_role()` como `JwtStrategy` leían con `LIMIT 1` **sin `ORDER BY`**. Cuál de los dos roles ganaba lo decidía Postgres.

- PK ahora **`(user_id)`**. Un segundo rol es un `23505`.
- La migración **aborta si encuentra duplicados** en vez de elegir uno: escoger por el usuario sería adivinar cuál era el bueno.
- **Probado en el remoto en transacción revertida**: insertar un segundo rol al admin → `unique_violation`. Después, 1 fila y 1 cuenta, sin rastro.
- Se aplicó **antes** del despliegue del código a propósito: es compatible hacia atrás, porque todo lo que escribe roles borra antes de insertar.
- `usuarios.controller.ts` ahora **sí comprueba el error del borrado**. Sin eso el mensaje sería un `23505` incomprensible en vez de decir qué pasó.

### 3. Cabeceras de seguridad en la web

`next.config.mjs` **no tenía bloque `headers()`**: cero CSP, cero protección de marco, cero `nosniff`.

**Se aplican ya** (no pueden romper nada): `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` y una `Permissions-Policy` mínima. El HSTS que pone Vercel sigue igual.

⚠️ **La CSP completa va en `Report-Only` A PROPÓSITO**, como pide la auditoría. Aplicarla de golpe sobre `main`, que auto-despliega, es arriesgarse a tumbar el checkout en producción, y **un pago que falla no se reintenta**.

⚠️⚠️ **La trampa que se cazó escribiéndola**: `connect-src 'self'` **habría roto la página de confirmación del pedido**. Casi todo el navegador pasa por el proxy `/api`, pero **la confirmación y el widget de calificar llaman a `api.valatino.es` directamente**. El cliente habría pagado y se habría quedado mirando una confirmación que no carga. Por eso el origen de la API va explícito, y **derivado de `NEXT_PUBLIC_API_URL`** para que no haya que acordarse de tocar dos sitios el día que cambie.

- ⚠️ **`payment` NO se cierra** en la `Permissions-Policy`: es lo que usan Apple Pay y Google Pay vía Stripe. Cerrarlo apagaría medios de pago sin que nadie relacionara la causa con ese fichero.
- ⚠️ **El punto flojo es `script-src 'unsafe-inline'`, y es de Next**: el App Router inyecta el payload RSC en `<script>` inline. Quitarlo exige nonces por middleware, y eso **obliga a render dinámico** — adiós al `revalidate: 60` de las fichas. Es una decisión con precio, no un olvido.
- **Verificado con `next build` + `next start`**: las 6 cabeceras salen, y las páginas siguen estáticas (`○`), o sea que no forzaron render dinámico.

### ⚠️ Cómo se aplica la CSP cuando toque

Recorrer en el navegador **con la consola abierta**: login por código, catálogo, carrito, y pagar con **tarjeta, Bizum, PayPal y transferencia**. Si no sale ni un aviso de CSP, mover el valor de `CSP` a la cabecera que se aplica y borrar la línea de `Report-Only`. Está todo señalado en el fichero.

### Tests: 9 pruebas negativas de autorización (308 en la API)

`jwt.strategy.spec.ts`. La mitad existen **para que no vuelva el respaldo**: un token con `user_metadata.role = "admin"` y sin fila en `user_roles` tiene que salir `cliente`.

- ⚠️ **`jwks-rsa` arrastra `jose` v6, que es solo ESM y Jest (CJS) no puede cargar.** Se mockea `jwks-rsa` en el spec. La firma del token la verifica `passport-jwt` **antes** de llegar a `validate()`; aquí se prueba lo que pasa después.
- Los espías tienen que ir sobre `Logger.prototype`, **no sobre `console`**: el Logger de Nest no escribe ahí, así que espiar `console` no silencia nada y encima parece que sí.

### ⚠️ Hallazgo de propina: `pnpm lint` de la API nunca ha funcionado

`apps/api/package.json` tiene el script `lint` pero **eslint no está en sus dependencias**. Es anterior a esta sesión. Importa para el **P2 (CI)**: un CI que corra `pnpm turbo lint` falla el primer día.

---

## Sesión 2026-08-11 (cont.) — El resto de la auditoría

### ⭐⭐ 4. Lo más grave no lo dijo la auditoría: el inventario se movía desde internet

El **Security Advisor de Supabase** destapó que `desempaquetar_producto` es `SECURITY DEFINER` y tenía `EXECUTE` para `anon`. O sea: llamable desde internet por `/rest/v1/rpc/` **con la clave anon, que ES pública** — va dentro del bundle de la web, se lee viendo el código fuente.

⚠️⚠️ **Y esa función MUEVE INVENTARIO**: `−1 caja → +N unidades`. Los UUID de producto también son públicos (los sirve el catálogo), así que cualquiera podía deshacer cajas hasta descuadrar el stock. Al ser `SECURITY DEFINER` corre con los permisos del dueño, de modo que **el RLS no la frenaba**.

**No es teórico**: se llamó con `p_bultos = 0`, que la propia función rechaza antes de tocar nada, y respondió con su mensaje de validación en vez de un error de permisos. El permiso estaba y se entraba en el cuerpo.

Con ella iban `resumen_calificaciones` y `registrar_cambio_estado_pedido`. La práctica de revocar `EXECUTE` **ya existía aquí** (`reservar_carrito`, `confirmar_venta`, `ajustar_stock` y `registrar_factura_compra` la tienen bien); lo que pasó es que las funciones nuevas —la 056 y la 042— no la heredaron.

#### ⚠️⚠️ Y LA 059 NO BASTÓ. Esta es la lección de la sesión

> **En Postgres una función NACE con `EXECUTE` para `PUBLIC`.** `anon` y `authenticated` no tenían permiso propio que quitar: lo heredaban de `PUBLIC`. Así que `REVOKE ... FROM anon, authenticated` **no revocó nada** y las funciones siguieron llamándose igual.

Se vio **porque se probó después de aplicarla**, no porque lo dijera el `REVOKE`. En el ACL se lee a simple vista:

```
desempaquetar_producto -> =X/postgres | postgres=X/... | service_role=X/...
                          ^^^^^^^^^^^ ese "=X" sin nombre delante ES PUBLIC
reservar_carrito       -> postgres=X/... | service_role=X/...
                          (sin "=X": aquí sí se revocó a PUBLIC en su día)
```

La **060** revoca a `PUBLIC` y ahí sí: `42501 permission denied` en las tres.

⚠️ **REGLA PARA LA PRÓXIMA RPC** que no llame el navegador: `REVOKE EXECUTE ON FUNCTION <nombre>(<tipos>) FROM PUBLIC, anon, authenticated;` y **comprobarlo** con `has_function_privilege('anon', ...)`, sin dar por hecho que el REVOKE hizo algo.

> ⚠️⚠️ **CORREGIDO EL 2026-08-12: hay que revocar a los TRES, y esta sección decía solo `PUBLIC`.** Escribiendo la 062 se probó revocar únicamente a `PUBLIC` en una función nueva y `has_function_privilege('anon', …)` seguía diciendo `true`.
>
> El motivo: una función del esquema `public` nace con **dos** fuentes de permiso, no una. La herencia de `PUBLIC` (cosa de Postgres) **y un grant propio a `anon` y `authenticated` que pone Supabase** con `alter default privileges`. Se ve en `pg_default_acl`:
> `anon=X/postgres | authenticated=X/postgres | service_role=X/postgres`
>
> Así que **la 059 no fue inútil como quedó escrito arriba**: quitó la segunda fuente, y la 060 quitó la primera. Hicieron falta las dos, y por eso funcionaron juntas. El ACL de aquellas lo confirma hoy — `desempaquetar_producto` está en `postgres=X/postgres | service_role=X/postgres`, sin el `=X` suelto de PUBLIC y sin `anon` ni `authenticated`.
>
> Quitar una sola de las dos fuentes no cierra nada **y el REVOKE no protesta**. De ahí que comprobar no sea opcional.

- `mi_cargo` conserva su grant a `authenticated` (la llama `lib/auth/staff.ts` con sesión y siendo staff) y pierde el de `anon`.
- ⚠️ **`get_user_role` no se puede arreglar revocando**: la usan **once políticas RLS de ocho tablas**, se evalúan con el rol de quien consulta, y quitarle el `EXECUTE` reventaría esas lecturas — **peor aún de forma intermitente**, porque Postgres no garantiza el orden de evaluación de las políticas permisivas. **Se cerró de otra manera en la 061** (ver abajo).
- Comprobado después que no se rompió nada: el trigger del historial del pedido **sigue disparando** (1 evento al alta, 2 tras cambiar estado, en transacción revertida y sin dejar rastro).

### 4-bis. Dependencias: Multer por override, y por qué hacía falta

`pnpm audit --prod` daba **43 avisos (18 altos)**, igual que decía el informe. De los altos, **los 4 de Multer eran los únicos en código alcanzable por una petición**: las subidas de imágenes y de PDF de facturas. Todos de denegación de servicio.

⚠️ **`@nestjs/platform-express@10` fija Multer en 2.0.2 EXACTO**, no en un rango, así que no se arregla actualizando el lockfile. Nest 11 ya trae 2.2.0, o sea que el override **adelanta lo que vendrá solo** al subir de mayor. Se quita al llegar a Nest 11.

`uuid` pasó de 10 a 11 (aviso moderado de comprobación de límites del buffer en v3/v5/v6; aquí solo se usa `v4` y sin `buf`, así que no era alcanzable, pero es dependencia directa y el salto es barato). Se quitó `@types/uuid`: v11 trae sus propios tipos.

### 5. Subidas: `fileSize` no limitaba lo que parecía

Los dos `FileInterceptor` solo acotaban el tamaño del fichero, y en Multer **`fields`, `parts` y `files` valen `Infinity` por defecto**. Un envío con cien mil campos de texto diminutos pasa el límite de 10 MB del PDF sin despeinarse y tiene al proceso parseando. Los cuatro avisos altos de Multer eran de eso.

Ahora van acotados los seis, y un límite superado responde **413/400** en vez del 500 genérico.

⚠️ **Dato que ajusta la gravedad, comprobado y no supuesto**: en Nest **los guards corren ANTES que los interceptores**, así que Multer solo parsea después de pasar `JwtGuard`, `RolesGuard` y `ModulosGuard`. Estas rutas no son alcanzables sin cuenta del equipo. Sigue mereciendo el arreglo —queda la cuenta comprometida— pero no era una puerta abierta a internet.

### 6. Los errores dejan de irse de la lengua, y se corta EN EL BORDE

Había una docena de sitios lanzando `InternalServerErrorException` con el mensaje del proveedor interpolado (`No se pudo crear la cuenta: duplicate key value violates unique constraint ...`).

**Se depura en el filtro global, no sitio a sitio**: cualquier **5xx** sale genérico y con un **id de incidencia** de 8 caracteres, lo lance quien lo lance. Depurarlo en cada sitio es volver a la trampa de la 055 — funciona hasta que alguien añade el número trece. El detalle va entero al log con el mismo código que ve el cliente.

Los **4xx no se tocan**: su mensaje es lo que el usuario necesita. Pero faltaba el otro lado — tres sitios devolvían **cualquier** `error.message` de una RPC como 400, y ahí caben los de Postgres. ⚠️ **La frontera es el SQLSTATE**, que ya usaba `checkout.service.ts`: `raise exception` sin `errcode` da **P0001**, que es exactamente «lo ha escrito una persona en la migración». Lo demás lo genera el motor y se queda en el log.

### 7. ⚠️ El límite de peticiones no limitaba a quien parecía

Detrás de Render la conexión la abre **su** proxy, así que `req.ip` era la IP del proxy: **todo el mundo compartía el mismo cubo de 100/min**. Con cuatro personas navegando ya se reparten la cuota. Era un problema de disponibilidad tanto como de seguridad.

⚠️⚠️ **Y el arreglo fácil es peor**: `trust proxy: true` hace que Express se crea el `X-Forwarded-For` entero, y esa cabecera **la escribe quien quiera** — cualquiera se inventaría una IP nueva por petición y no habría límite ninguno. Por eso se confía en un **número concreto de saltos**, que llega en `TRUST_PROXY_HOPS`.

- **Por defecto 0** (no confiar en nadie), que es lo correcto en local. **No se deduce de `NODE_ENV`** a propósito: durante meses estuvo en `development` en Render pese a que `render.yaml` decía `production`, así que decidirlo con esa variable habría dejado producción con la configuración de local. (Se corrigió después —hoy está en `production`—, pero eso es justo lo que la descalifica como señal: una variable que puede quedarse mal sin que nadie se entere no puede decidir en qué IP se confía.)
- **Quedarse corto es seguro y pasarse no**: con menos saltos de los reales se agrupa gente bajo una IP intermedia (impreciso, pero nadie la falsifica); con más de los reales se lee un valor que pone el atacante.
- Techos por operación: **crear pago 15/min** (15 y no 5 porque a quien le rechazan la tarjeta reintenta, y quedarse corto es no dejar comprar a alguien que quiere pagar), **carrito 40/min** solo en las escrituras —el `GET` lo pide la barra de navegación en cada carga— y **subidas 20/min**.
- **Webhooks exentos, y solo ellos**: un 429 ahí es un pago cobrado cuyo pedido **no** se crea.
- **Redis NO se añade**: el plan free corre UNA instancia, así que el contador en memoria es correcto hoy.

### 8. CSRF: la cookie volvía como de tercera parte sin necesitarlo

`sameSite=none` era de cuando la web vivía en `*.vercel.app` y la API en `*.onrender.com` — dos sitios distintos para el navegador. **Comprobado contra producción antes de tocarlo**: hoy la cookie vuelve por el proxy `/api` y el navegador la guarda en `valatino.es`, de primera parte.

⚠️ **Y `none` no solo sobraba: era lo que abría el CSRF.** Una web ajena podía lanzar un POST a `valatino.es/api/...` y el navegador adjuntaba la cookie. **CORS no lo impide** — impide *leer* la respuesta, no *enviar* la petición, y para cambiar un carrito no hace falta leerla.

Segunda capa: middleware que rechaza escrituras cuyo `Origin` (o `Referer`) no esté permitido. ⚠️ **Sin `Origin` ni `Referer` se deja pasar**, y no es un hueco: los navegadores ponen `Origin` en todo lo que escribe, así que su ausencia significa que no hay navegador detrás (Stripe, un health check, curl).

- **Comprobado que Next REENVÍA `Origin` al cruzar el rewrite `/api`**, así que la comprobación cubre también esa ruta, que es por donde va casi todo.
- La lista de orígenes se sacó a `common/origenes-permitidos.ts` porque ahora la comparten CORS y esto.

### 9. CI, y las dos mentiras que había que arreglar antes

`.github/workflows/ci.yml` con tres trabajos: verificar (tipos, lint, tests y **build**), secretos (gitleaks + comprobación propia) y auditoría de dependencias.

1. ⚠️ **Ninguna de las dos apps tenía linter que funcionase.** El de la API invocaba `eslint` sin tenerlo en dependencias —no se ejecutó nunca— y el de la web abría el asistente interactivo de `next lint`, que en CI se colgaría. Se quita el de la API y se configura de verdad el de la web. **Al ponerlo a funcionar apareció un error real**: `PermisosProvider` tenía un hook llamado `usarContexto`; al no empezar por `use`, React no podía comprobar el orden de los hooks.
2. ⚠️ **El escaneo propio daba falso positivo**: con los prefijos sueltos, `sb_secret_` saltaba en **ESTADO.md**, que los nombra al contar qué se filtró en su día. Ahora cada patrón exige cuerpo de clave detrás. Un CI que salta con la documentación se acaba ignorando.

⚠️ **Los pasos van SEPARADOS y no en un `turbo type-check lint test build`**: juntos, turbo corre type-check y build a la vez y se pisan en `.next/types`. Da un rojo intermitente, que es el peor porque enseña a reintentar en vez de a mirar.

### ⭐ 10. Next 15 — hecho, EN RAMA `subida-next-15`, sin desplegar

**De 43 avisos a 8, y de 18 altos a 1.**

Va en rama a propósito: la auditoría exige probar a mano App Router, imágenes, checkout, Stripe y PayPal antes de desplegar, y `main` auto-despliega sobre una tienda viva.

Sube `next` 14.2.35 → 15.5.x con React 19 detrás, y con él `@stripe/react-stripe-js` 2→6, `@stripe/stripe-js` 5→9, `@paypal/react-paypal-js` 8→10, `framer-motion` 11→12 y `sonner` 1→2.

⚠️ **Overrides de `postcss` y `nanoid` porque NEXT 15 SIGUE FIJANDO `postcss 8.4.31`** — esos altos no se arreglan subiendo Next. Y de `sharp`, que sí es de ejecución: la trae Next 15 para optimizar imágenes y arrastra cuatro CVE de libvips.

Tres cambios que exige Next 15: **`params` es una promesa** (solo afecta a `productos/[slug]`; las tres del panel leen su id en cliente), **`cookies()` es asíncrona** y `serverComponentsExternalPackages` se renombró.

**Lo que queda, con su motivo**: `lodash` (el único alto) **no tiene parche publicado** —dice «parche >=4.18.0» y esa versión no existe—; comprobado que no es alcanzable, porque `@nestjs/config` solo hace `require` de `lodash/get`, `has` y `set`, así que `_.template` ni se carga. El resto (`file-type`, `@nestjs/core`, `qs`, `body-parser`) cae con la subida a **NestJS 11**, que es otra migración.

**Probado arrancando de verdad**: home, carrito, checkout, login, términos y privacidad a 200; `/productos/<slug>` a 200 con su `<title>` saliendo de `generateMetadata`; las 6 cabeceras intactas; la home recuperando sus 35 enlaces al revalidar el ISR; y ni un error en el log de Next.

### ⭐ 11. `get_user_role`: cerrada sin tocarle los permisos (migración 061)

Quedaba llamable por REST con la clave anon: le pasabas un UUID y te decía el rol de esa cuenta. Poco, pero es un dato de autorización respondiendo a quien pregunte.

⚠️ **Revocar el `EXECUTE` no valía**, por lo dicho arriba: la evalúan once políticas con el rol de quien consulta.

**Lo que sí funciona: sacarla del esquema expuesto.** PostgREST solo publica `public`; moviéndola a **`interno`** desaparece de la API REST, y las políticas siguen funcionando porque **guardan el OID de la función, no su nombre**, y mover de esquema no cambia el OID. Es lo que sugiere el propio advisor.

- **Probado antes de aplicarlo**, en transacción revertida y con `set_config` simulando la sesión del navegador: `authenticated` sigue leyendo `user_roles`, `pedidos`, `direcciones_envio` y `transacciones_pago`; `anon` sigue viendo los 19 productos; ni un error de permisos.
- **Y comprobado después contra el REST real, por los dos caminos**: `public.get_user_role` da `PGRST202` (no existe), y pedir el esquema nuevo a mano da `PGRST106` («Only the following schemas are exposed: public, graphql_public»).
- ⚠️ **Si algún día se edita esa función**, el `CREATE OR REPLACE` tiene que ir contra **`interno.get_user_role`**. Escribirlo contra `public` no la reemplaza: crea otra, la vuelve a publicar en la API y deja dos definiciones que se separan sin que nadie lo note.
- El `GRANT USAGE` sobre `interno` no la abre: lo que decide qué publica PostgREST es el esquema, no los permisos.

**Cómo quedó el Security Advisor**: la categoría «ejecutable por `anon`» pasó de **5 a 0**. De `authenticated` queda solo **`mi_cargo`**, y debe seguir ahí: la llama el navegador con sesión y solo devuelve el cargo de quien pregunta. Los 13 avisos INFO de «RLS sin políticas» tampoco son fallo — significan denegar a todos, y la API entra con `service_role`.

### ⭐ 12. Y lo que lo valida todo: una compra real, después de los cambios

Jonathan compró **después** de desplegarlo todo, y eso vale más que cualquier prueba que yo pueda montar. Pedido **`260811010611`**, 1 × Pony Malta Cristal, 1,50 €, **Bizum**. La secuencia entera en **1,6 segundos**:

| | |
|---|---|
| 21:15:48.920 | estado → PROCESANDO |
| 21:15:49.488 | pago · `payment_intent.succeeded` · 1,50 € |
| 21:15:50.534 | correo · Confirmación de tu pedido |

Y lo que no se ve en la ficha: transacción registrada como exitosa, **0 reservas vivas**, `stock_reservado` a 0, ningún stock negativo y el carrito vaciado.

**Por qué importa el CUÁNDO**: demuestra de una sentada que el webhook de Stripe sigue entrando —no lo frenan ni el CSRF ni el límite de peticiones, que era el riesgo real de esos dos cambios—, que la sesión del carrito funciona con `SameSite=Lax`, y que el checkout de Next 15 cobra.

### Cómo queda la auditoría

| Bloque | Estado |
|---|---|
| **P0 escalada de privilegios** | ✅ cerrado y desplegado |
| **P0 dependencias** | ✅ **fusionado y desplegado** el 2026-08-11: Jonathan confirmó que el proyecto está en pruebas y sin clientes reales, así que no había venta que perder esperando |
| **P1 uploads** | ✅ cerrado y desplegado |
| **P1 CSRF / cookies / cabeceras** | ✅ cerrado y desplegado (la CSP completa sigue en `Report-Only`) |
| **P1 rate limit y errores** | ✅ cerrado. `TRUST_PROXY_HOPS=1` **puesto en Render y verificado en el log de arranque** (`Confiando en 1 salto(s) de proxy`) |
| **P2 Supabase remoto** | 🟡 Security Advisor pasado y cerrado todo lo del esquema (059, 060 y 061): **ninguna función es ya ejecutable por `anon`**. Faltan **MFA del staff** y la **protección de contraseñas filtradas**, que son del Dashboard |
| **P2 CI y evidencias** | ✅ montado |

---

## Sesión 2026-08-06 (cont. 2) — Catálogo: borradores, factura única, desempaquetar y formatos

Cuatro cosas encadenadas, todas nacidas de subir **la segunda factura de compra** (`202521893`, 12 líneas, 172 uds, 115,78 € c/IVA).

### 1. Crear un producto que falta sin salir de la factura

Al registrar la factura aparece mercancía que no está en el catálogo, y había que abandonar el formulario a medias, ir a Catálogo, crear el producto —sin tener la foto a mano— y volver a empezar.

**`activo: false` era la pieza que ya existía** y significa exactamente lo que hacía falta: está en el almacén pero no en la tienda. Por eso da igual que no haya foto ni precio definitivo. La última opción del desplegable de cada línea abre un modal de tres campos y deja el producto seleccionado en **esa** línea.

- **No hizo falta nada nuevo por debajo**: `CreateProductoDto` ya aceptaba `activo` e `imagenes` vacío (la columna tiene `default '{}'`), y el desplegable de compras y el catálogo del panel ya cargaban con `soloActivos=false`.
- ⚠️ **El precio se pide aunque sea provisional** (`CHECK (precio > 0)`), y **a propósito no se rellena con el costo de la factura**: un precio que parece puesto es un precio que nadie revisa, y así se acaba vendiendo al costo.
- **Funcionó**: 6 productos creados sin salir del formulario, con su stock dentro y **ninguno visible para los clientes**.
- ⚠️ El primer intento se puso como enlace debajo del `select` y quedaba pegado a «Añadir línea». Jonathan lo rechazó y pasó a ser **la última opción del propio desplegable**, con un centinela que **nunca se guarda en el estado**: así cancelar no deja la línea apuntando a un valor que no existe.

### 2. ⚠️ El número de factura, obligatorio y único (migraciones 054 y 055)

**Lo que protege no es el orden del dato: registrar dos veces la misma factura DUPLICA EL STOCK**, porque `registrar_factura_compra` suma las unidades de cada línea. Un doble clic o no acordarse de si ya se subió metía unidades que no existen en el almacén, y eso no se descubre hasta que falta mercancía para servir un pedido.

⚠️⚠️ **Y la lección de cómo se descubrió que la 054 no bastaba**: al **probarla** en el remoto, `'202521188'` se rechazaba pero **`'202521188 '` con un espacio final entraba** como factura distinta. El índice iba sobre `upper(numero_factura)` sin recortar. La API sí recortaba, así que por el formulario no podía pasar — pero **una restricción que depende de que la aplicación limpie el dato no es una restricción**: cualquier script, el editor SQL o un endpoint futuro se la salta. La **055** lo pasa a `upper(trim(...))` y añade un CHECK contra el número en blanco, porque `NOT NULL` acepta `''` y `'   '`.

- El `23505` se traduce a un **409** que dice que esa compra ya está registrada, no a un «duplicate key».
- ⚠️ **La unicidad es GLOBAL a sabiendas.** En contabilidad el número es único **por emisor**, así que dos proveedores podrían colisionar legítimamente. Hoy hay uno y la protección vale más. La alternativa —`(proveedor_id, upper(trim(...)))`— **exigiría hacer el proveedor obligatorio primero**: en un índice único los NULL son distintos entre sí, así que las facturas sin proveedor se quedarían sin protección.

### 3. Caja vs unidad: desempaquetar (migración 056)

Jonathan compra la **caja** de Quipitos pero quiere vender también la **unidad**.

⚠️ **El problema de fondo**: caja y unidad comparten la misma mercancía física. Con dos productos y stock independiente, vender una unidad no descuenta nada de la caja, así que se venden unidades que están dentro de una caja ya vendida.

**Lo que se descartó**: un solo stock con factores de conversión, que es el modelo correcto en abstracto. Mete la conversión dentro de `reservar_carrito`, `confirmar_venta`, `stock_reservas` y los reembolsos con reposición — **la ruta por la que pasa el dinero**, y justo los invariantes que costó arreglar en la 052. Misma razón por la que los sabores tampoco son variantes en BD.

**Lo que se hizo**: la operación que ocurre de verdad en la tienda — **abrir una caja**. `−1 caja → +N unidades` en una transacción, con tabla `desempaquetados` que registra qué, cuánto y quién (con los nombres en snapshot, como `pedido_items`).

⚠️⚠️ **CLAVE DEL MODELO DE STOCK, y me lo dijo el código y no la intuición: `stock_disponible` YA es el stock libre.** `reservar_carrito` hace `stock_disponible − cantidad` **y** `stock_reservado + cantidad`: reservar **MUEVE** unidades de un cubo al otro, no marca un subconjunto. Por eso `stock_disponible >= bultos` basta para no desempaquetar cajas reservadas en un checkout. Iba a restar lo reservado y habría permitido desempaquetar mercancía comprometida. **Si esto cambia, revisar la comprobación.**

- Las dos filas se bloquean **en orden de id**: dos desempaquetados cruzados que las tomaran al revés se bloquearían entre sí.
- **Probado en transacción revertida**: 2 bultos de 12 mueven la caja 24→22 y la unidad 36→60 con su apunte, y se rechazan sin stock, mismo producto, bultos 0 y factor negativo. Verificado después que no quedó rastro.

### 4. ⚠️ Lo que Jonathan quería de verdad no era eso

Yo entendí «poder vender los dos formatos»; él quería que **el CLIENTE eligiera** entre 4 unidades o 1 caja **en la misma ficha**. No es lo mismo: desempaquetar es una operación de almacén que el cliente no ve.

Se resolvió con el truco que la tienda **ya usaba para los sabores**: productos independientes + **agrupado visual** con selector. Es trabajo de escaparate, no de checkout — el carrito guarda «2 × Quipitos Caja 24» como cualquier producto.

`lib/productos/sabores.ts` se generalizó a **`variantes.ts`** con la palabra clave como parámetro (`Sabor` / `Formato`). Cambios de fondo: el **tipo entra en la clave del grupo** (un sabor no agrupa con un formato), el discriminante de `ItemCatalogo` pasa de `tipo` a **`clase`** (tener dos `tipo` a un nivel de distancia es de donde salen los bugs que se leen bien), y plural explícito.

⚠️ **La limitación que esto NO arregla**: los stocks van por separado. Con 2 cajas y 0 unidades sueltas el cliente **no puede comprar unidades** aunque haya 48 dentro. **El selector es el escaparate; desempaquetar es el almacén.** Se complementan, no se sustituyen.

### ⭐ PRIMEROS TESTS DE LA WEB (17) — y por qué aquí

Era el hueco más grande del proyecto. Se montaron **porque hacían falta**: se estaba refactorizando lógica que ya corría en producción y que ven los clientes, sin ninguna red. La mitad existen solo para **demostrar que el comportamiento de los sabores no cambió**.

**Y se pagaron en la primera ejecución**: cazaron que `"sabor" + "s"` daba **«3 sabors»** en la tarjeta del catálogo. En español las palabras acabadas en consonante hacen el plural en `-es`. Eso habría llegado a los clientes.

- `apps/web/jest.config.js`, `pnpm --filter @valatino/web test`, y `pnpm turbo test` ya cubre los dos paquetes. **316 tests** (299 API + 17 web).
- De momento solo **lógica pura** (`lib/`). Para componentes haría falta `jsdom` + `@testing-library/react`; no se añade hasta que se necesite.

### ⭐ 5. La convención de nombres fuera: campos propios (migración 057)

Al ir a usarlo Jonathan lo rechazó, y con razón: sus productos se llaman **«Quipitos Pops Caja 24 Unidades»** y **«Quipitos Pops C/U»**, no «Quipitos Formato Caja 24».

> ⚠️ **Forzar el nombre del producto para que el código pueda parsearlo es hacerlo al revés.** El nombre es del negocio; que dos productos sean el mismo artículo en dos presentaciones es un dato del sistema y tiene que ser explícito.

La convención fue un atajo razonable cuando solo había sabores y encajaba en el nombre («Galleta Festival Sabor Fresa» se lee bien). Con los formatos dejó de encajar, y **eso era la señal**.

| Columna | Para qué |
|---|---|
| `familia` | Qué los hace hermanos, y **el título que ve el cliente** («Quipitos Pops») |
| `variante` | La etiqueta de la pastilla que elige («C/U», «Caja 24 unidades») |
| `variante_tipo` | Solo decide si la ficha dice «Formato:» o «Sabor:» |

- **CHECK: los tres o ninguno.** Una familia sin variante pintaría una pastilla vacía; una variante sin familia no tiene con quién agruparse. El formulario lo resuelve solo, para no tener que entender la restricción al rellenarlo.
- **Se agrupa SOLO por familia, sin exigir la misma categoría**: si alguien la escribió, lo dijo a propósito, y exigir la categoría solo daría grupos partidos en dos sin explicación visible.
- Índice sobre `lower(trim(familia))` + agrupado que ignora mayúsculas y espacios + **datalist de familias ya usadas**: sin eso se acaba con «Quipitos Pops» y «Quipitos pops» como dos familias.
- ⚠️ **Se ELIMINÓ el parseo del nombre** en vez de dejarlo como respaldo: dos mecanismos para lo mismo acaban divergiendo, y el que se olvida es el que falla. Backfill verificado: las 4 Galleta Festival y el Jugo Hit quedaron con su familia, el resto como productos sueltos.

### ⚠️ Y el formulario, rediseñado a la segunda: el orden de las preguntas ERA el problema

Jonathan: *«este menú es confuso […] lo que dices en qué se diferencia no lo entiendo si ya dije si era caja o unidad»*.

**Tenía razón y era culpa del diseño**: el formulario le preguntaba algo que solo le hace falta al código (`variante_tipo`) y **se lo preguntaba DESPUÉS de que hubiera escrito «C/U»**, cuando ya lo había dicho. **Preguntar al final lo que condiciona lo de antes es lo que lo hacía confuso.**

Ahora va de general a concreto, como se piensa: **1)** ¿es otra presentación? No/Sí · **2)** familia · **3)** ¿qué cambia, la cantidad o el sabor? · **4)** el valor, **que se adapta** — desplegable de envases si cambia la cantidad, texto libre si cambia el sabor.

- El desplegable no podía enumerar todas las cantidades («Caja 24 unidades»), así que se parte en **envase + cuántas** y la etiqueta se arma sola (`etiquetaFormato`). Al editar se reparte al revés, y **si no reconoce el patrón va a texto libre** en vez de inventarse un envase y perder lo escrito.
- Se muestra **lo que verá el cliente, en sus palabras** («En la tienda: «Quipitos Pops», y este se elegirá como «Caja 24 unidades»»). Es lo que hace que el formulario se explique solo sin leer las ayudas.
- ⚠️ **La regla que sale de aquí**: si un campo existe solo porque el código lo necesita, o se pregunta **antes** de lo que condiciona, o no se pregunta.

### ⚠️ Dos cosas de operar con esto, que parecen bugs y no lo son

1. **La tienda tarda hasta un minuto en reflejar un cambio del catálogo.** La ficha pide los datos con `revalidate: 60` y Next sirve la copia guardada mientras refresca por detrás. Jonathan creó el segundo formato, entró, y vio la ficha **generada cuando el hermano todavía no existía** — sin selector. Su primera visita fue la que disparó la actualización; la segunda ya salió bien. **No se toca**: ese minuto es lo que evita consultar la BD en cada visita. Solo hay que saberlo antes de dar algo por roto.
2. ⚠️ **`update` NO regenera el slug al renombrar.** Los dos Quipitos acabaron cruzados: la caja vivía en `/productos/quipito-pops-unidad`. Se corrigieron a mano (`quipitos-pops-caja-24-unidades` y `quipitos-pops-unidad`) junto con una errata del nombre, y se auditó el catálogo entero: **20 productos, 0 sin slug, 0 con el slug descuadrado del nombre**.
   - **Y se deja así a propósito**: regenerar el slug al renombrar **rompe cualquier enlace que alguien haya guardado o compartido**. Si algún día se hace, hará falta conservar el slug viejo y redirigir, no sustituirlo.

---

## Sesión 2026-08-06 (cont.) — Limpieza a «arranque real», la tercera

A petición de Jonathan tras cerrar el dominio: fuera pedidos, eventos, carritos y clientes; dentro el admin, la primera factura, los productos y el inventario **tal como lo dejó la factura**.

**Antes → después**, medido en el remoto:

| | Antes | Después |
|---|---|---|
| pedidos · items · eventos · calificaciones · transacciones · reembolso_lineas | 16 · 40 · 107 · 9 · 35 · 5 | **0** en todo |
| carritos · carrito_items · checkout_datos · reservas | 59 · 1 · 2 · 0 | **0** |
| cuentas · perfiles · direcciones | 4 · 4 · 2 | **1 · 1 · 0** |
| stock disponible | 137 | **164 = la factura**, descuadre **0** en los 13 |

**Conservado y verificado**: 13 productos con sus fotos · factura 202521188 con sus 11 líneas y **a nombre del admin** · 1 proveedor · 6 cargos con sus 27 filas de plantilla · `ajustes_tienda` con el IBAN · el súper admin con su perfil. Comprobado desde fuera: la tienda sirve **13 productos, stock 164**, 2 agotados (Fresa y Vainilla, como dice la factura), **14 imágenes y ninguna rota**, y `valatino.es` y `api.valatino.es` a 200.

### Cómo repetirlo sin destrozar nada

Lo de siempre, más lo que se aprendió esta vez:

1. **El admin se localiza por ROL, nunca por lista de correos** (`delete from auth.users where id <> v_admin`, con `v_admin` sacado de `user_roles`). Así no hay forma de llevárselo por descuido.
2. **Un solo bloque `do $$` con sus propias comprobaciones y `raise exception` al final**: si quedara una cuenta de más, el stock no cuadrara con la factura o la factura perdiera a su autor, **se revierte todo**. Una limpieza que se valida después del `commit` ya no se puede deshacer.
3. ⚠️⚠️ **`pedidos` se borra ANTES que las cuentas.** `pedidos.user_id` es **SET NULL**, no CASCADE: al revés los pedidos sobreviven **huérfanos y sin dueño**, y quedan invisibles para cualquier consulta por cliente. Esto no estaba escrito y es el error fácil de cometer.
4. **Antes de empezar, comprobar las FK que pueden bloquear o mutilar** — se hizo, y por eso salió limpio:
   - `user_roles.asignado_por` es **NO ACTION**: si una cuenta que se va hubiera asignado el rol de otra, el borrado falla. Se verificó que hay **0 filas** con ese campo puesto.
   - `facturas_compra.creado_por` es **SET NULL**: borrar al admin dejaría la factura sin autor. Se verificó que la factura **es del admin**, que es justo la cuenta que se conserva.
   - `pedido_eventos.actor_user_id`, `reembolso_lineas.actor_user_id`, `ajustes_tienda.actualizado_por` y `cargo_modulos.actualizado_por` son **SET NULL**: los cargos y el IBAN sobreviven, solo pierden el autor.
5. ⭐ **LAS FACTURAS DE COMPRA NO SE BORRAN NUNCA, ninguna.** No es que la 202521188 esté en una lista blanca: `facturas_compra`, `factura_compra_items` y los PDF del bucket privado `facturas` **no aparecen en el borrado**, y no deben aparecer. Son el documento contable de lo que se compró y el origen del inventario. Cualquier factura que se suba en el futuro sobrevive a la limpieza sin hacer nada.
   - ⚠️ Lo único que puede perder una factura es **su autor**: `creado_por` es **SET NULL**, así que si la subió una cuenta que luego se borra en una limpieza, la factura queda sin quién la registró. Con las facturas del admin no pasa, porque el admin se conserva siempre.
6. **El inventario se fija desde `factura_compra_items`, no a mano.** Es idempotente y es **la única definición de «como lo dejaron las facturas»**. Y un producto que no esté en ninguna factura se pone a **0**, no se le deja lo que tuviera.
   - ⭐ **Con varias facturas encaja solo, y conviene entender por qué**: `registrar_factura_compra` hace `stock_disponible = stock_disponible + cantidad` al subirla, y la limpieza lo reinicia a la **suma de TODAS las líneas de TODAS las facturas**. Es coherente: la limpieza borra todas las ventas, así que si no se ha vendido nada, en la estantería está todo lo comprado. **No hay que ajustar nada al añadir facturas nuevas.**
6. **Decidir explícitamente qué es configuración y qué son datos de prueba.** Los **cargos con sus plantillas** y **`ajustes_tienda`** no estaban en la petición, y borrarlos habría obligado a reconfigurar los permisos de 6 cargos y a reteclear el IBAN —apagando el pago por transferencia hasta entonces—. Se preguntó y se conservaron.

---

## Sesión 2026-08-06 — Las fotos y las facturas: dónde viven de verdad

Jonathan preguntó si las imágenes de los productos y las facturas subidas se están guardando en la nube. **Sí**, en Supabase Storage, y comprobado contra el proyecto real, no leído de la documentación:

| | Bucket `productos` | Bucket `facturas` |
|---|---|---|
| Visibilidad | **público** | **privado** |
| Cómo se sirve | URL pública directa (200, `image/webp`, caché 1 h) | **URL firmada de 1 h** vía `GET /admin/facturas/:id/pdf` |
| Prueba de acceso | la imagen sirve 200 | **el PDF por URL pública → 400, bloqueado** |
| Integridad | **0 URLs rotas**: cada imagen del catálogo tiene su fichero | el `pdf_path` de la factura apunta a un objeto que existe |

✅ **El bucket privado está de verdad protegido**: intentar descargar el PDF por URL pública devuelve 400. Solo se llega por la ruta de la API, que firma una URL temporal y exige el módulo `facturas`.

### ⚠️ La fuga: al reemplazar una foto, la anterior se quedaba para siempre

De 25 ficheros del bucket, solo **14 estaban referenciados**: 11 huérfanos, ~1 MB. El reparto de culpas:

- `remove()` (borrar producto) **sí** limpiaba sus imágenes. Correcto desde siempre.
- `compras.service.ts` **sí** borra el PDF si la RPC falla. Compensación correcta, cero PDFs sueltos.
- **`update()` era un `update` pelado**: al reemplazar o quitar una foto, el fichero viejo **no se borraba nunca**. Ahí estaba la fuga.
- `subirImagen()` sube el fichero **y devuelve la URL antes de guardar el producto**, así que cancelar el formulario deja un fichero suelto. Inevitable con ese diseño y **no merece la pena** cambiarlo.

⚠️ **Lo relevante NO es el espacio** —1 MB en un plan de 1 GB no es nada—: **el bucket es público**, así que un huérfano sigue siendo **descargable por su URL** aunque ya no esté en ningún producto. Con fotos de caramelos da igual, pero si algún día se sube una imagen equivocada (una foto con datos, una lista de precios del proveedor), quitarla del catálogo **no la retira de internet**. El nombre es un UUID, hay que conocer la URL: el riesgo es bajo, no nulo.

**Arreglado** en `productos.service.ts`, con tres cuidados que son lo que evita que la solución sea peor que el problema:
1. Las imágenes anteriores **solo se leen si el dto trae `imagenes`**: editar el precio o el stock no puede llevarse las fotos por delante.
2. El borrado va **después** de que la escritura haya ido bien. Si el `update` falla, las imágenes de las que se venía siguen siendo las buenas.
3. `borrarDelBucket()` **no lanza**: el producto ya se guardó, y no poder limpiar un fichero no es motivo para devolver error de algo que funcionó. Queda en el log, porque en un bucket público conviene saber que hay un huérfano.

**Primer `productos.service.spec.ts`, 7 tests → 299 en la API.** Los dos que de verdad importan no se ven leyendo el código: que editar el precio **no** borre fotos, y que un guardado fallido **no** borre nada.

### Limpieza hecha, y lo que queda

Purgados los **9 huérfanos del 2026-07-18** (bucket 25 → 17 ficheros, 2,2 → 1,7 MB). Verificado después: **las 14 imágenes del catálogo responden 200**, ninguna rota.

✅ **Y los 3 que quedaban se purgaron después**, al confirmar Jonathan que había terminado de actualizar imágenes — recomprobando primero que ninguno se hubiera empezado a usar al guardar. **Bucket final: 14 ficheros, todos referenciados, 0 huérfanos, 0 URLs rotas.** Uno de ellos era `7c598576…`, la foto vieja de Bon Bon Bum, que quedó huérfana **en directo** al reemplazarla: la fuga ocurriendo delante mientras se diagnosticaba.

**Criterio para la próxima purga**: nunca borrar ficheros recientes sin preguntar. Un huérfano de 19 días es basura; uno de 30 minutos puede ser una subida en vuelo.

---

## Sesión 2026-08-05 — Dominio propio: `valatino.es`

Jonathan compró `valatino.es` en GoDaddy (con código promocional de un profesor) y pidió configurarlo. Se hizo con tokens nuevos de Render y Vercel, en `C:\YJIMENEZ\tokens-despliegue.env.txt` — **fuera del repo a propósito**, y ⚠️ **hay que revocarlos al cerrar la sesión**.

### La decisión que sostiene el diseño: la API también va en el dominio

No se apunta solo la tienda. La API se lleva a **`api.valatino.es`**, y el motivo no es estético:

> `vercel.app` y `onrender.com` están en la **Public Suffix List**, así que hoy la web y la API son **sitios distintos** para el navegador. Por eso la cookie de sesión del carrito tiene que viajar como `SameSite=None` (ver el comentario en `session.middleware.ts`), es decir, **como cookie de tercera parte** — justo el patrón contra el que van el ITP de Safari y el bloqueo de terceros de Chrome. El día que caiga, **el carrito del invitado se vacía en cada petición**. Con `valatino.es` + `api.valatino.es` pasan a ser el mismo sitio y el problema desaparece sin tocar código.

Y hay un segundo beneficio: cuando se recree el servicio en **Frankfurt** (Render no cambia la región), si la web habla con `api.valatino.es` solo cambia un CNAME. Sin dominio propio habría que cambiar `NEXT_PUBLIC_API_URL`, **rebuild de Vercel** y recrear el webhook de Stripe. **El dominio de la API es lo que hace indolora esa mudanza.**

### Reparto final

| Host | Dónde apunta |
|---|---|
| `valatino.es` (canónico) | Vercel — A `216.198.79.1` + `64.29.17.1` |
| `www.valatino.es` | Vercel — CNAME `eb08cb078d8987b0.vercel-dns-017.com`, con **308** al apex |
| `api.valatino.es` | Render — CNAME `valatino.onrender.com` |

IDs: servicio Render `srv-d9ft2q7avr4c73dvqu90`, dominio `cdm-d9pot5pt0dsc73d14b50`. Proyecto Vercel `prj_VwIo6RyE0YRKsz35VdOfNK6Knaf6`.

### ⚠️ Ocho trampas que salieron, y que valen para la próxima vez

1. **Cambiar variables de entorno en Render POR API no dispara redeploy** (guardar en el panel sí). El proceso sigue con los valores viejos en memoria hasta que se fuerza un deploy con `POST /v1/services/{id}/deploys`. Se verificó después: `CORS_ORIGIN` nuevo activo, origen ajeno denegado con cabecera vacía, `/productos` con sus 13 productos.
2. **El `A` del apex venía tomado por el Website Builder de GoDaddy** (`@ A "WebsiteBuilder Site"`, que resolvía a dos IPs suyas de AWS Global Accelerator). No es un registro de aparcamiento editable: está **atado a su producto**, y hay que **desconectar el sitio del dominio** antes de poder apuntarlo a Vercel, o GoDaddy puede reescribirlo. Dejar los dos = el apex reparte visitas entre Vercel y su constructor, y la tienda «funciona a ratos».
3. **El CNAME de Vercel es específico del proyecto**: `eb08cb078d8987b0.vercel-dns-017.com`, no el genérico `cname.vercel-dns.com` de los tutoriales (ese sigue valiendo, pero es el de segunda preferencia). Se saca de `GET /v6/domains/<dominio>/config` → `recommendedIPv4` / `recommendedCNAME`, **rango 1**. No adivinar IPs de memoria: Vercel las ha cambiado.
4. ⚠️ **GoDaddy publica de fábrica un `_dmarc` con `p=quarantine`.** Eso **invierte el orden del correo**: si se pone `EMAIL_FROM=pedidos@valatino.es` antes de autenticar el dominio en SendGrid, la propia política manda a spam **el único correo que el cliente necesita para actuar** (las instrucciones de la transferencia con el IBAN y el concepto). Primero los 3 CNAME de SendGrid y verificar, **después** cambiar `EMAIL_FROM`.
5. **`NEXT_PUBLIC_API_URL` va al final** — ver la regla de orden en la cabecera de este archivo.
6. **El token de Vercel hay que emitirlo con `Scope` = el equipo, no «Personal Account».** El proyecto vive en el equipo **`yonathanjis-projects`** y se llama **`valatino-api`** (el `-steel` era solo el dominio de despliegue). Un token de la cuenta personal `yonathanji` ve **0 proyectos**, y da 403 en `/v2/teams` y 404 en el proyecto **incluso pasándole el ID**. Esto es lo que ya había fallado el 2026-07-21 y costó la misma confusión otra vez.
7. **El MCP de Supabase NO expone la configuración de Auth.** Tiene BD, storage, edge functions, logs y advisors, pero `site_url` y `uri_allow_list` van por el **Dashboard** o por la **Management API con un token `sbp_`**. (Y sigue en pie el aviso de **NO lanzar `supabase config push`**.)
8. **Para distinguir «falta propagación» de «el dominio no existe», preguntar al autoritativo del TLD**: `Resolve-DnsName valatino.es -Type SOA -Server a.nic.es`. Si el TLD dice que no existe, no es caché de ningún resolutor ni paciencia — es que el registro no ha creado la delegación. Ahorra horas de esperar algo que no va a llegar solo.

### ⚠️⚠️ Y el fallo que destapó la compra de prueba: la 047 se llevó el teléfono (migración 053)

Verificando la compra de prueba del dominio salió un fallo que **no tiene nada que ver con el dominio**. El pedido `260805010148` se hizo con una dirección guardada que **tiene** teléfono y salió con `pedidos.envio_telefono = NULL`.

**Qué pasó**: la **040** añadió el teléfono a `confirmar_venta`. La **047** volvió a redefinir esa función para lo del carrito **partiendo de la versión 033**, anterior a la 040, y se lo llevó por delante — desapareció de la lista de columnas, de los `values` y del `select` de la dirección. **Nada falló**: un pedido sin teléfono no da error, solo pierde el dato, así que no saltó ningún test.

⚠️ **El alcance real no era «las direcciones guardadas»** —esa fue la primera hipótesis y era falsa—. `confirmar_venta` dejó de copiarlo **siempre**, así que desde el 2026-08-02 **todo pedido con tarjeta o Bizum** perdió el teléfono. La misma 047 **sí** lo conservó en `crear_pedido_transferencia`, que está en el mismo fichero 280 líneas más abajo, y por eso los de transferencia lo tienen. Eso es lo que hacía que el patrón pareciera ser el tipo de dirección y no la vía de pago.

⚠️⚠️ **LA LECCIÓN, la más importante de esta sesión: un `create or replace` de una función grande reescribe el cuerpo ENTERO.** Reconstruirla copiando de una migración anterior revierte en silencio todo lo que se añadió en medio. No falla, no avisa, y no lo cazan los tests. **Antes de redefinir una función que ya se ha tocado varias veces, partir de `pg_get_functiondef()` de la función VIVA en el remoto, no del último fichero que la escribió.** La 053 se hizo así a propósito: partir del fichero de la 047 habría repetido el error al revés, esta vez tirando la **052** (las reservas de checkout y `cancelar_transferencia_reemplazada`). Verificado después de aplicarla: el teléfono vuelve (3 menciones) **y la 052 sigue entera**.

**Por qué importaba aunque el panel no lo delatara**: `listar_clientes` (043) coge el teléfono más reciente entre `profiles` y `direcciones_envio` y deja el snapshot como último recurso, así que en pantalla no se veía roto. Pero el snapshot existe para que el pedido conserve **su** copia: si el cliente edita o borra esa dirección, el pedido se queda sin el teléfono con el que se hizo, y el teléfono es cómo se localiza a alguien por una entrega.

La 053 incluye un **backfill conservador**: solo rellena donde se puede afirmar que el dato es el de entonces —hay dirección guardada, tiene teléfono, y **no se ha tocado después** del pedido (`updated_at <= created_at`)—. Recuperó `260805010148`. Los dos pedidos con tarjeta sin dirección guardada quedan en NULL para siempre: ese teléfono no se registró en ningún sitio y copiarlo de otra parte sería inventarse el histórico.

**Cabo suelto**: esto no lo cubre ningún test porque las RPC no están cubiertas (los 292 tests son de la API). Una función que se ha redefinido en la 033, la 040, la 047, la 052 y la 053 es exactamente donde más falta hace.

### El correo: primero a spam, luego bien (✅ resuelto)

Reportado por Jonathan tras el cambio de remitente: el correo del pedido **llegó desde `pedidos@valatino.es`** pero **a la carpeta de no deseados** de Hotmail.

✅ **Resuelto y comprobado por él poco después**: llega a la **bandeja de entrada**, con el remitente del dominio y `Reply-To` a su Gmail. **No hubo que reconfigurar nada** — marcar el mensaje como legítimo y que el dominio dejara de ser recién nacido bastó. Eso confirma que era **reputación**, no un fallo de autenticación, y confirma también que **la cabecera `Reply-To` sí estaba**: lo de «no deja responder, solo reenviar» era **Outlook bloqueando las acciones en los mensajes de junk**, no algo nuestro. Si vuelve a pasar con otro proveedor, ese es el orden de sospecha: primero reputación, después configuración.

Lo que dicen los datos, para no confundir síntomas:

```
SendGrid 2026-08-05:  4 peticiones · 4 entregados · 0 rebotes · 0 bloqueos · 0 quejas · 4 aperturas
SendGrid 2026-08-06:  4 peticiones · 4 entregados · 0 rebotes · 0 bloqueos · 0 quejas · 4 aperturas
Supresiones:          limpias · Dominio autenticado: valid=True, los 3 CNAME en verde
```

**Nada se pierde ni se bloquea.** «Entregado» en SendGrid significa que el servidor del destinatario lo aceptó con un 250, así que un correo «que no llegó» está filtrado en una carpeta, no perdido — conviene mirar la de spam antes de buscar culpables en el envío.

**Las tres causas, por peso:**

1. **El dominio se registró el mismo día.** La antigüedad es una de las señales de spam con más peso y **no la arregla ninguna configuración**: mejora en días o semanas con envío constante y destinatarios que abren y marcan como legítimo. Hotmail/Outlook es especialmente duro con dominios nuevos.
2. ⚠️ **`valatino.es` no tiene MX**, así que **envía correo pero no puede recibirlo** — patrón clásico de dominio desechable, y penaliza. Es el mismo problema que obligó al `Reply-To`, visto desde el otro lado: resolverlo mata dos pájaros.
3. **El dominio del remitente no declara SPF.** `em6156.valatino.es` (el de envío) sí tiene `v=spf1 include:sendgrid.net ~all`, pero el apex no tiene TXT ninguno. No es lo que hace pasar el DMARC —eso lo hace el DKIM, que ya alinea— pero varios filtros lo miran.

⚠️ **«No deja responder, solo reenviar» casi seguro NO es nuestro**: Outlook **bloquea la respuesta y los enlaces en los mensajes de junk** hasta que se marca «Es correo legítimo». Pendiente de confirmar leyendo la cabecera `Reply-To` en el origen del mensaje.

⚠️ **Y el «no comprobado» del correo de acceso es OTRA cosa**: ese correo **no lo manda la API**, lo manda **Supabase Auth con su propio remitente**, que no es del dominio. DKIM firma un dominio y el `From` dice otro → no se alinean → «no comprobado». Se arregla en **Supabase → Project Settings → Auth → SMTP Settings → Sender email** poniendo una dirección de `valatino.es`. **Cambiar `EMAIL_FROM` en Render no toca ese correo**, y es fácil creer que sí.

**Lo que falta decidir**: cómo dar buzón al dominio — reenvío de GoDaddy (lo más simple: `pedidos@` → Gmail), Zoho Mail (buzón real gratis, 1 usuario) o Google Workspace (de pago). Con cualquiera desaparece el `EMAIL_REPLY_TO` postizo y se quita la señal de spam.

**Diagnóstico que queda por hacer y decide el camino**: leer `Authentication-Results` en el origen del correo que fue a spam. `dkim=pass dmarc=pass` → es reputación de dominio nuevo, y la cura es tiempo + MX. `dkim=fail` o `dmarc=fail` → hay algo mal configurado.

### Cómo acabó, y lo que queda

La delegación del registro `.es` tardó **una hora larga** desde que se compró el dominio. En cuanto apareció, el resto salió seguido: Render verificó `api.valatino.es` y emitió certificado, se cambió `NEXT_PUBLIC_API_URL` y el build de Vercel dejó la tienda sirviéndose de su dominio. Verificado: home con los 13 productos, ficha de producto, checkout y login a 200; `www` con 308 al apex; CORS bien en los tres orígenes y denegando el ajeno; y el dominio nuevo **dentro de los chunks de JS**.

⚠️ **Caché negativa, por si desconcierta**: cuando el dominio empezó a resolver en Google, **`1.1.1.1` seguía dando NXDOMAIN** hasta una hora más. Es el TTL mínimo del SOA (3600 s) con el que los resolutores guardan el «no existe». No es un error de configuración y no se arregla tocando nada.

~~1. Verificar el dominio en Render y esperar el certificado.~~ ✅ hecho
~~2. `NEXT_PUBLIC_API_URL` + redeploy.~~ ✅ hecho y comprobado en el bundle

3. Supabase: `site_url` → `https://valatino.es` y añadir `https://valatino.es/**` y `https://www.valatino.es/**` al `uri_allow_list` (conservar localhost). Probar el login por código de 6 dígitos en el momento.
4. Stripe: webhook nuevo a `https://api.valatino.es/pagos/stripe/webhook` con **los 5 eventos** (los 4 de siempre **+ `refund.updated`**, el del reembolso de Bizum fallido), meter su signing secret, verificar un pago y **luego** borrar el viejo.
5. SendGrid: autenticar el dominio (3 CNAME) y solo entonces `EMAIL_FROM=pedidos@valatino.es`.
6. Quitar de `CORS_ORIGIN` el origen `https://valatino-api-steel.vercel.app` cuando todo esté verificado (ahora se conserva a propósito para no romper la tienda viva durante la transición).
7. Legal antes de vender de verdad en España: aviso legal, política de privacidad y de cookies.

⚠️ Todo esto está con **claves de test de Stripe**, y así debe quedarse hasta que el dominio funcione de punta a punta. El paso a `live` es un paso aparte.

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

### ⚠️⚠️ Las reservas de un pedido no las toca nadie más (migración 052)

Reportado por Jonathan: hizo un pedido por transferencia, **cerró sesión, volvió a entrar**, cogió el carrito y lo pagó con Bizum — y esta vez **no se enlazó** con el anterior. Su hipótesis era la cookie.

**No era la cookie**: los dos pedidos tienen el mismo `user_id`. Lo que pasó es que el pedido por transferencia se había quedado **sin sus reservas**, y son las reservas lo que identifica al pedido a cancelar (047/049). Sin ellas no había nada por lo que enlazarlos.

**Quién se las llevó**: `reservar_carrito` (034) empieza por limpiar lo que hubiera de esa sesión —«recargar el checkout no apila reservas»—, y eso era correcto **cuando todas las reservas eran efímeras**: quince minutos y el cron las recogía. Desde la 045 hay reservas que pertenecen a un pedido y duran días, y volver a abrir el checkout se las llevaba por delante devolviendo su stock a la venta.

El enlace roto era lo de menos. **El daño real**: el pedido pendiente dejaba de retener stock (se podía vender lo ya comprometido), y si luego alguien pulsaba «Pago recibido» el stock se descontaba sin reserva detrás.

**LA REGLA: una reserva con `pedido_id` pertenece a ese pedido y solo se suelta por su ciclo de vida** —al confirmar el ingreso, al cancelar el pedido o al vencer el plazo—. Ninguna limpieza «por sesión» puede tocarla: ni `reservar_carrito`, ni `liberarReservas` de la API (que también las borraba, así que un pago fallido con tarjeta soltaba el stock de un pedido por transferencia del mismo cliente).

⚠️ **Dos efectos secundarios que solo salieron al probar en seco, no razonando:**

1. **El índice único `(session_id, producto_id)` impedía volver a comprar el mismo artículo** teniendo un pedido pendiente: el insert de `reservar_carrito` chocaba con la reserva retenida y el checkout devolvía un 23505. Ahora es **parcial** (solo sobre las reservas de checkout), más otro equivalente para las de pedido.
2. **Al coexistir dos reservas del mismo producto**, `confirmar_venta` las consumía con un `update … from` que **aplica una sola fila y descarta la otra en silencio** — `stock_reservado` quedaba inflado. Ahora consume solo las de checkout y agrupadas por producto. Y `cancelar_transferencia_reemplazada` **sí suelta** las del pedido cancelado: la 049 decía que no hacía falta «porque se las lleva el pedido nuevo», y eso era cierto cuando compartían reserva, no ahora. Sin esto se vendían 2 unidades y salían 4 del inventario.

**Verificado en el remoto**: pedido por transferencia → volver al checkout → el pedido sigue reteniendo lo suyo y el checkout puede reservar → pagar → se cancela, se enlaza, no quedan reservas huérfanas y **salen 2 unidades por 2 vendidas**.

### ⚠️ Un pedido por transferencia sin pagar NO se mueve a mano (migración 051)

Lo último de la sesión, visto por Jonathan en el panel: *«cuando es con transferencia no debería aparecer poder cambiar de estado, solo confirmar la transferencia»*.

Tenía razón, y **no era cosmético**. El desplegable ofrecía «Pendiente de pago → Procesando», y usarlo habría puesto el pedido en marcha **sin haber cobrado**, saltándose las tres cosas que hace «Pago recibido»:
- consumir la reserva de stock —que seguiría viva hasta vencer, y entonces el cron **devolvería unidades de un pedido que ya se está preparando**—,
- comprobar que el dinero entró,
- y avisar al cliente de que llegó.

La regla vive en `transicionesPermitidas` (`@valatino/types`), que ahora recibe el método de pago, **y la aplica también la API**: ocultar el desplegable no basta, la ruta seguiría abierta. Con `transferencia` + `PENDIENTE_PAGO` solo se ofrece **Cancelar**, y solo con nivel `total`.

⚠️ **Cabo suelto que salió de ahí**: cancelar iba por `cambiar_estado_pedido`, que solo tocaba el estado, así que las unidades seguían retenidas hasta tres días aunque ya se supiera que ese pedido no se iba a pagar. Ahora **cualquier** pedido que pase a CANCELADO suelta sus reservas, lo cancele quien lo cancele — puesto en la RPC y no en la API para que valga por todos los caminos.

### El correo de la transferencia, y el hueco que destapó (fin de la sesión)

Pedido por Jonathan tras probar el circuito: *«cuando se hace el pedido por transferencia también debe llegarle un correo al cliente recordándole cómo hacer la transferencia… y eso debe estar en el histórico»*.

**Es el único correo de la tienda que el cliente necesita PARA ACTUAR** — los demás cuentan algo que ya pasó. Quien cierra la pestaña del checkout se quedaba sin el IBAN y sin el concepto, y no tenía forma de pagar el pedido que acababa de reservar.

- **El concepto va destacado y repetido tres veces.** Es lo único que casa el ingreso con el pedido: sin él, la transferencia llega al banco como un apunte anónimo que alguien tiene que adivinar.
- Los datos van en **texto plano seleccionable**, no en imagen ni en tabla apretada: se copian y pegan en la app del banco.

⚠️ **Revisando el historial apareció el mismo hueco del otro lado: al confirmar el pago tampoco se enviaba nada.** El pedido pasa a PROCESANDO por RPC, y una RPC **no dispara** `notificarCambioEstado`, así que el cliente transfería su dinero y no recibía ninguna confirmación. Ahora recibe el correo de pedido confirmado, el mismo que quien paga con tarjeta. **Regla para lo que venga: si un estado se cambia por RPC en vez de por `updateEstado`, el aviso al cliente hay que mandarlo a mano.**

Los dos quedan en la línea de tiempo, y **solo si el envío salió bien**: anunciar un correo que nunca llegó es peor que no anotarlo, porque nadie va a comprobarlo.

### El historial cuenta el porqué, no solo el qué (migración 050)

Pedido por Jonathan: *«que cuando se abre el pedido y se consulta el historial diga: fue creado el pedido tal… posterior cliente decidió pagarlo por Bizum y se crea pedido tal»*.

Faltaba **dónde escribirlo**: `pedido_eventos.tipo` solo admitía `estado`, `pago`, `reembolso` y `email`, y esto no es ninguna de las cuatro. Sin el tipo `nota`, quien abría el cancelado veía un «Pendiente de pago → Cancelado» sin ningún motivo.

- Se escribe en **los dos pedidos**, para que la historia se lea completa desde cualquiera.
- ⚠️ **La nota la escribe la API y no el SQL**, y es a propósito: hasta después de anotar `metodo_detalle` no se sabe con **qué** se pagó al final, y decir «por otra vía» pudiendo decir «con Bizum» es peor.

### Dos pedidos del mismo carrito: enlazados, NO fusionados (migración 049)

Jonathan, al ver los dos en el panel: *«¿no debería ser un solo pedido con el historial?»*.

⚠️ **No se fusionan, y el porqué vale para cualquier caso parecido**: el pedido por transferencia **no es un carrito abandonado**. Tuvo número propio, retuvo stock, y **ese número se le dio al cliente como concepto de la transferencia**. Si hubiera llegado a ingresar el dinero justo antes de pagar por otra vía, habría un apunte en el banco con ese número. Fusionarlos sería reescribir un documento comercial y dejar `transacciones_pago` apuntando a un pedido que ya no es el que fue.

Lo que sí se arregla es la vista: `pedidos.reemplazado_por` los enlaza en las dos direcciones, y **el panel deja de listar por defecto los cancelados que nunca se pagaron** (interruptor «Ver intentos sin pagar»). Un solo pedido a la vista, la traza entera si alguien pregunta por un ingreso.

### Dos cosas que Jonathan cazó probando con Bizum

**1. El correo decía «Tarjeta (Stripe)» a quien había pagado con Bizum** (migración 048). Ni fue una tarjeta ni Stripe es una forma de pagar: es por dónde pasó el dinero, algo que al cliente no le dice nada.

`metodo_pago` guarda la **pasarela**, y eso estaba bien mientras Stripe solo sirviera tarjetas. Ahora se guarda además `metodo_detalle` con lo que informa Stripe (`card`, `bizum`…). Son dos cosas distintas y **las dos hacen falta**: la pasarela decide por dónde se reembolsa (`ReembolsosService` la mira para saber si puede cobrar en Stripe) y el detalle es lo que se le cuenta al cliente. Mezclarlas obligaría a que el reembolso supiera que «bizum» también significa Stripe.

- El tipo real **no viene en el PaymentIntent** —solo dice qué métodos se ofrecieron—, hay que mirar el cargo (`latest_charge.payment_method_details.type`). Es una llamada extra a Stripe por pedido; nunca lanza, porque un pedido cobrado no puede fallar por no saber etiquetar la forma de pago.
- ⚠️ **Un método desconocido se muestra tal cual** («Klarna», «Apple Pay») en vez de caer en «Tarjeta». Caer por defecto es exactamente lo que hizo mentir al correo: si mañana se activa otro método en Stripe, dirá algo escueto pero cierto.

**2. El cliente veía en su cuenta un pedido cancelado que nunca fue una compra.** Al elegir transferencia y luego pagar con Bizum, el pedido de transferencia se cancela solo (047) — correcto— pero se le mostraba, **con el mismo importe que el que sí pagó**, y parecía un cobro doble que falló.

Ahora `/cuenta/pedidos` oculta los **cancelados sin ningún pago exitoso**. La condición importa: un pedido que se cobró y se canceló después **sí se muestra**, porque ahí hubo dinero de por medio. En el panel se siguen viendo todos: el equipo necesita la traza.

### ⚠️ El carrito no se vacía hasta que el pago existe (migración 047)

Reportado por Jonathan: *«si seleccioné transferencia y luego pasé a tarjeta y Bizum dice que no permite porque el carro está vacío»*.

**La causa**: `crear_pedido_transferencia` vaciaba el carrito al crear el pedido, copiando lo que hace `confirmar_venta`. Allí es correcto —el dinero ya está cobrado—, pero aquí **el pago aún no ha ocurrido**: elegir transferencia no es pagar, es decir cómo se va a pagar. Y dejaba algo peor detrás: un pedido en PENDIENTE_PAGO reteniendo stock que nadie iba a pagar, visible tres días en el panel, **donde alguien podría darlo por bueno y descontar inventario por una venta que no existió**.

**La regla que se adopta: el carrito se vacía cuando el pago se materializa, no cuando se anuncia.**
1. `crear_pedido_transferencia` deja el carrito intacto.
2. `confirmar_pago_transferencia` lo vacía, que es cuando entra el dinero.
3. `confirmar_venta` **cancela el pedido por transferencia que ese mismo checkout dejó a medias**, sin devolver stock: esas unidades se las lleva el pedido que sí se ha pagado.

⚠️ **El pedido a cancelar se identifica por la RESERVA, no por la sesión ni por una ventana de tiempo.** Las reservas que `confirmar_venta` está a punto de consumir son exactamente las que aquel pedido retenía, así que la llamada va **antes** de consumirlas — después ya no existen. Sin heurísticas y sin poder cancelar por error un pedido legítimo de otro día.

⚠️ **Y un segundo fallo en el front, de la misma causa**: la clave de idempotencia vivía en un `useRef`, y cambiar de método de pago desmonta el componente. Volver a «Transferencia» generaba una clave nueva y con ella **un segundo pedido del mismo carrito reteniendo stock por duplicado**. Ahora vive en `sessionStorage` atada al importe: mismo carrito, misma clave; carrito distinto, clave nueva.

**Verificado en el remoto**: elegir transferencia → el carrito sigue lleno → pagar con tarjeta funciona → el pedido de transferencia queda CANCELADO → el stock se consume **una sola vez** → el carrito se vacía al final.

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
| `NODE_ENV` | `development` ← ~~pendiente~~ **resuelto**: el 2026-08-11 se comprobó por API que ya está en `production` |

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