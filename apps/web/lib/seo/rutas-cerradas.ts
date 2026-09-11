/**
 * Las rutas que no son para buscadores, y las dos cosas distintas que hay que
 * hacerles.
 *
 * ── POR QUÉ ESTO ES UN MÓDULO APARTE ──
 *
 * La lista vivía en `mapa-del-sitio.ts`, que es quien la usaba junto con
 * `app/robots.ts`. A partir del 11/09 la necesita también el **middleware**, y ahí
 * importar `mapa-del-sitio` sería un error: ese fichero importa `API_URL` y hace
 * `fetch` del catálogo, y el middleware corre en el Edge y se ejecuta **en cada
 * petición de la tienda**. Meterle el módulo que pide el catálogo por arrastre es
 * cargar el peaje de todas las visitas para no repetir una lista. Así que la lista
 * se muda a un fichero sin ninguna dependencia y los tres la importan de aquí.
 *
 * ── LAS DOS COSAS, QUE NO SON LA MISMA ──
 *
 * ⚠️⚠️ `robots.txt` NO ES UNA ORDEN DE «NO INDEXAR». Es la confusión que señaló la
 * auditoría SEO del 09/09 y tenía razón: `Disallow` pide que **no se rastree**, y
 * una URL bloqueada **puede aparecer igualmente en Google** si alguien la enlaza —
 * sale como un resultado sin descripción, porque Google sabe que existe pero no le
 * han dejado leerla. Y estas rutas se enlazan desde la propia cabecera de la tienda.
 *
 * Quien de verdad dice «no la metas en el índice» es la cabecera `X-Robots-Tag`
 * (o su equivalente en `<meta name="robots">`), que es lo que se pone aquí.
 *
 * ⚠️⚠️ Y LA TRAMPA, QUE ES LO QUE HAY QUE ENTENDER ANTES DE TOCAR EL `Disallow`:
 * para leer el `noindex` hay que **rastrear** la página. Una ruta que está a la vez
 * en `Disallow` y con `noindex` deja a Google sin poder leer el `noindex` nunca. O
 * sea que las dos medidas juntas se estorban, y el orden para arreglarlo tiene una
 * sola dirección posible:
 *
 *   1. **Primero** desplegar el `noindex` y comprobarlo en producción.
 *   2. **Después**, y solo entonces, retirar del `Disallow` las pantallas públicas
 *      —carrito, favoritos, login, registro— para que Google pueda leerlo.
 *
 * Al revés se abre a rastreo una zona que todavía no tiene la etiqueta puesta.
 * El paso 2 está **pendiente a propósito**: hoy solo se hace el 1.
 *
 * ⚠️ `/checkout` NO va a salir del `Disallow` ni en el paso 2, y esto es donde se
 * discrepa del informe, que agrupa las cinco pantallas públicas. `noindex` no evita
 * el rastreo, solo la indexación — y **cada entrada en `/checkout` crea una sesión y
 * una reserva de stock**. Abrirlo al rastreo para que un robot pueda leer una
 * etiqueta se paga en reservas de stock de productos que nadie va a comprar. Se
 * queda cerrado, y lleva el `noindex` de todas formas por si algún día se abre.
 */

/**
 * Rutas cerradas al rastreo, en orden de importancia.
 *
 * ⚠️⚠️ LAS NECESITAN TRES FICHEROS: `robots.txt` para prohibirlas, el mapa del sitio
 * para no anunciarlas, y el middleware para marcarlas como no indexables. Anunciar
 * en el mapa lo que se prohíbe rastrear es contradecirse —Search Console lo marca
 * como aviso, y con razón—, y hasta el 26/08 la única defensa contra eso era un
 * comentario en prosa dentro de `sitemap.ts` que decía «NO van /carrito,
 * /checkout…». El mismo dato en dos sitios, uno de ellos en forma de buena
 * intención: es la piedra con la que este proyecto lleva tropezando (`API_URL`, el
 * título de la tienda, el correo de contacto). Ahora hay una lista y tests que
 * comprueban que los tres la respetan.
 *
 * ⚠️ `/api/` no se cierra por seguridad —eso lo hacen las RLS y los guards, no un
 * fichero de texto que cualquiera lee— sino porque son respuestas JSON sin nada que
 * indexar. Y `/checkout` es el que más importa: cada entrada crea una sesión y una
 * reserva de stock.
 */
export const RUTAS_CERRADAS = [
  "/checkout",
  "/carrito",
  // Distinta para cada visitante y sin nada que indexar, igual que el carrito.
  "/favoritos",
  "/cuenta",
  "/backoffice",
  "/login",
  /**
   * ⚠️⚠️ `/admin` ES LA PUERTA DEL PANEL, Y HASTA EL 11/09 NO ESTABA EN ESTA LISTA.
   * Medido ese día contra producción: respondía **200**, sin `Disallow` y sin
   * `noindex`, o sea que la pantalla de acceso del personal era rastreable e
   * indexable. Se escapó porque el middleware manda ahí al staff (`loginPath` =
   * `/admin` para `/backoffice`) mientras la lista solo hablaba de `/login`, que es
   * la de los clientes. La auditoría del 09/09 tampoco la vio: revisó `/login`,
   * `/registro` y `/backoffice`.
   *
   * ⚠️ Esto NO es un agujero de seguridad —el panel sigue pidiendo sesión y rol, y
   * un `robots.txt` no protege nada— pero sí es exactamente lo que el propio
   * criterio de aceptación del informe pedía que no pasara: «ninguna URL de acceso
   * ni administración aparece como página indexada».
   */
  "/admin",
  "/registro",
  "/api/",
  // El callback de acceso lleva el código de un solo uso en la URL.
  "/auth/",
] as const;

/**
 * Lo que se le dice al buscador de estas páginas.
 *
 * ⭐ `follow` y no `nofollow`, y es deliberado: el carrito y los favoritos enlazan a
 * fichas de producto, que **sí** interesa que se rastreen. Lo que no se quiere es
 * que la lista de la compra de alguien sea un resultado de búsqueda, no cortarle a
 * Google el camino hacia el catálogo.
 */
export const NO_INDEXAR = "noindex, follow";

/**
 * Si una ruta debe quedar fuera del índice.
 *
 * ⚠️ Compara por PREFIJO a propósito, que es exactamente como interpreta Google el
 * `Disallow` de `robots.txt`. Así el conjunto que lleva `noindex` y el que está
 * prohibido son **el mismo conjunto**, y hay un test que lo fija. Si esto comparara
 * por igualdad exacta, `/checkout/confirmacion` —que lleva la referencia del pago en
 * la URL— se quedaría fuera del `noindex` estando dentro del `Disallow`.
 */
export function fueraDelIndice(ruta: string): boolean {
  return RUTAS_CERRADAS.some((cerrada) => ruta.startsWith(cerrada));
}
