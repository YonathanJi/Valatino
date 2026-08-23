-- ═══════════════════════════════════════════════════════════════════════════════
-- 083 · CÓDIGOS DE DESCUENTO
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Petición del dueño, 2026-08-23: dos tipos de código y solo dos, generados desde
-- el módulo de TI. Uno da un PORCENTAJE sobre la compra del cliente; el otro da el
-- ENVÍO TOTALMENTE GRATIS.
--
-- ⚠️⚠️ ESTE FICHERO ESTÁ A MEDIAS. Lleva la cabecera (el diseño) y el §1 (el
-- esquema), que es inerte: sin ningún código creado la tienda hace exactamente lo
-- que hace hoy. Las funciones fiscales —§2 en adelante— NO están escritas todavía.
--
-- ⚠️ Y LA REGLA ES «NO SE APLICAN SIN ENSAYO», NO «NO SE ESCRIBEN SIN ENSAYO».
-- Escribirlas primero y ensayarlas después es el orden correcto: el `--dry` de
-- `scripts/aplicar-sql.mjs` necesita un fichero que ensayar. Lo que no se puede es
-- APLICAR nueve funciones fiscales y el 303 sin haberlas visto correr y deshacerse.
--
-- ⚠️⚠️ Y DE AHÍ SE SIGUE CON QUÉ HERRAMIENTA SE APLICA ESTO. El `apply_migration`
-- del MCP de Supabase hace COMMIT: no tiene ensayo revertido. La 080 se aplicó así
-- porque la contraseña no estaba a mano, y hubo que salvarlo con `md5(prosrc)` —
-- que verifica que el SQL llegó ENTERO, no que haga lo correcto. Para esta
-- migración eso no basta: hace falta la contraseña de la base y
-- `aplicar-sql.mjs --dry`. Restablecerla no rompe nada en este proyecto (0
-- referencias a `DATABASE_URL` en `render.yaml`, 0 usos de `PrismaClient` en
-- ejecución, 0 en el CI, 0 en `apps/api/.env`), y ya está comprobado uno a uno.
--
-- ⚠️⚠️ EL ORDEN DE DESPLIEGUE: EL RENDER PRIMERO, LA BASE DESPUÉS. Es la lección
-- que la 082 dejó escrita después de pagarla: «la base emitió la línea nueva desde
-- que se aplicó la 082, y el PDF arreglado no llegó a Render hasta unos minutos
-- después. Una factura descargada en esos minutos habría dicho "null %". Para la
-- próxima migración que cambie a la vez la base y el render: desplegar el render
-- primero».
--
-- Aquí es el mismo caso: esta migración hace que `emitir_factura` meta la línea del
-- descuento en `lineas`, y el PDF tiene que saber sacarla del cuerpo de la tabla y
-- pintarla en el bloque de totales (§7 y `factura-pdf.service.ts`). Con el orden al
-- revés, una factura descargada en la ventana saldría con el descuento como una
-- línea más de la tabla, que es justo lo que el dueño pidió que NO pasara.
--
-- ⭐ Y el margen es grande, no un minuto: «cero códigos = cero cambios». Mientras no
-- exista ninguna fila en `codigos_descuento` ningún pedido puede llevar descuento, y
-- sin descuento no hay línea que pintar. Así que la secuencia segura es:
--
--     1. desplegar la API (Render) con el PDF nuevo
--     2. aplicar esta migración
--     3. comprobar que la tienda sigue igual (ningún cupón creado todavía)
--     4. y solo entonces crear el primer código desde el panel de TI
--
-- ── §0 · POR QUÉ EL GUARDIA NO SE TOCA, Y POR QUÉ ESO ES LA PRUEBA ────────────
--
-- ⭐⭐ El comentario que hay que leer antes de nada no es nuevo: lo escribió la 062
-- y la 080 lo repitió, y nombra este trabajo por su nombre desde antes de que
-- existiera el envío:
--
--     «El desglose tiene que sumar EXACTAMENTE lo cobrado. Si algún día cambia
--      cómo se calcula el total del pedido —unos gastos de envío, un descuento—,
--      esto salta aquí, en el momento de la venta, y no en el modelo 303 tres
--      meses después con el trimestre ya cerrado.»
--
-- Y la 080 dejó escrito el criterio de éxito, que se hereda tal cual:
--
--     «⚠️ EL GUARDIA NO CAMBIA NI UNA LETRA, y eso es la comprobación de que esto
--      está bien: el invariante «el desglose suma exactamente lo cobrado» ahora
--      cubre también el envío, SIN HABER TENIDO QUE RELAJARLO.»
--
-- ⚠️⚠️ El listón de esta migración es ese. Si para meter el descuento hubiera que
-- relajar el guardia de `recalcular_iva_pedido`, el diseño está mal. No se relaja.
--
-- ── §0.1 · LAS TRES VÍAS CERRADAS, Y POR QUÉ QUEDA UNA SOLA ───────────────────
--
-- El descuento NO puede modelarse como parecería natural, y no por criterio: por
-- CHECK. Las tres vías están cerradas por el esquema:
--
--   1. Línea negativa en el pedido. `pedido_items.precio_unitario > 0`,
--      `producto_id NOT NULL REFERENCES productos`, `iva_pct in (4,10,21) NOT NULL`
--      y el trigger `pedido_item_hereda_iva`, que lanza si no resuelve el tipo
--      desde `productos`. Cuatro barreras.
--
--   2. Fila propia en el desglose. `pedido_iva.iva_pct check (iva_pct in (4,10,21))`
--      — no existe el tipo 0. La 062 lo dejó fuera a propósito y con su razón
--      escrita: «una operación exenta no es IVA al cero: va a otra casilla del 303».
--
--   3. Bajar el precio de las líneas. Un cupón grande dejaría `precio_unitario` en
--      0 y viola el CHECK; y `ReembolsosService.validarSeleccion` saca de ahí el
--      dinero que se devuelve, así que además rompería la devolución.
--
-- Queda una sola forma: NETEAR el descuento dentro de las filas de tipo que ya
-- existen. Que es lo que hace el porte, con el signo cambiado.
--
-- ── §0.2 · LA DECISIÓN CENTRAL: SOLO PORCENTAJE, Y POR QUÉ ES LA QUE SOSTIENE
--           TODO LO DEMÁS ───────────────────────────────────────────────────────
--
-- ⭐⭐ Con un porcentaje sobre el subtotal de artículos, `pedido_iva.base >= 0` y
-- `cuota >= 0` son ciertos POR CONSTRUCCIÓN, sin acotar nada:
--
--   El descuento se reparte ponderando por los artículos de cada tipo, con el
--   mismo acumulado que el porte. El trozo que le toca al tipo t es
--   aproximadamente p · articulos(t), y el redondeo acumulado se desvía a lo sumo
--   un céntimo. Para que ese trozo superara articulos(t) haría falta
--   articulos(t) · (1 − p) < 0,01, o sea un tipo que aporte menos de un céntimo.
--   Imposible: `precio_unitario > 0` y el dinero va en céntimos.
--
-- ⚠️⚠️ UN IMPORTE FIJO PIERDE ESA PROPIEDAD. «−5 €» sobre un carrito de 0,10 € al
-- 4 % y 5,40 € al 21 % deja la base del 4 % en negativo, y el CHECK aborta DENTRO
-- del webhook de un pago ya cobrado. Recuperar la propiedad obliga a un tope, y el
-- tope obliga a decidir dónde va el céntimo que no cabe, y ahí es donde este
-- diseño dejaría de ser evidente. Queda FUERA por escrito, y esta es la razón: no
-- es que no se haya pensado.
--
-- ── §0.3 · EL ENVÍO GRATIS NO ES UN DESCUENTO, Y POR ESO ES CASI GRATIS ───────
--
-- ⭐⭐ El segundo tipo de código no minora ninguna base: pone `coste_envio` a 0. Y
-- `coste_envio = 0` es un estado que la tienda YA VIVE en cada pedido que pasa del
-- umbral de `envio_gratis_desde`. Comprobado en el código, no supuesto:
--
--   · `linea_envio_factura` (082) termina en `where r.envio > 0`, así que devuelve
--     NULL cuando no hay porte;
--   · `emitir_factura` la consume con `where z.linea is not null`.
--   → La factura OMITE la línea de envío. No imprime «0,00 €».
--
-- Por tanto el código de envío gratis NO toca `pedido_iva`, ni la factura, ni la
-- rectificativa, ni `liquidacion_iva`. Toca `coste_envio_de` —que es quien decide
-- la tarifa— y el snapshot. Eso es todo.
--
-- ⚠️ Y NO se modela como «un descuento que se come el porte». Sería prorratear un
-- descuento sobre un importe que a su vez ya está prorrateado entre tipos: dos
-- repartos encadenados sobre el mismo dinero, y el porte de una factura emitida
-- dejaría de poder interpretarse sin conocer el cupón. `coste_envio = 0` es
-- inequívoco.
--
-- ── §0.4 · LOS DOS TIPOS SON ORTOGONALES ─────────────────────────────────────
--
-- El porcentaje toca solo los artículos; el envío gratis toca solo `coste_envio`.
-- No se pisan. Por eso:
--
--   · UN CÓDIGO POR PEDIDO es la regla de hoy (una columna, no una tabla; y
--     `descuento_imputado` no tiene que decir de qué cupón viene cada céntimo);
--   · pero admitir MÁS ADELANTE «uno de cada» es barato, porque son dimensiones
--     independientes. Lo que NO será barato nunca es acumular DOS PORCENTAJES: eso
--     rompe la premisa del prorrateo y vuelve a abrir la cota del §0.2.
--
-- ⚠️ Los cupones SELECTIVOS (por producto, por categoría, 2x1) quedan fuera por
-- escrito. Un cupón que solo pondere sobre un subconjunto puede pasarse de ese
-- subconjunto y dejar base negativa en un tipo: la demostración del §0.2 solo vale
-- mientras el descuento se pondere sobre el TOTAL de artículos.
--
-- ── §0.5 · EL UMBRAL DE ENVÍO GRATIS SE MIDE SOBRE EL SUBTOTAL BRUTO ─────────
--
-- Decisión, no olvido. Si se midiera sobre el neto, un carrito de 30,00 € con un
-- código del −20 % pasaría de «envío gratis» a pagar 3,40 € por haber usado el
-- código, y el cliente lo lee como un castigo. Sobre bruto la función es monótona
-- y no existe ningún carrito en el que aplicar un código empeore el total.
--
-- El precio de la decisión: la tienda regala porte algo más a menudo de lo que
-- sugieren las cifras del panel. Es cuantificable con los pedidos reales.
--
-- ── §0.6 · LO QUE MANDA ES EL SNAPSHOT, Y NUNCA SE REVALIDA ──────────────────
--
-- El importe se cobra en un sitio y el pedido se crea en otro minutos después,
-- recalculando (080 §0). Así que el descuento se CONGELA al crear el pago, igual
-- que el porte, y el webhook factura eso sin volver a mirar el código.
--
-- ⚠️⚠️ CONSECUENCIA ACEPTADA POR ESCRITO: el tope de usos es BLANDO. Dos checkouts
-- simultáneos con un código de un solo uso lo gastan los dos. Revalidar en el
-- webhook facturaría un total distinto del cobrado; abortar sería peor todavía —
-- pago cobrado, cero pedido, cero fila en `transacciones_pago`, y Stripe
-- reintentando el mismo fallo indefinidamente. Un cupón usado una vez de más
-- cuesta unos euros. Eso cuesta una venta y una reparación a mano.
--
-- ── §0.7 · LA DEVOLUCIÓN, QUE ES LA PARTE PELIGROSA ──────────────────────────
--
-- ⚠️⚠️ `reembolso_lineas.importe` es HOY `cantidad × pedido_items.precio_unitario`,
-- o sea PVP DE CATÁLOGO. Con un cupón, `pedido_iva` está ya minorado y ese importe
-- diría MÁS de lo cobrado. Sin arreglarlo:
--
--   · se le devolvería al cliente más dinero del que pagó (dinero real fuera);
--   · la rectificativa rectificaría más base de la que declaró la venta;
--   · el 303 se quedaría con IVA repercutido NEGATIVO.
--
-- Y NINGÚN CHECK LO CAZA: `importe > 0` está contento, y el guardia del cuadre de
-- `emitir_factura` exime a las rectificativas. Es el eco exacto del aviso que la
-- 078 dejó escrito para el porte —«dinero declarado que no se puede devolver»—
-- pero en el CAMINO PRINCIPAL: cualquier devolución parcial de un pedido con
-- cupón, que es lo que hace cualquiera desde el panel.
--
-- ⭐ LA SOLUCIÓN: el descuento se imputa hasta el nivel de LÍNEA y se CONGELA en
-- `pedido_items.descuento_imputado`. Entonces `importe` pasa a ser el dinero NETO
-- cobrado por esas unidades, lo calcula UNA función, y los tres escritores que hoy
-- copian la misma fórmula (044:146, 068:600, 080:1021) pasan a llamarla.
--
-- ⚠️⚠️ POR QUÉ CONGELAR Y NO DERIVAR AL LEER. Se consideró dejar `importe` como un
-- PESO y convertirlo a dinero en tiempo de lectura. Se descarta: esa conversión
-- leería `pedidos.descuento` y `pedido_items` EN VIVO, y toda esta casa está
-- construida sobre lo contrario —`carrito_items.precio_unitario` es una copia,
-- `checkout_datos.coste_envio` es un snapshot, `pedido_items.iva_pct` se congela al
-- vender, `facturas_emitidas.lineas` es inmutable—. Derivar al leer significa que
-- el día que alguien toque `pedidos.descuento` de un pedido con rectificativa ya
-- emitida, la función empieza a decir un número distinto del que dice el papel, y
-- `trg_factura_inmutable` impide corregir el papel. Es la avería de la 074 con otra
-- cara, y en el único sitio donde no hay vuelta atrás.
--
-- ── §0.8 · EL GUARDIA NUEVO QUE ESTE TRABAJO PAGA DE PASO ────────────────────
--
-- ⭐⭐ El guardia de cuadre de `emitir_factura` compara el DESGLOSE contra
-- `pedidos.total` — NO la suma de `lineas`. Así que una línea de descuento con el
-- signo o el importe equivocados no la caza nada: la factura se emite, se encadena
-- y se vuelve inmutable con unas líneas que no suman su total. Para siempre.
--
-- Comprobado contra el remoto el 2026-08-23, las 9 facturas emitidas una a una: el
-- invariante «Σ lineas.importe = total» SE CUMPLE HOY EN TODAS, formato viejo y
-- nuevo, ventas y rectificativas.
--
--   VALS202600101   1,20 + 2,50 + 3,40                      =   7,10 ✓
--   VALS202600100  10,00+1,20+0,50+3,00+1,50+2,20+1,20      =  19,60 ✓
--   VALR202600101 −10,00−3,00−1,50−2,20−1,20                = −17,90 ✓
--   VALR202600104  −3,40                                    =  −3,40 ✓
--
-- Luego se puede ELEVAR A GUARDIA sin deuda previa, y este es el momento exacto:
-- el descuento es el primer concepto capaz de romperlo en silencio.
--
-- ── §0.9 · LO QUE LA LEY OBLIGA, ARTÍCULO POR ARTÍCULO ───────────────────────
--
--   · Art. 78.Tres.2 LIVA — el descuento concedido PREVIA O SIMULTÁNEAMENTE a la
--     operación NO forma parte de la base imponible. Es el encuadre de esto: un
--     cupón en el checkout MINORA LA BASE, no es una venta negativa. Por eso el
--     código se congela en `pedidos.descuento_codigo`: es el «medio de prueba
--     admitido en derecho» que el artículo exige.
--
--   · ⚠️⚠️ Art. 78.Tres.2, párrafo segundo — un descuento que sea REMUNERACIÓN DE
--     OTRA OPERACIÓN sí forma parte de la base. O sea que un código dado A CAMBIO
--     DE ALGO (una reseña, un referido, suscribirse) NO minora la base y esta
--     tubería NO SIRVE PARA ÉL. No hay guardia técnico posible: nada impide crear
--     ese código desde el panel. Va como aviso en la pantalla de TI.
--
--   · Art. 80.Uno.2 LIVA — los descuentos POSTERIORES a la operación obligan a
--     modificar la base con su rectificativa. Aplicar un cupón a un pedido ya
--     pagado cae aquí, y queda FUERA: exigiría un segundo generador de
--     rectificativas cuya idempotencia no puede ir por `refund_id`.
--
--   · Art. 7.1.f RD 1619/2012 — en factura simplificada con varios tipos hay que
--     especificar la base por separado para cada uno. El reparto del descuento por
--     tipo NO es higiene técnica: es obligación legal.
--
--   · Art. 6.1.f RD 1619/2012 — la factura completa (el canje de la 073) debe
--     consignar «cualquier descuento o rebaja que no esté incluido en dicho precio
--     unitario». Luego el descuento tiene que quedar GUARDADO en
--     `facturas_emitidas.lineas` al emitir, no reconstruido en el canje.
--
--   · Art. 19 Ley 7/1996 (LOCM) — en los anuncios de la promoción hay que
--     especificar su DURACIÓN y sus reglas especiales. No se cumple con columnas:
--     se cumple con el texto que acompaña al código cuando se difunde. De ahí la
--     columna `descripcion`, que es lo que se publica.
--
--   · Art. 20.1 RDL 1/2007 — precio total desglosado, con el descuento ya aplicado
--     y el transporte incluido, ANTES de que el consumidor decida.
--
--   · Art. 107 RDL 1/2007 — en el desistimiento se devuelven TODOS los pagos
--     recibidos: con cupón, lo efectivamente cobrado, nunca el PVP de catálogo. Es
--     la norma que obliga al §0.7.
--
-- ⚠️⚠️ PARA LA GESTORÍA, Y ES LA MISMA LLAMADA QUE LA DEL PORTE. El punto 2 de la
-- cola ya arrastra el tratamiento del porte (art. 78.Dos.1º). El descuento añade el
-- art. 78.Tres.2, la frontera con el 80.Uno.2, y el `TipoRectificativa` «por
-- diferencias». Una llamada, las dos preguntas, y ANTES de marcar
-- `arranque_fiscal_el`: después la cadena de huellas ya no se recalcula.
--
-- ── §0.10 · LO QUE QUEDA FUERA, DICHO PARA QUE NADIE LO AÑADA COMO SI FUERA
--            UN CASO MÁS ───────────────────────────────────────────────────────
--
--   · Importe fijo («−5 €»)               — §0.2
--   · Dos porcentajes acumulados          — §0.4
--   · Cupones selectivos y 2x1            — §0.4
--   · Descuento sobre un pedido ya pagado — §0.9 (art. 80.Uno.2)
--   · El pedido de 0,00 €                 — `pedidos.total CHECK (total > 0)` es
--     estricto, y Stripe no cobra por debajo de 0,50 €. Un producto genuinamente
--     gratis necesita relajar el CHECK de la 002, una ruta de cobro sin cobro, y
--     decidir si devenga y si es art. 78.Tres.2 o entrega gratuita del art. 9 LIVA.
--     Es otro trabajo, igual que la 080 dejó fuera el IVA de Canarias.
--
-- ═══════════════════════════════════════════════════════════════════════════════


