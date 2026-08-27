import type { MetadataRoute } from "next";
import { SITIO } from "@lib/seo/metadatos";
import { RUTAS_CERRADAS } from "@lib/seo/mapa-del-sitio";

/**
 * El `robots.txt` de la tienda, que **hasta hoy devolvía un 404**.
 *
 * ⚠️ Un `robots.txt` ausente no bloquea la indexación —Google lo interpreta como
 * «adelante con todo»— así que no era la causa de no salir en las búsquedas. Lo que
 * sí hacía es dejar el mapa del sitio sin anunciar, que es la vía por la que un
 * buscador descubre las fichas de producto sin tener que rastrear enlace a enlace.
 *
 * ⚠️⚠️ Y LO QUE DE VERDAD IMPORTA AQUÍ ES LO QUE SE CIERRA. Sin este fichero, un
 * rastreador podía entrar en `/carrito`, `/checkout` y `/cuenta` y gastarse ahí el
 * presupuesto de rastreo — páginas que no sirven a nadie que busque, que cambian en
 * cada visita y que en el caso del checkout crean una sesión y una reserva de stock
 * por cada entrada.
 *
 * `/backoffice` va también, aunque ya esté cerrado por sesión: el middleware
 * responde 307 al login, y un 307 repetido mil veces sigue siendo trabajo. Cerrarlo
 * aquí es decir la verdad antes de que pregunten.
 *
 * ⚠️ `/api/` NO se cierra por seguridad —eso lo hacen las políticas RLS y los
 * guards, no un fichero de texto que cualquiera lee— sino porque son respuestas JSON
 * que no tienen nada que indexar.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        /**
         * ⚠️⚠️ LA LISTA NO SE ESCRIBE AQUÍ: viene de `@lib/seo/mapa-del-sitio`,
         * que es el mismo sitio del que la lee el mapa para NO anunciarlas.
         * Prohibir aquí una ruta y ofrecerla allí es contradecirse, y Search
         * Console lo marca como aviso. Antes eran dos listas: esta, y un
         * comentario en prosa dentro de `sitemap.ts`.
         */
        disallow: [...RUTAS_CERRADAS],
      },
    ],
    sitemap: `${SITIO}/sitemap.xml`,
    host: SITIO,
  };
}
