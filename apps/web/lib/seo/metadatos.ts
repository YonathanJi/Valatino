import type { Metadata } from "next";
import type { Producto } from "@valatino/types";
import { miniaturaDe } from "@lib/productos/variantes";
import { formatEUR } from "@lib/utils";

/**
 * Lo que ve WhatsApp cuando alguien pega un enlace de la tienda.
 *
 * Son las etiquetas Open Graph: el crawler descarga la página, las lee y monta
 * la tarjeta con foto, título y descripción. Sin ellas sale la URL pelada, que
 * parece spam — y la tienda se comparte justo por ahí.
 *
 * ⚠️ **Vive aquí y no en el JSX de las páginas a propósito**, por lo mismo que
 * `vistaDeFamilia` en `lib/productos/variantes.ts`: la web no tiene tests de
 * componentes, así que una regla metida en un `export const metadata` es una
 * regla sin red. Y esta en concreto **es invisible cuando se rompe**: no da
 * error, no rompe la página, solo deja de salir la foto al compartir. Puede
 * estar mal durante semanas sin que nadie lo note.
 */

/**
 * El dominio propio, verificado de punta a punta desde el 2026-08-05.
 *
 * ⚠️ **Constante y NO variable de entorno, a propósito.** Un `NEXT_PUBLIC_*` se
 * inlinea en el bundle al construir, así que habría que acordarse de redesplegar
 * para que surtiera efecto — la misma trampa que costó vueltas con
 * `NEXT_PUBLIC_API_URL` el 05/08 y con `PROXY_API_SECRETO` el 17/08. Y no es un
 * secreto ni un dato de negocio configurable: es el dominio, y si cambia se
 * cambia aquí, que es donde se busca.
 */
export const SITIO = "https://valatino.es";

export const SITIO_NOMBRE = "Valatino";

/**
 * El título y la descripción de la tienda.
 *
 * ⚠️ Estaban como constantes locales de `app/layout.tsx` y se subieron aquí cuando los
 * datos estructurados los necesitaron: el mismo texto en dos ficheros es la piedra con
 * la que este proyecto ya tropezó tres veces (`API_URL` el 23/08 fue la peor). Si la
 * ficha de schema.org y la etiqueta `<meta>` dijeran cosas distintas, el buscador se
 * encontraría dos versiones de la misma tienda.
 *
 * ⚠️ El TÍTULO empieza por el nombre a propósito. Es lo que se lee en la pestaña y en
 * el resultado de búsqueda, y ante una consulta de marca —«valatino»— lo primero pesa.
 */
export const TITULO = "Valatino — Sabores de Latinoamérica en España";

export const DESCRIPCION =
  "Productos latinoamericanos originales enviados a toda España. Chocoramos, Jugos Hit, Galletas Ducales y mucho más.";

/** El `og:locale` que corresponde: castellano de España. */
export const LOCALE = "es_ES";

/**
 * Una URL que WhatsApp pueda pedir desde SUS servidores.
 *
 * ⚠️ **Una `og:image` relativa es una tarjeta sin foto.** El crawler no está en
 * nuestro dominio, así que un `/placeholder.png` no lo resuelve. Next lo arregla
 * solo si hay `metadataBase`, pero aquí se deja absoluta de forma explícita para
 * que la función sea correcta por sí misma y se pueda probar sin arrancar Next.
 */
