import type { MetadataRoute } from "next";
import { SITIO_NOMBRE, TITULO, DESCRIPCION } from "@lib/seo/metadatos";

/**
 * El `manifest.webmanifest` de la tienda, que **hasta hoy devolvía un 404**
 * (medido el 11/09 contra producción, igual que `/favicon.ico`).
 *
 * ── QUÉ RESUELVE, Y QUÉ NO ──
 *
 * ⚠️ **No es SEO.** Google no posiciona mejor por tener un manifest, y decirlo de
 * otra forma sería vender humo: la auditoría del 09/09 lo pone en P3 con razón. Lo
 * que resuelve es *presentación de marca*, y se ve en dos sitios concretos:
 *
 *   · Si alguien añade la tienda a la pantalla de inicio del móvil —el gesto que
 *     hace un cliente que vuelve—, hasta hoy se le guardaba con una captura de la
 *     página como icono y con la URL como nombre. Ahora se guarda «Valatino» con
 *     su marca.
 *   · La barra del navegador en Android toma el `theme_color`.
 *
 * ⚠️⚠️ `display: "minimal-ui"`, Y LAS TRES OPCIONES IMPORTAN AQUÍ:
 *
 *   · `standalone` abriría la tienda **sin barra de direcciones**, y aquí eso es un
 *     problema de verdad y no de estética: **se cobra con tarjeta**. Quien paga
 *     tiene que poder ver el candado y el dominio `valatino.es` antes de teclearla,
 *     y encima Stripe redirige a su pasarela y vuelve. Esconder la barra en una
 *     tienda es quitarle al cliente la única señal con la que comprueba dónde está.
 *   · `browser` conserva la barra, pero **deja la tienda sin poder instalarse**:
 *     Chrome solo ofrece «añadir a la pantalla de inicio» con `standalone`,
 *     `fullscreen` o `minimal-ui`. Era el valor inicial y era peor de lo que
 *     parecía — renunciaba al icono en el móvil del cliente que vuelve, que es
 *     justo para lo que sirve tener un manifest.
 *   · `minimal-ui` da las dos cosas: se instala **y** mantiene los controles
 *     mínimos de navegación, la URL entre ellos.
 *
 * Los nombres y la descripción salen de `@lib/seo/metadatos`, que ya es el único
 * sitio donde vive el título de la tienda. Escribirlos aquí otra vez es la piedra
 * con la que este proyecto lleva tropezando.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: TITULO,
    /** Lo que cabe debajo del icono en la pantalla de inicio: doce caracteres. */
    short_name: SITIO_NOMBRE,
    description: DESCRIPCION,
    start_url: "/",
    display: "minimal-ui",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    lang: "es-ES",
    /**
     * ⚠️⚠️ EL `maskable` ES UN FICHERO DISTINTO, NO EL MISMO CON OTRA ETIQUETA, y
     * esto estuvo mal escrito y a punto de desplegarse: el 192 se declaraba
     * `maskable` razonando que «la marca se genera con margen». Al medirlo, **los
     * cinco vértices exteriores caían fuera de la zona segura** —el círculo del
     * 80 %— y el más lejano a radio 58 de 40. O sea que se le estaba pidiendo a
     * Android que recortara las puntas de la V, que es justo lo que ese comentario
     * decía querer evitar. Era una racionalización, no una medición.
     *
     * Ahora el `maskable` lleva la marca al 65 % y los `any` la llevan a tamaño
     * completo. Son dos usos con dos requisitos: en el icono normal el 65 %
     * dejaría la marca nadando en blanco, y en el recortado el 100 % se pierde las
     * esquinas. Los tres salen del mismo generador.
     */
    icons: [
      { src: "/icono-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icono-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icono-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