-- ── §1 · EL ESQUEMA ──────────────────────────────────────────────────────────
--
-- ⭐ CERO CÓDIGOS = CERO CAMBIOS. Todo lo de aquí abajo es inerte: los defaults son
-- 0 y NULL, y mientras no exista ninguna fila en `codigos_descuento` ningún camino
-- del código puede producir un descuento. Es el mismo criterio con el que la 080 se
-- aplicó con la tarifa a 0. Se puede aplicar y verificar sin que la tienda cambie.

-- ── §1.1 · La tabla de códigos ───────────────────────────────────────────────

create table if not exists public.codigos_descuento (
  id               uuid primary key default gen_random_uuid(),

  -- Se guarda tal como se teclea y se compara en mayúsculas (ver el índice único
  -- de abajo). Guardar ya normalizado perdería la forma en que el dueño lo escribió
  -- para difundirlo, que es lo que se publica.
  codigo           text        not null,

  tipo             text        not null,
  porcentaje       numeric(5,2),

  -- Lo que se publica junto al código. Art. 19 LOCM: la duración y las reglas
  -- especiales van en el anuncio, no solo en la base.
  descripcion      text,

  minimo_articulos numeric(10,2),
  usos_maximos     integer,
  usos             integer     not null default 0,

  valido_desde     timestamptz,
  valido_hasta     timestamptz,
  activo           boolean     not null default true,

  creado_por       uuid        references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint codigos_descuento_codigo_no_vacio
    check (length(btrim(codigo)) between 3 and 40),

  -- Los dos tipos que pidió el dueño y ningún otro. Añadir un tercero es una
  -- migración, y eso es a propósito: cada tipo nuevo tiene que responder al §0.2.
  constraint codigos_descuento_tipo_valido
    check (tipo in ('porcentaje', 'envio_gratis')),

  -- El porcentaje existe si y solo si el tipo lo usa. Sin esto cabría un
  -- 'envio_gratis' con un 20 % que nadie leería, o un 'porcentaje' sin número que
  -- descontaría cero y parecería un cupón roto.
  constraint codigos_descuento_porcentaje_solo_su_tipo
    check ((tipo = 'porcentaje') = (porcentaje is not null)),

  -- ⚠️ El tope de 90 NO es una elección estética. Deja lejos las dos paredes del
  -- §0.10: `pedidos.total > 0` y el mínimo de 0,50 € de Stripe. Un cupón del 100 %
  -- es una funcionalidad distinta, no un porcentaje grande.
  constraint codigos_descuento_porcentaje_rango
    check (porcentaje is null or (porcentaje > 0 and porcentaje <= 90)),

  constraint codigos_descuento_usos_no_negativos
    check (usos >= 0),

  -- Mismo razonamiento que `ajustes_envio_gratis_desde_positivo` de la 080: un tope
  -- de 0 no es «cero usos permitidos», es una casilla a medio rellenar. NULL es
  -- «sin límite», que es una respuesta y se lee como tal.
  constraint codigos_descuento_usos_maximos_positivo
    check (usos_maximos is null or usos_maximos > 0),

  constraint codigos_descuento_minimo_positivo
    check (minimo_articulos is null or minimo_articulos > 0),

  constraint codigos_descuento_vigencia_coherente
    check (valido_desde is null or valido_hasta is null or valido_hasta > valido_desde)
);

