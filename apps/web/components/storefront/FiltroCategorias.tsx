import Link from "next/link";
import { pedirCatalogo, PLAZO_PAGINA_MS } from "@lib/productos/catalogo";
import { categoriasDe, rutaDeCategoria } from "@lib/productos/categorias";

/**
 * La barra de filtro por categoría: la misma en la portada y en cada categoría, con la
 * activa marcada y un «Todas» que lo quita.
 *
 * ⚠️⚠️ ES UN FILTRO A LA VISTA Y SON ENLACES POR DEBAJO, Y ESA ES TODA LA GRACIA.
 * Lo pidió Jonathan el 12/09 —«que se filtre la categoría pero que también pueda
 * quitarlo»— y es mejor UX que la lista de enlaces sueltos que había. Pero un filtro
 * de los de verdad, que cambia lo que se ve **sin cambiar la URL**, habría deshecho
 * el trabajo del que salió esta página: lo que un rastreador sigue es un `href`, no
 * un `onClick`. Con un filtro en JavaScript, las 13 fichas que Google no rastrea
 * seguirían exactamente igual de inalcanzables.
 *
 * ⭐ No hace falta elegir. Cada chip es un `<Link>` a una página **ya generada**, y
 * Next las precarga al pasar el ratón: al pulsar, el cambio es inmediato y se siente
 * como filtrar. El cliente ve un filtro; Google ve cinco URLs. Es lo que hacen las
 * tiendas bien hechas, y el motivo por el que aquí no se usa `useState`.
 *
 * ⚠️ El estilo es **el mismo que el selector de presentaciones de la ficha de
 * producto** (borde, redondeado, el actual con `border-2 border-primary bg-primary/5`)
 * a propósito: es el mismo gesto —elegir una opción entre varias— y que dos sitios de
 * la tienda resuelvan el mismo gesto de dos formas distintas es cómo una tienda
 * empieza a parecer dos.
 */
export async function FiltroCategorias({ activa }: { activa?: string }) {
  const catalogo = await pedirCatalogo({ plazoMs: PLAZO_PAGINA_MS });

  /**
   * ⚠️ Sin catálogo no se sabe qué categorías hay, y aquí lo correcto es no pintar
   * nada: esto es navegación, no el contenido de la página. Un mensaje de error donde
   * se espera un filtro asusta más de lo que informa, y `revalidate` lo repara solo.
   */
  if (!catalogo) return null;

  const categorias = categoriasDe(catalogo.productos);
  if (categorias.length === 0) return null;

  const total = categorias.reduce((n, c) => n + c.productos.length, 0);

  /**
   * ⚠️ El chip activo se pinta como `<span>` y NO como enlace, igual que el selector
   * de la ficha: un enlace a la página en la que ya estás no lleva a ninguna parte, y
   * un lector de pantalla lo anuncia como algo que se puede pulsar. `aria-current`
   * es lo que dice cuál está puesto.
   */
  const chip = (texto: string, cuantos: number, href: string, activo: boolean) =>
    activo ? (
      <span
        aria-current="page"
        className="inline-flex items-center gap-2 rounded-full border-2 border-primary bg-primary/5 px-4 py-1.5 text-sm font-medium"
      >
        {texto}
        <span className="text-xs text-muted-foreground">{cuantos}</span>
      </span>
    ) : (
      <Link
        href={href}
        className="inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm hover:border-primary hover:text-primary transition-colors"
      >
        {texto}
        <span className="text-xs text-muted-foreground">{cuantos}</span>
      </Link>
    );

  return (
    <nav aria-label="Filtrar por categoría" className="max-w-7xl mx-auto px-4 pt-8">
      <ul className="flex flex-wrap gap-2">
        {/* «Todas» es quitar el filtro, así que lleva a la portada. */}
        <li>{chip("Todas", total, "/", !activa)}</li>
        {categorias.map((c) => (
          <li key={c.slug}>
            {chip(c.nombre, c.productos.length, rutaDeCategoria(c.slug), activa === c.slug)}
          </li>
        ))}
      </ul>
    </nav>
  );
}
