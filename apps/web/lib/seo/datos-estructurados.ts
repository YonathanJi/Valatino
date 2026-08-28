import type { IdentidadPublica, Producto } from "@valatino/types";
import { miniaturaDe } from "@lib/productos/variantes";
import {
  SITIO,
  SITIO_NOMBRE,
  DESCRIPCION,
  urlAbsoluta,
  ogImagenDeFoto,
} from "./metadatos";

/**
 * Los datos estructurados (JSON-LD de schema.org) de la tienda.
 *
 * ── QUÉ RESUELVE ESTO Y QUÉ NO, PORQUE ES FÁCIL ESPERAR DE MÁS ──
 *
 * Un buscador entiende el HTML de la tienda; lo que NO puede deducir de él es que
 * «Valatino» sea una entidad —un comercio con un nombre, un domicilio y una forma de
 * contacto— y no una palabra que aparece en una página. Eso es exactamente lo que
 * declara el `Organization` de aquí abajo, y es lo que más ayuda cuando alguien busca
 * el nombre de la marca a secas.
 *
 * ⚠️ **No es un interruptor.** No mete el sitio en el índice ni sube posiciones por sí
 * solo: le da a Google el nombre en un formato que no admite interpretación. Con un
 * nombre a una letra de una marca mundial —Valentino— eso es justo lo que hace falta,
 * pero sigue haciendo falta que el sitio esté indexado y que haya quien lo enlace.
 *
 * ⚠️⚠️ **Y AQUÍ NO SE LLAMA A LA API. NUNCA.** Estas funciones son puras: reciben lo
 * que necesitan y devuelven un objeto. El motivo está escrito con sangre en el layout
 * del storefront: el primer intento de pintar la identidad en el pie llamaba a
 * `/tienda/identidad` desde un layout, o sea 38 veces al construir el sitio, y **rompió
 * el build entero** con la API dormida. Por eso hay dos versiones del comercio: la de
 * constantes, que puede ir en cualquier parte, y la que recibe la identidad, que solo
 * se usa donde ya se estaba llamando a la API de todos modos.
 *
 * ⚠️ Vive en `lib/` y no dentro del JSX por lo mismo que `metadatos.ts`: la web no
 * tiene tests de componentes, así que una regla en un `export const` es una regla sin
 * red. Y estas fallan en silencio — no rompen la página, solo dejan de decirle al
 * buscador quién vende.
 */

/** Lo que se pinta dentro del `<script type="application/ld+json">`. */
export type JsonLd = Record<string, unknown>;

/**
 * Quién vende, con lo que se sabe sin preguntarle a nadie.
 *
 * `OnlineStore` y no `Organization` a secas: es un subtipo de schema.org y dice algo
 * más concreto —que aquí se vende— sin perder nada de lo que entiende un buscador.
 */
/**
 * Los perfiles públicos de la tienda, confirmados por Jonathan.
 *
 * ⭐ Para qué sirve `sameAs`: le dice al buscador que esas cuentas son ESTA entidad.
 * Aquí importa más de lo normal, porque «Valatino» está a una letra de Valentino y
 * tiene homónimos con presencia real —un caballo de carreras, un perfil de Facebook,
 * un artista en SoundCloud—. Sin esto, Google puede repartir la identidad de la marca
 * entre varios; con esto, sabe cuál es la tienda.
 *
 * ⚠️⚠️ Y LO QUE `sameAs` **NO** HACE, porque es la confusión fácil: **no crea ningún
 * enlace hacia la tienda.** Solo declara identidad. Lo que le da a Google un camino
 * para llegar es el **enlace en la biografía del perfil**, y eso se pone en Instagram,
 * no aquí. El diagnóstico del 26/08 fue «Página de referencia: NINGUNA» —cero enlaces
 * entrantes— y eso lo arregla la bio, no esta línea. Las dos cosas hacen falta y no
 * son sustitutas.
 *
 * ⚠️ Solo perfiles CONFIRMADOS como de la tienda. Declarar como propia una cuenta que
 * no lo es le apunta la identidad de la marca a otro sitio, que es peor que no decir
 * nada. TikTok todavía no está confirmado, así que no está.
 */
const PERFILES = ["https://www.instagram.com/valatino.es/"];