-- Un código es uno, se teclee como se teclee. El índice va sobre `upper()` porque
-- el cliente escribirá «verano20» y el cartel dirá «VERANO20».
create unique index if not exists codigos_descuento_codigo_unico
  on public.codigos_descuento (upper(btrim(codigo)));

create index if not exists codigos_descuento_activos
  on public.codigos_descuento (activo, valido_hasta)
  where activo;

comment on table public.codigos_descuento is
  'Los códigos de descuento de la tienda (083). Dos tipos y solo dos: `porcentaje` minora la base de los artículos (art. 78.Tres.2 LIVA) y `envio_gratis` pone `pedidos.coste_envio` a 0, que NO minora ninguna base. Se crean desde el módulo de TI. El tope de usos es BLANDO por diseño: ver §0.6 de la migración.';

comment on column public.codigos_descuento.porcentaje is
  'El porcentaje que descuenta, solo para tipo = porcentaje. Topado a 90 para dejar lejos `pedidos.total > 0` y el mínimo de 0,50 € de Stripe: un cupón del 100 % es otra funcionalidad.';

comment on column public.codigos_descuento.descripcion is
  'El texto que se publica junto al código. Art. 19 LOCM exige anunciar la duración y las reglas especiales de la promoción, y eso no se cumple con columnas de fecha: se cumple con este texto donde se difunda el código.';

