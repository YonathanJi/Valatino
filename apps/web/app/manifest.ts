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
 * ⚠️⚠️ `display: "browser"` Y NO `"standalone"`, y esto es lo que hay que pensar
 * antes de copiar el manifest de otro sitio. En `standalone` la tienda se abriría
 * **sin barra de direcciones**, y aquí eso sería un problema de verdad y no de
 * estética: se cobra con tarjeta. Quien paga tiene que poder ver el candado y el
 * dominio `valatino.es` en la barra antes de teclear su tarjeta, y Stripe redirige
 * a la pasarela y vuelve. Esconder la barra en una tienda es quitarle al cliente
 * la única señal con la que comprueba dónde está.
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
    display: "browser",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    lang: "es-ES",
    icons: [
      /**
       * Los dos tamaños que pide Android, y `purpose` en cada uno a propósito:
       * `maskable` deja que el sistema recorte el icono a la forma del lanzador
       * (círculo, cuadrado redondeado…) y por eso la marca se genera con margen
       * —ver `scripts/generar-marca.mjs`—; sin margen, un recorte circular se
       * comería las puntas de la V.
       */
      { src: "/icono-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icono-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