export function urlAbsoluta(ruta: string): string {
  if (/^https?:\/\//i.test(ruta)) return ruta;
  return `${SITIO}${ruta.startsWith("/") ? "" : "/"}${ruta}`;
}

/** Dónde vive la ficha de un producto. Mismo criterio que la tarjeta del catálogo. */
export function rutaDeProducto(p: Pick<Producto, "id" | "slug">): string {
  return `/productos/${p.slug ?? p.id}`;
}

const RUTA_OBJETO = "/storage/v1/object/public/";
const RUTA_RENDER = "/storage/v1/render/image/public/";

/**
 * La misma foto del catálogo, pero en un formato y un tamaño que cualquier
 * crawler de mensajería trague sin dudar.
 *
 * ⚠️⚠️ **El catálogo entero está en WebP**, comprobado con los bytes del fichero
 * (`52 49 46 46 … 57 45 42 50` = `RIFF…WEBP`) y no por la extensión, que aquí no
 * demuestra nada: el panel acepta el fichero por su mimetype, así que un `.webp`
 * puede llevar otra cosa dentro. Servir WebP en `og:image` es apostar a que el
 * cliente de mensajería lo pinte, y no todos lo hacen.
 *
 * La salida de `render/image` con **`format=origin`** viene en **JPEG de verdad**
 * (comprobado: empieza por `ff d8 ff`). El nombre engaña — no devuelve «el
 * formato original», sino que se salta la conversión automática a WebP y vuelve a
 * codificar en JPEG. Es exactamente lo que hace falta, y sin subir nada aparte.
 *
 * ⚠️ **`resize=contain` y NO `cover`.** Las fotos del catálogo son cuadradas y
 * `cover` recorta a 1200×630: se probó y el producto sale **decapitado** (al tarro
 * de Colcafé se le iban la tapa y la base). `contain` encaja la foto entera dentro
 * de la caja, así que un cuadrado sale a 630×630 y ocupa 35 KB en vez de 74 KB.
 *
 * ⚠️ Si la URL no es del bucket (hoy, el `/placeholder.png` de un producto sin
 * foto) se devuelve absoluta y sin tocar: no hay nada que transformar.
 *
 * ⭐ De paso arregla la caché, que era el otro problema: el objeto crudo sale con
 * `Cache-Control: no-cache`, y esta transformación con `max-age=3600` y
 * `CF-Cache-Status: HIT`. O sea que enlazar aquí cachea MEJOR que enlazar la foto
 * directa — y eso contiene también el coste, porque las transformaciones de
 * Supabase se facturan y un HIT de Cloudflare no vuelve a transformar.
 *
 * ⚠️ **Todo esto está medido contra el bucket real, no leído en la documentación,
 * porque no está documentado.** `format=origin` suena a «devuélvelo en su formato
 * original» y hace lo contrario: se salta la conversión automática y reencoda en
 * JPEG. La matriz completa, si hay que rehacerla: sin `format` → cabecera
 * `image/webp` con bytes JPEG (incoherente, cosa de Supabase); `origin` → JPEG
 * coherente; `webp` → WebP; `avif` → AVIF; `jpeg` → 400. Si algún día Supabase
 * cambia esto, la degradación es suave: volvería a salir WebP, que es lo que
 * había antes y que los clientes de mensajería casi con seguridad ya pintan. Lo
 * que NO se pierde es el redimensionado ni la caché, que son el motivo principal.
 */
export function ogImagenDeFoto(url: string): string {
  if (!url.includes(RUTA_OBJETO)) return urlAbsoluta(url);
  const render = url.replace(RUTA_OBJETO, RUTA_RENDER);
  return `${render}?width=1200&height=630&resize=contain&format=origin`;
}

/**
 * ⚠️ Las dimensiones NO se declaran, y es una decisión.
 *
 * `contain` respeta la proporción de origen, así que la salida depende de cómo
 * fuera la foto: un cuadrado da 630×630, un vertical da 420×630. El panel no
 * redimensiona al subir, así que la proporción es la que traiga Jonathan. Declarar
 * un 1200×630 fijo sería mentirle al cliente de mensajería, y algunos usan ese
 * dato para reservar el hueco antes de bajar la imagen: saldría la tarjeta
 * descuadrada. Sin declararlas, la mide él.
 */
export const DESCRIPCION_GENERICA = "Producto latinoamericano original, enviado a toda España.";

/** Lo que caben en la tarjeta antes de que el propio WhatsApp corte por su cuenta. */
export const LIMITE_DESCRIPCION = 200;

/**
 * Corta por la última palabra entera, no a mitad de palabra.
 *
 * ⚠️⚠️ **El espacio del `4,92 €` NO es un espacio normal, y aquí se respeta a
 * propósito.** `Intl.NumberFormat` mete un espacio duro (U+00A0) entre la cifra y
 * el símbolo justo para que no se puedan separar al final de una línea. Y `\s` en
 * una expresión regular de JavaScript **también casa el espacio duro**, así que un
 * `replace(/\s+/g, " ")` a secas lo convertía en un espacio normal y dejaba que
 * WhatsApp partiera el precio en dos líneas: «4,92» arriba y «€» abajo.
 *
 * `[^\S\u00A0]` es «espacio en blanco que no sea el duro». Y buscar el hueco con
 * un `" "` literal hace que tampoco se corte por ahí, que es lo que se quiere.
 */
export function recortar(texto: string, limite = LIMITE_DESCRIPCION): string {
  const limpio = texto.replace(/[^\S\u00A0]+/g, " ").trim();
  if (limpio.length <= limite) return limpio;
  const cortado = limpio.slice(0, limite - 1);
  const hueco = cortado.lastIndexOf(" ");
  return `${(hueco > limite * 0.6 ? cortado.slice(0, hueco) : cortado).replace(/[.,;:·\s]+$/, "")}…`;
}

/**
 * El texto de la tarjeta, con el precio delante.
 *
 * El precio va primero porque es lo que decide si alguien abre el enlace, y
 * porque la descripción del producto puede ser larga o no existir.
 *
 * ⚠️ **El stock NO entra aquí, a propósito.** WhatsApp se queda la tarjeta en
 * caché, así que un «agotado» se quedaría pegado al enlace después de reponer —
 * y al contrario, peor: un enlace compartido diría «disponible» de algo que ya no
 * está. Una tarjeta que miente es peor que una tarjeta sin ese dato.
 */
export function descripcionDeProducto(p: Pick<Producto, "descripcion" | "precio">): string {
  const texto = p.descripcion?.trim() || DESCRIPCION_GENERICA;
  return recortar(`${formatEUR(Number(p.precio))} · ${texto}`);
}

/**
 * El texto propio del producto, o **NADA**.
 *
 * ⚠️⚠️ EXISTE PORQUE LA MISMA REGLA ESTABA ESCRITA TRES VECES Y LAS TRES DECÍAN COSAS
 * DISTINTAS (medido el 30/08): la etiqueta `<meta name="description">` de la ficha
 * usaba `producto.descripcion` EN CRUDO, así que un producto sin texto emitía
 * `content=""`; el JSON-LD hacía `?.trim() || undefined` y lo omitía bien; y la
 * tarjeta social usaba `descripcionDeProducto`, con genérica de reserva. Tres copias
 * de la misma idea, una de ellas rota — el patrón que este proyecto lleva arreglando
 * todo el mes (`API_URL`, el título de la tienda, el `revalidate` del mapa).
 *
 * ⭐ Y OJO, QUE NO ES LA MISMA REGLA QUE LA DE LA TARJETA, A PROPÓSITO:
 *
 *   · **Buscador** (aquí): sin texto, **no se pone la etiqueta**. Una descripción
 *     genérica repetida en varias fichas Google la descarta y compone el fragmento
 *     con el contenido de la página, que además queda mejor. Una etiqueta vacía es lo
 *     peor de todo: gasta la señal y no dice nada.
 *   · **Tarjeta social** (`descripcionDeProducto`): sin texto, **sí** se pone la
 *     genérica, porque ahí lo lee una persona al instante y una tarjeta en blanco
 *     parece rota.
 *
 * Dos consumidores con necesidades distintas y dos reglas distintas. Por eso cada una
 * es una función CON NOMBRE, y no una expresión suelta que parezca un descuido.
 */
export function descripcionPropia(p: Pick<Producto, "descripcion">): string | undefined {
  return p.descripcion?.trim() || undefined;
}

type OpenGraph = NonNullable<Metadata["openGraph"]>;

/**
 * La tarjeta de una ficha de producto: su foto, su nombre y su precio.
 *
 * Es la mitad que de verdad se comparte —nadie manda «mira esta tienda», manda
 * «mira esto»— y no necesita ningún diseño nuevo: las 29 fichas activas ya tienen
 * foto.
 */
export function ogDeProducto(p: Producto): OpenGraph {
  return {
    title: p.nombre,
    description: descripcionDeProducto(p),
    url: urlAbsoluta(rutaDeProducto(p)),
    siteName: SITIO_NOMBRE,
    locale: LOCALE,
    type: "website",
    images: [{ url: ogImagenDeFoto(miniaturaDe(p)), alt: p.nombre }],
  };
}

/**
 * La portada de la tienda.
 *
 * ⚠️ La imagen la genera `app/portada.png/route.tsx` con la tipografía y la
 * paleta de la tienda, porque **no hay logo todavía** (está pendiente de que
 * Jonathan pase el modelo, igual que para el PDF de la factura). Cuando llegue,
 * se sustituye ese fichero por el diseño de verdad y esto no se toca.
 */
export function ogDelSitio(titulo: string, descripcion: string): OpenGraph {
  return {
    title: titulo,
    description: descripcion,
    url: SITIO,
    siteName: SITIO_NOMBRE,
    locale: LOCALE,
    type: "website",
    images: [
      {
        url: urlAbsoluta("/portada.png"),
        width: 1200,
        height: 630,
        alt: "Valatino — Sabores de Latinoamérica en España",
      },
    ],
  };
}