comment on column public.codigos_descuento.usos is
  'Usos consumidos. Se incrementa DENTRO de `confirmar_venta`, protegido por la misma idempotencia (`pg_advisory_xact_lock` + `referencia_pago`) para que un reintento del webhook no lo cuente dos veces.';

-- ⚠️ Constitución, Principio III: ninguna tabla sin RLS. Esta no tiene dueño por
-- fila —es configuración de la tienda, como `ajustes_tienda`—, así que se activa
-- RLS y NO se crea ninguna política: solo la alcanzan la `service_role` y las
-- funciones `security definer`. Un cliente NO puede enumerar los códigos.
alter table public.codigos_descuento enable row level security;

revoke all on table public.codigos_descuento from public, anon, authenticated;


-- ── §1.2 · Lo que se congela en el pedido ────────────────────────────────────

alter table public.pedidos
  add column if not exists descuento        numeric(10,2) not null default 0,
  add column if not exists descuento_codigo text,
  add column if not exists envio_descontado numeric(10,2) not null default 0;

alter table public.pedidos
  drop constraint if exists pedidos_descuento_no_negativo,
  add  constraint pedidos_descuento_no_negativo
    check (descuento >= 0);

alter table public.pedidos
  drop constraint if exists pedidos_envio_descontado_no_negativo,
  add  constraint pedidos_envio_descontado_no_negativo
    check (envio_descontado >= 0);

