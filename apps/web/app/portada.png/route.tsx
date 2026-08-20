import { ImageResponse } from "next/og";

/**
 * La imagen de la tarjeta que sale al compartir la tienda: `/portada.png`.
 *
 * ⚠️ **Es provisional, y el motivo está anotado para que no se dé por terminada:**
 * no hay logo todavía (pendiente de que Jonathan pase el modelo, lo mismo que
 * bloquea el PDF de la factura). Sin logo, el diseño es la tipografía. Cuando
 * llegue, se sustituye este fichero por un PNG de verdad en `public/portada.png`
 * y se borra la ruta — la URL no cambia, así que no hay que tocar los metadatos
 * ni esperar a que WhatsApp suelte su caché de un enlace distinto.
 *
 * ⚠️ **Por qué una ruta y no `opengraph-image.tsx`**, que es el mecanismo de Next
 * para esto. Se fue a leer el resolver de la versión instalada (15.5.23,
 * `next/dist/lib/metadata/resolve-metadata.js`) en vez de suponerlo, y la
 * precedencia real es: `mergeStaticMetadata` solo aplica el fichero del ancestro
 * `if (openGraph && !source?.openGraph?.hasOwnProperty('images'))`, y después el
 * segmento hijo REEMPLAZA `target.openGraph` entero con el suyo. O sea que la
 * ficha de producto ganaría — el fichero habría funcionado.
 *
 * Lo que descarta esa vía es el modo de fallo de al lado: si algún día una página
 * declara `openGraph` **sin** `images` (para cambiar solo el título, por ejemplo),
 * el reemplazo se lleva por delante la imagen del fichero y esa ruta se queda con
 * **cero** `og:image`, sin error y sin aviso. Siendo una ruta normal, la portada
 * es solo una cadena en la configuración y no depende de esa sutileza.
 *
 * ⚠️ **Y no puede vivir en `app/api/`**: `next.config.js` reescribe `/api/:path*`
 * a la API de Render, así que el proxy la taparía.
 *
 * ⭐ El nombre acabado en `.png` no es solo cosmético: el `matcher` de
 * `middleware.ts` excluye `.*\.(?:svg|png|jpg|jpeg|gif|webp)$`, así que esta ruta
 * **no pasa por el middleware**. Hoy da igual —solo redirige `/cuenta` y
 * `/backoffice`—, pero significa que una regla global que se añada mañana no
 * puede dejar sin imagen las tarjetas ya compartidas. Con un nombre como
 * `portada-og` sí entraría.
 */

/**
 * ⚠️ `size` y `contentType` van como constantes locales y NO exportadas.
 *
 * Son convenciones de los ficheros de metadatos de Next (`opengraph-image.tsx`),
 * no de un `route.tsx`: un route handler solo admite exportar sus verbos y unas
 * pocas opciones de segmento, y cualquier otro `export` **rompe el build** con un
 * error de tipos que no menciona la causa («Property 'size' is incompatible with
 * index signature»). Lo cazó `next build`; `tsc --noEmit` a secas no lo ve,
 * porque el tipo lo genera Next en `.next/types/`.
 *
 * El `Content-Type: image/png` lo pone `ImageResponse` por su cuenta.
 */
const TAMANO = { width: 1200, height: 630 };

/**
 * No depende de nada, así que se genera al construir y se sirve desde el CDN.
 * Un `og:image` que se renderiza en cada petición es peso que se paga cada vez
 * que alguien pega el enlace.
 */
export const dynamic = "force-static";

/**
 * La paleta es la de `.theme-cliente` (grises), NO la de `:root` (naranja).
 * La tienda que ve el cliente es la gris; el naranja es del backoffice. Una
 * portada naranja no se parecería a la página que se abre al pulsarla.
 */
const TINTA = "#171717"; // --foreground de .theme-cliente: 0 0% 9%
const SUAVE = "#737373"; // --muted-foreground: 0 0% 45%
const LINEA = "#e5e5e5";

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#ffffff",
          padding: "80px",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 132,
            fontWeight: 700,
            letterSpacing: "-0.04em",
            color: TINTA,
            lineHeight: 1,
          }}
        >
          Valatino
        </div>

        <div
          style={{
            display: "flex",
            width: "220px",
            height: "3px",
            backgroundColor: TINTA,
            marginTop: "36px",
            marginBottom: "36px",
          }}
        />

        <div
          style={{
            display: "flex",
            fontSize: 46,
            color: TINTA,
            textAlign: "center",
            lineHeight: 1.25,
          }}
        >
          Sabores de Latinoamérica en España
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 28,
            color: SUAVE,
            marginTop: "28px",
            textAlign: "center",
          }}
        >
          Productos originales · Envío a toda España
        </div>

        <div
          style={{
            display: "flex",
            position: "absolute",
            bottom: "48px",
            fontSize: 26,
            color: SUAVE,
            borderTop: `1px solid ${LINEA}`,
            paddingTop: "20px",
          }}
        >
          valatino.es
        </div>
      </div>
    ),
    TAMANO,
  );
}
