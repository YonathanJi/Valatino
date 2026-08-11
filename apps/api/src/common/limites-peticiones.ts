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
 * Subidas. Son de personal autenticado y con módulo, así que el riesgo es la
 * cuenta comprometida, no internet. Pero cada una son megabytes que se parsean
 * y se suben a Storage.
 */
export const LIMITE_SUBIDAS = { default: { ttl: 60_000, limit: 20 } };

// El otro endpoint público sin sesión —la calificación de la compra, por
// token— ya trae su propio techo de 20/min desde que se creó; se deja donde
// está, junto al comentario que explica por qué esa ruta no distingue un token
// inválido de uno sin usar.