-- ⚠️ Dinero regalado exige código, pero NO al revés, y la asimetría es real: un
-- código de envío gratis aplicado a un carrito que ya pasaba del umbral regala
-- 0,00 € y aun así hay que dejar constancia de que se usó. Un biconditional aquí
-- rechazaría ese pedido, que es legítimo.
alter table public.pedidos
  drop constraint if exists pedidos_descuento_exige_codigo,
  add  constraint pedidos_descuento_exige_codigo
    check (descuento = 0 or descuento_codigo is not null);

alter table public.pedidos
  drop constraint if exists pedidos_envio_descontado_exige_codigo,
  add  constraint pedidos_envio_descontado_exige_codigo
    check (envio_descontado = 0 or descuento_codigo is not null);

comment on column public.pedidos.descuento is
  'El descuento de la mercancía, IVA incluido. Está DENTRO de `total`, RESTANDO — igual que `coste_envio` está dentro sumando. 0 = este pedido no llevó cupón de porcentaje, que es una lectura verdadera y conservadora (la razón del default 0, ver 080 §0.4).';

comment on column public.pedidos.descuento_codigo is
  'El código que se aplicó, congelado. Es el «medio de prueba admitido en derecho» que exige el art. 78.Tres.2 LIVA para que el descuento no forme parte de la base. Se guarda el texto, no la FK: borrar un código del panel no puede reescribir la historia de un pedido.';

