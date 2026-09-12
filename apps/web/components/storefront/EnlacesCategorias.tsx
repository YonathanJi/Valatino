import Link from "next/link";
import { pedirCatalogo, PLAZO_PAGINA_MS } from "@lib/productos/catalogo";
import { categoriasDe, rutaDeCategoria } from "@lib/productos/categorias";

/**
 * Los enlaces a las categorías, para la portada.
 *
 * ⚠️⚠️ ESTO NO ES DECORACIÓN, ES LA MITAD DEL ARREGLO. Las páginas de categoría
 * existen para dar caminos internos cortos hasta las fichas —el 12/09 Search Console
 * dijo que Google tenía **13 de 34 URLs sin rastrear siquiera**— y una página a la que
 * nadie enlaza no da ningún camino. Estos enlaces son lo que conecta la raíz del sitio
 * con las categorías, y las categorías con las fichas.
 *
 * ⭐ Enlaces HTML de verdad (`<Link>` pinta un `<a href>`), no un desplegable ni un
 * filtro en JavaScript: lo que un rastreador sigue es un `href`. Un filtro de catálogo
 * que cambia la vista sin cambiar la URL no crea ningún camino nuevo, que es el error
 * clásico al «añadir categorías» a una tienda.
 *
 * ⚠️ Comparte la petición del catálogo con `ProductoGrid` —los dos llaman a
 * `pedirCatalogo`, misma URL y misma caché—, así que ponerlo en la portada no cuesta
 * una llamada más.
 */
export async function EnlacesCategorias() {
  const catalogo = await pedirCatalogo({ plazoMs: PLAZO_PAGINA_MS });

  /**
   * ⚠️ Sin catálogo no se sabe qué categorías hay, y aquí lo correcto es **no pintar
   * nada**: a diferencia del listado de productos, que es el contenido de la página y
   * su ausencia hay que explicarla, esto es navegación secundaria. Un bloque con un
   * mensaje de error encima del catálogo asusta más de lo que informa.
   */
  if (!catalogo) return null;

  const categorias = categoriasDe(catalogo.productos);
  if (categorias.length === 0) return null;

  return (
    <nav aria-label="Categorías" className="max-w-7xl mx-auto px-4 pt-8">
      <h2 className="text-sm font-medium text-muted-foreground mb-3">Por categoría</h2>
      <ul className="flex flex-wrap gap-2">
        {categorias.map((c) => (
          <li key={c.slug}>
            <Link
              href={rutaDeCategoria(c.slug)}
              className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm hover:border-primary hover:text-primary transition-colors"
            >
              {c.nombre}
              <span className="text-muted-foreground text-xs">{c.productos.length}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
