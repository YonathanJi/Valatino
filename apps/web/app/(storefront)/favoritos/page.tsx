import { FavoritosPanel } from "@components/storefront/FavoritosPanel";

/**
 * Los productos que alguien ha guardado.
 *
 * ⚠️ La página es de SERVIDOR y el contenido de CLIENTE, y esa partición es
 * obligatoria: los favoritos viven en `localStorage`, así que el panel tiene que
 * llevar `"use client"` — y de un módulo con `"use client"` no se puede exportar
 * `metadata`. Es el mismo reparto que usan los paneles del backoffice.
 *
 * ⚠️⚠️ ESTA RUTA ESTÁ CERRADA AL RASTREO en `RUTAS_CERRADAS`
 * (`@lib/seo/mapa-del-sitio`), que es la lista que comparten `robots.txt` y el mapa
 * del sitio. Es distinta para cada visitante y no hay nada que indexar; anunciarla
 * gastaría presupuesto de rastreo en una página que para Google siempre estaría
 * vacía. Se cierra ahí y no aquí para que las dos cosas no puedan discrepar.
 */
export const metadata = {
  title: "Favoritos",
  description: "Los productos que has guardado en Valatino.",
};

export default function FavoritosPage() {
  return <FavoritosPanel />;
}