export function comercio(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "OnlineStore",
    // El `@id` es lo que permite que las demás fichas se cuelguen de ESTA entidad en
    // vez de declarar cada una su propio comercio suelto.
    "@id": `${SITIO}/#comercio`,
    name: SITIO_NOMBRE,
    url: SITIO,
    description: DESCRIPCION,
    image: urlAbsoluta("/portada.png"),
    logo: urlAbsoluta("/portada.png"),
    // Quién es la tienda en las redes. Ver la nota de `PERFILES`: esto declara
    // identidad, no enlaza. `comercioConIdentidad` lo hereda porque parte de aquí.
    sameAs: PERFILES,
    // Se vende a toda España, que es lo que prometen los términos.
    areaServed: { "@type": "Country", name: "España" },
    currenciesAccepted: "EUR",
  };
}

/**
 * El sitio como tal, colgado del comercio.
 *
 * ⚠️ **Sin `SearchAction`**, y es deliberado: esa propiedad le dice a Google que hay
 * un buscador interno al que puede mandar consultas, y la tienda **no tiene buscador**
 * (comprobado: no hay ninguna ruta de búsqueda). Declararla apuntando a una URL que
 * no existe es prometer algo que da un 404.
 */
export function sitioWeb(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITIO}/#sitio`,
    name: SITIO_NOMBRE,
    url: SITIO,
    inLanguage: "es-ES",
    publisher: { "@id": `${SITIO}/#comercio` },
  };
}

/**
 * El comercio con su domicilio y su forma de contacto, para la página que YA tiene
 * esos datos a mano.
 *
 * ⚠️ Cada campo se incluye **solo si existe**. Un `postalAddress` a medias —con el
 * país y nada más— es peor que no ponerlo: el buscador se queda con una dirección que
 * no lleva a ningún sitio, y la tienda ya vive con que la identidad puede venir vacía
 * si la API no contestó (ver `getIdentidad`).
 */
export function comercioConIdentidad(identidad: IdentidadPublica): JsonLd {
  const base = comercio();

  const direccion: JsonLd = {};
  if (identidad.direccion) direccion.streetAddress = identidad.direccion;
  if (identidad.ciudad) direccion.addressLocality = identidad.ciudad;
  if (identidad.provincia) direccion.addressRegion = identidad.provincia;
  if (identidad.codigo_postal) direccion.postalCode = identidad.codigo_postal;
  if (identidad.pais) direccion.addressCountry = identidad.pais;

  return {
    ...base,
    // El nombre legal es el que firma las facturas; el comercial sigue siendo Valatino.
    ...(identidad.nombre ? { legalName: identidad.nombre } : {}),
    ...(identidad.nif ? { taxID: identidad.nif } : {}),
    ...(identidad.email ? { email: identidad.email } : {}),
    ...(identidad.telefono ? { telephone: identidad.telefono } : {}),
    ...(Object.keys(direccion).length > 0
      ? { address: { "@type": "PostalAddress", ...direccion } }
      : {}),
  };
}

/**
 * Una ficha de producto.
 *
 * ⚠️⚠️ EL PRECIO Y LA DISPONIBILIDAD TIENEN QUE SER LOS DE VERDAD, y esto no es un
 * consejo de estilo: si el buscador enseña un precio y la tienda cobra otro, Google
 * retira los resultados enriquecidos del sitio entero. Salen del mismo `Producto` que
 * pinta la página, así que no pueden discrepar.
 *
 * `priceCurrency` en EUR y `price` sin formatear: el JSON-LD quiere el número, no
 * «4,50 €». `formatEUR` es para las personas.
 */
export function productoJsonLd(p: Producto): JsonLd {
  const hayStock = Number(p.stock_disponible ?? 0) > 0;

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.nombre,
    description: p.descripcion?.trim() || undefined,
    image: ogImagenDeFoto(miniaturaDe(p)),
    url: `${SITIO}/productos/${p.slug ?? p.id}`,
    ...(p.categoria ? { category: p.categoria } : {}),
    offers: {
      "@type": "Offer",
      price: Number(p.precio),
      priceCurrency: "EUR",
      // El PVP del catálogo lleva el IVA dentro, y decirlo evita que se lea como base.
      valueAddedTaxIncluded: true,
      availability: hayStock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      url: `${SITIO}/productos/${p.slug ?? p.id}`,
      seller: { "@id": `${SITIO}/#comercio` },
    },
  };
}

/**
 * El rastro de migas de una ficha: portada → producto.
 *
 * Es lo que hace que en los resultados salga «valatino.es › Nucita» en vez de la URL
 * pelada. No hay página de categoría todavía, así que son dos niveles y no tres —
 * inventar uno que no existe daría un enlace roto en el resultado.
 */
export function migasDeProducto(p: Producto): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Inicio", item: SITIO },
      {
        "@type": "ListItem",
        position: 2,
        name: p.nombre,
        item: `${SITIO}/productos/${p.slug ?? p.id}`,
      },
    ],
  };
}
