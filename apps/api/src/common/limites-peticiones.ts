/**
 * Límites por operación, encima del global de 100/min.
 *
 * ⚠️ El global reparte la MISMA cuota entre todas las rutas, así que quien
 * quiera hacer daño elige la más cara y gasta ahí sus 100. Estos perfiles
 * ponen techo donde una petición cuesta dinero, bloquea filas de stock o llama
 * a un tercero.
 *
 * Van por minuto y por IP — pero eso solo significa algo si `trust proxy` está
 * bien puesto; ver el comentario de main.ts, porque sin él todo el mundo cae en
 * el mismo cubo.
 */

/**
 * Crear un pago. Cada una llama a Stripe o PayPal: abusar aquí quema cuota de
 * un tercero y deja intents basura en su panel.
 *
 * 15 y no 5: un cliente al que le rechazan la tarjeta reintenta, cambia de
 * método y vuelve a intentarlo, y quedarse corto aquí es no dejar comprar a
 * alguien que quiere pagar. Eso cuesta más que el abuso que evita.
 */
export const LIMITE_CREAR_PAGO = { default: { ttl: 60_000, limit: 15 } };

/**
 * Escribir en el carrito y reservar. `reservar_carrito` bloquea filas de
 * productos: repetirla en bucle es la forma barata de pelearse con el stock de
 * las compras de verdad.
 */
export const LIMITE_CARRITO = { default: { ttl: 60_000, limit: 40 } };

/**
 * Guardar y quitar favoritos (085).
 *
 * ⚠️ NO hereda `LIMITE_CARRITO` aunque se le parezca, porque el motivo de aquel no
 * aplica: `reservar_carrito` bloquea filas de productos y por eso se le pone un techo
 * bajo. Un favorito es un `upsert` de dos columnas que no bloquea nada.
 *
 * Sube a 80 porque el gesto invita a repetirlo —se recorre la rejilla dando
 * corazones— y porque exige sesión, así que el abuso está acotado a una cuenta y no
 * a internet entero. Sigue habiendo techo para que una cuenta comprometida no pueda
 * usar esto de martillo.
 */
export const LIMITE_FAVORITOS = { default: { ttl: 60_000, limit: 80 } };

/**
 * Subidas. Son de personal autenticado y con módulo, así que el riesgo es la
 * cuenta comprometida, no internet. Pero cada una son megabytes que se parsean
 * y se suben a Storage.
 */
export const LIMITE_SUBIDAS = { default: { ttl: 60_000, limit: 20 } };

/**
 * Probar un código de descuento (083).
 *
 * ⚠️⚠️ ESTA RUTA ES UN ORÁCULO, y por eso no hereda `LIMITE_CARRITO`. El carrito no
 * exige cuenta, así que cualquiera puede preguntarle «¿existe VERANO20?» y la
 * respuesta —el motivo del rechazo— distingue «no existe» de «no llegas al mínimo».
 * Con 40/min se enumeran códigos cortos en una tarde.
 *
 * 8 y no 3: alguien que teclea mal un código lo reintenta dos o tres veces, y
 * quedarse corto aquí es no dejar usar un descuento que la tienda quiso dar. El daño
 * del abuso está acotado además por `usos_maximos` y `minimo_articulos` del propio
 * código, así que esto es una barrera de coste, no la única defensa.
 *
 * ⚠️ Y no elimina el problema: con muchas IPs y paciencia se puede seguir
 * enumerando. Lo que de verdad lo cierra es que los códigos que valgan dinero sean
 * largos y no adivinables — eso es una decisión de quien los crea, y el panel de TI
 * tiene que decirlo.
 */
export const LIMITE_CODIGO_DESCUENTO = { default: { ttl: 60_000, limit: 8 } };

// El otro endpoint público sin sesión —la calificación de la compra, por
// token— ya trae su propio techo de 20/min desde que se creó; se deja donde
// está, junto al comentario que explica por qué esa ruta no distingue un token
// inválido de uno sin usar.
