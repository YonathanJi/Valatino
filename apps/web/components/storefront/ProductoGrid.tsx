import { ListaProductos } from "./ListaProductos";
import { pedirCatalogo, PLAZO_PAGINA_MS } from "@lib/productos/catalogo";

/**
 * El catálogo de la portada.
 *
 * ⚠️⚠️ PIDE EL CATÁLOGO POR `pedirCatalogo` DESDE EL 12/09, y el cambio arregla dos
 * cosas de golpe:
 *
 * **1. «No pude preguntar» dejaba de distinguirse de «no hay productos».** Antes esto
 * hacía `catch { return [] }` y pintaba «No hay productos disponibles en este
 * momento» — que con la API dormida es **mentira**, y de las que cuestan dinero:
 * alguien que llega desde Google ve una tienda vacía y se va. Es la misma avería que
 * dejó el sitemap con 5 URLs el 27/08 y las páginas legales en blanco en agosto, aquí
 * en la página más visitada. Ahora son **tres estados y no dos**, como en el panel de
 * favoritos.
 *
 * **2. Pedía `?limit=50` sin paginar.** La API recorta a 50 y no avisa: con 29
 * productos no se nota, y **a 51 la portada empezaría a esconder catálogo en
 * silencio**. `pedirCatalogo` pagina contra el `total` que declara la propia API.
 *
 * ⭐ Y de propina: la portada ahora comparte la petición con el bloque de categorías,
 * porque los dos piden lo mismo con la misma caché. Antes habrían sido dos llamadas
 * para los mismos productos.
 */
export async function ProductoGrid() {
  const catalogo = await pedirCatalogo({ plazoMs: PLAZO_PAGINA_MS });

  /**
   * ⚠️ `null` es «no se pudo preguntar», y eso NO se dice como «no hay nada». El
   * mensaje tiene que dejar claro que es un problema pasajero y nuestro, no que la
   * tienda esté vacía.
   */
  if (catalogo === null) {
    return (
      <p className="text-center text-muted-foreground py-12">
        No hemos podido cargar el catálogo ahora mismo. Vuelve a intentarlo en unos
        segundos.
      </p>
    );
  }

  const activos = catalogo.productos.filter((p) => p.activo);

  // Y esto sí es «preguntamos y no hay», que es otra cosa y se dice distinto.
  if (activos.length === 0) {
    return (
      <p className="text-center text-muted-foreground py-12">
        No hay productos disponibles en este momento.
      </p>
    );
  }

  return <ListaProductos productos={activos} />;
}