comment on column public.pedidos.envio_descontado is
  'El porte que se dejó de cobrar por un código de tipo `envio_gratis`. ⚠️ NO está dentro de `total` ni de ningún desglose: `coste_envio` ya vale 0 y la factura omite su línea (`linea_envio_factura` filtra por `envio > 0`). Existe solo para poder responder «cuánto me costó esta campaña» sin adivinarlo.';


-- ── §1.3 · La imputación por línea, que es lo que hace posible la devolución ──

alter table public.pedido_items
  add column if not exists descuento_imputado numeric(10,2) not null default 0;

alter table public.pedido_items
  drop constraint if exists pedido_items_descuento_no_negativo,
  add  constraint pedido_items_descuento_no_negativo
    check (descuento_imputado >= 0);

-- ⭐⭐ ESTE CHECK ES LA PIEZA CLAVE DEL DISEÑO, y no es defensivo: convierte la
-- demostración del §0.2 —«ningún trozo del descuento supera lo que su línea
-- aporta»— en una IMPOSIBILIDAD DE ESQUEMA. Si algún día alguien cambia la fórmula
-- del reparto y se equivoca, no sale un neto negativo: no entra la fila.
alter table public.pedido_items
  drop constraint if exists pedido_items_descuento_no_come_la_linea,
  add  constraint pedido_items_descuento_no_come_la_linea
    check (descuento_imputado <= cantidad * precio_unitario);

