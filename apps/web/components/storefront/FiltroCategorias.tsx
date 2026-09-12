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

  /**
   * ⚠️ El chip activo se pinta como `<span>` y NO como enlace, igual que el selector
   * de la ficha: un enlace a la página en la que ya estás no lleva a ninguna parte, y
   * un lector de pantalla lo anuncia como algo que se puede pulsar. `aria-current`
   * es lo que dice cuál está puesto.
   *
   * ⚠️⚠️ EL ESTILO CAMBIÓ EL 12/09 CON UN EJEMPLO DELANTE: Jonathan pasó una captura
   * de New Balance —chips de fondo gris suave, sin borde, pegados bajo la cabecera— y
   * dijo «así me gustaría». Antes eran píldoras con borde fino debajo del hero, y de
   * paso llevaban el número de productos, que en el ejemplo no está.
   *
   * ⭐ El gris sale del token `--muted` de la tienda (`0 0% 96 %`), que resulta ser
   * casi exactamente el del ejemplo. Y el activo va en negro pleno (`--foreground`)
   * en vez de en gris, porque en el ejemplo **no hay ninguno activo** —son enlaces de
   * navegación, no un filtro— y aquí sí hace falta ver cuál está puesto.
   *
   * ⚠️ `whitespace-nowrap` es lo que impide que «Vuelta al cole» se parta en dos
   * líneas y descuadre la altura de toda la fila. Con una sola fila (ver abajo) es
   * imprescindible, no cosmético.
   */
  const chip = (texto: string, href: string, activo: boolean) =>
    activo ? (
      <span
        aria-current="page"
        className="inline-flex items-center whitespace-nowrap rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background"
      >
        {texto}
      </span>
    ) : (
      <Link
        href={href}
        className="inline-flex items-center whitespace-nowrap rounded-md bg-muted px-3 py-1.5 text-xs text-foreground hover:bg-muted/70 transition-colors"
      >
        {texto}
      </Link>
    );

  return (
    /**
     * ── UNA SOLA FILA, CENTRADA, EN CUALQUIER PANTALLA ──
     *
     * Lo pidió Jonathan el 12/09: «centradas, más pequeñas, que quede solo una fila,
     * ten en cuenta los diferentes dispositivos».
     *
     * ⚠️⚠️ «UNA FILA» Y «MÓVIL» NO SE ARREGLAN SOLO ACHICANDO. Con los cinco nombres
     * de hoy —Todas, Bebidas, Despensa, Dulces, Galletas— hacen falta unos 345 px y
     * un móvil de 375 px deja 343 útiles: **no caben por dos píxeles**. Y aunque se
     * forzara, la quinta categoría que Jonathan añada lo rompe otra vez. Encoger más
     * tampoco vale: por debajo de 12 px el texto deja de leerse y el chip deja de
     * poder tocarse con el dedo.
     *
     * ⭐ Por eso la fila **se desliza** cuando no cabe (`overflow-x-auto` sin
     * `flex-wrap`) y **se centra** cuando sí (`mx-auto` sobre un `w-max`). Es una
     * sola regla que resuelve los dos casos sin `media queries` ni contar píxeles: en
     * escritorio se ve centrada y quieta; en móvil se arrastra con el dedo, que es el
     * gesto que ya espera cualquiera en una tira de categorías.
     *
     * ⚠️ El `w-max` es lo que hace que funcione. Sin él, el `<ul>` ocuparía el ancho
     * del contenedor y `mx-auto` no tendría nada que centrar; con él toma el ancho de
     * su contenido, así que sobra espacio (se centra) o no sobra (se desplaza).
     *
     * ⚠️ Y no se esconde la barra de desplazamiento: cuando aparece es porque hay más
     * categorías fuera de la vista, y esa es justo la pista que necesita quien mira.
     */
    <nav aria-label="Filtrar por categoría" className="overflow-x-auto">
      <ul className="mx-auto flex w-max gap-2 px-4 pb-2">
        {/* «Todas» es quitar el filtro, así que lleva a la portada. */}
        <li>{chip("Todas", "/", !activa)}</li>
        {categorias.map((c) => (
          <li key={c.slug}>{chip(c.nombre, rutaDeCategoria(c.slug), activa === c.slug)}</li>
        ))}
      </ul>
    </nav>
  );
}