comment on column public.pedido_items.descuento_imputado is
  'La parte del descuento del pedido imputada a esta línea, IVA incluido, congelada al vender. `cantidad * precio_unitario - descuento_imputado` es el dinero que el cliente pagó DE VERDAD por esta línea, y es lo que se le devuelve (art. 107 RDL 1/2007). Existe porque `reembolso_lineas.pedido_item_id` es NOT NULL: la devolución solo sabe hablar de líneas, así que el descuento tiene que llegar hasta aquí.';


-- ── §1.4 · `reembolso_lineas.importe` deja de ser PVP y pasa a ser NETO ──────
--
-- ⚠️⚠️ ES EL ÚNICO CAMBIO DE SEMÁNTICA DE UN DATO YA ESCRITO EN TODA LA MIGRACIÓN,
-- y hay que entender por qué es obligatorio. Hoy `importe` es
-- `cantidad × pedido_items.precio_unitario`, o sea PVP DE CATÁLOGO. Con un cupón,
-- `pedido_iva` está ya minorado y ese importe diría MÁS de lo cobrado:
--
--   · se le devolvería al cliente más dinero del que pagó (dinero real fuera);
--   · la rectificativa rectificaría más base de la que declaró la venta;
--   · y el 303 se quedaría con IVA repercutido NEGATIVO.
--
-- Y NINGÚN CHECK LO CAZA: `importe > 0` está contento, y el guardia del cuadre de
-- `emitir_factura` EXIME a las rectificativas.
--
-- ⭐⭐ NO HAY QUE REESCRIBIR NINGUNA FILA HISTÓRICA, y no por suerte: para
-- `descuento_imputado = 0` las dos fórmulas son la MISMA. La nueva es
-- `round(neto × (ya+k)/n, 2) − round(neto × ya/n, 2)` con `neto = n × precio`;
-- como `precio` es `numeric(10,2)`, `precio × entero` es exacto a dos decimales, los
-- dos `round` no redondean nada y la diferencia es `precio × k`, que es exactamente
-- lo que se escribía antes. Comprobado sobre las 7 filas que ya existen.
--
-- ⚠️ Lo que SÍ cambia es lo que significa la columna de aquí en adelante, y eso va
-- en su `comment on column` y en ESTADO.md. Cualquier consulta ad hoc antigua que
-- asumiera PVP miente a partir de este punto.

alter table public.reembolso_lineas
  drop constraint if exists reembolso_lineas_importe_check;

alter table public.reembolso_lineas
  drop constraint if exists reembolso_lineas_importe_no_negativo,
  add  constraint reembolso_lineas_importe_no_negativo
    check (importe >= 0);

comment on column public.reembolso_lineas.importe is
  'El dinero NETO que se le devuelve al cliente por esas unidades: lo que pagó de verdad, con el descuento del cupón ya restado (083 §6). ⚠️ Antes de la 083 era cantidad × precio_unitario, o sea PVP de catálogo; para pedidos sin cupón las dos fórmulas coinciden exactamente, así que ninguna fila histórica cambió de valor. Lo calcula importe_a_devolver y NADIE MÁS: art. 107 RDL 1/2007 obliga a devolver lo efectivamente cobrado, nunca el PVP.';


-- ── §1.5 · El snapshot del checkout ──────────────────────────────────────────
--
-- ⚠️ `checkout_datos` se limpia a las 48 h por pg_cron (019). Lo que se congele
-- SOLO aquí desaparece, y el fallback tiene que ser una decisión explícita, no un
-- `coalesce` casual. Por eso el código viaja ADEMÁS en la metadata del pago, que va
-- por intent y no por sesión: es el cinturón que sobrevive a la limpieza y al
-- webhook que llega tarde.

alter table public.checkout_datos
  add column if not exists descuento_codigo  text,
  add column if not exists descuento_importe numeric(10,2),
  add column if not exists envio_descontado  numeric(10,2);

alter table public.checkout_datos
  drop constraint if exists checkout_datos_descuento_no_negativo,
  add  constraint checkout_datos_descuento_no_negativo
    check (descuento_importe is null or descuento_importe >= 0);

comment on column public.checkout_datos.descuento_importe is
  'El descuento congelado al crear el pago. NULL = sin snapshot. ⚠️ El webhook factura ESTO y NO revalida el código: revalidar facturaría un total distinto del cobrado. Es la razón por la que el tope de usos es blando (§0.6).';


-- ═══════════════════════════════════════════════════════════════════════════════
-- ⚠️⚠️ AQUÍ SE CORTA. Lo que falta, en orden, y NADA de esto debe escribirse sin
-- poder correr el ensayo revertido contra el remoto:
--
--   §2  `reparto_conceptos_pedido` — generalizar `reparto_envio_pedido` para que
--       devuelva (iva_pct, articulos, envio, descuento). ⚠️ Es UN drop + create con
--       sus cuatro consumidores recreados en la MISMA transacción, y antes un
--       bloque `do` que escanee `pg_get_functiondef` de todo `public` buscando
--       referencias al nombre viejo: Postgres no avisa, y sus llamadores están en
--       la ruta del dinero.
--   §3  `recalcular_iva_pedido` — un solo cambio: `articulos + envio` pasa a
--       `articulos + envio - descuento`. EL GUARDIA NO SE TOCA (§0).
--   §4  `reparto_descuento_lineas` + el trigger que escribe `descuento_imputado`,
--       con el acumulado ordenado por (iva_pct, pedido_item_id) — el orden es lo
--       que hace que el reparto por línea y el reparto por tipo sean el MISMO
--       número por construcción, y no dos aritméticas que hay que rezar.
--   §5  `coste_envio_de` — aprende el código de envío gratis. ⚠️ La regla NO puede
--       vivir en TypeScript: `carrito.service.ts` ya lo tiene prohibido por escrito.
--   §6  `importe_a_devolver` — UNA función, y los tres escritores de
--       `reembolso_lineas.importe` (044:146, 068:600, 080:1021) pasan a llamarla.
--       Relaja `importe > 0` a `>= 0`: con netos, una unidad puede valer 0,00 €
--       legítimamente, y filtrar esa fila deja la unidad sin apuntar y —si es la
--       última— sin disparar el trigger de la rectificativa.
--   §7  `linea_descuento_factura` + `emitir_factura` + `emitir_rectificativa`.
--       ⚠️ `emitir_factura` tiene 10 parámetros con defaults: ampliar la firma
--       obliga a `drop function` explícito o quedan dos sobrecargas ambiguas (068,
--       repetido en 077 §1).
--   §8  EL GUARDIA NUEVO: `Σ lineas.importe = total` en `emitir_factura` (§0.8).
--   §9  `liquidacion_iva` ENTERA, con el §7 de la 080 saldado. Decidido con el
--       dueño el 2026-08-23: va en este mismo trabajo, porque con cupones el
--       argumento de «la dirección del error es la conservadora» deja de ser cierto
--       —los dos errores viven en el mismo CTE con signo contrario— y el 303 podría
--       declarar DE MENOS. 18 KB a transcribir, tres CTEs a tocar, y `md5(prosrc)`
--       contra el fichero antes de dar nada por bueno.
--   §10 `revoke execute` de cada función nueva Y el bloque `do` que lo COMPRUEBA
--       con `has_function_privilege`: la 062 §5 documenta que hay DOS fuentes de
--       permiso y que el REVOKE no protesta si te dejas una.
--
-- Y FUERA DE LA BASE: el endpoint de aplicar/quitar código (con su DTO, que
-- `ValidationPipe` va con `forbidNonWhitelisted`), la pantalla de TI con
-- `@Nivel("total")` —cambia lo que paga el cliente—, la caja del carrito, y los
-- tests. ⚠️ De los tests hay que saber de antemano qué agujas van a mentir en
-- verde: `toContain("Descuento")` casa con «descontado», que ya aparece en el modal
-- de reembolsos; `toContain("-2,00")` casa con cualquier importe negativo,
-- rectificativas incluidas; y un carrito de un solo tipo de IVA valida cualquier
-- prorrateo. Las agujas tienen que ser la CELDA o el JSON parseado y el NÚMERO
-- EXACTO POR TIPO, y hay que VERLAS ROJAS antes.
-- ═══════════════════════════════════════════════════════════════════════════════
