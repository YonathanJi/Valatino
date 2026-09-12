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
 * ⚠️ El estilo NO es el del selector de presentaciones de la ficha —que usa borde y
 * `border-2 border-primary`— aunque el gesto sea parecido, y conviene saber por qué:
 * aquí Jonathan puso un ejemplo delante (New Balance) y pidió chips de fondo gris sin
 * borde. Cuando hay una referencia concreta, gana la referencia. Si algún día se
 * unifican los dos, que sea una decisión y no un despiste.
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
   *
   * ⭐⭐ CRECEN EN PANTALLA GRANDE, Y ESA ES LA FORMA CORRECTA DE RESOLVERLO. El
   * tamaño pequeño del móvil no es una preferencia estética: es lo que hace que los
   * cinco quepan sin tener que deslizar demasiado en 375 px. Pero en un escritorio
   * sobran seiscientos píxeles y ahí el mismo chip se ve diminuto y cuesta acertarle.
   *
   * Dos tamaños, entonces, y **no uno intermedio que quede regular en los dos**:
   *
   *   · hasta 640 px → `text-sm` con `px-4 py-2`  (~470 px la tira)
   *   · de 640 en adelante → `text-base` con `px-5 py-2.5`  (~552 px: cabe
   *     centrada en 640, así que el salto nunca provoca desbordamiento)
   *
   * ⚠️ El breakpoint es `sm` (640 px) y no `md` a propósito: a 640 ya hay espacio
   * para la versión grande, y esperar a 768 dejaría las tablets pequeñas con el
   * tamaño de móvil sin necesitarlo.
   *
   * ⚠️⚠️ ESTOS SON LOS SEGUNDOS TAMAÑOS, y lo que costó subirlos queda dicho: con el
   * primer intento (`text-xs` / `text-sm`) Jonathan dijo que los chips «quedan como
   * perdidos en pc y en móvil». **El precio de subirlos lo paga el móvil**: antes la
   * tira cabía entera en pantallas de 414 px y ahora se desliza también ahí. Se acepta
   * a sabiendas —la fila está hecha para deslizarse y un chip que no se ve no sirve de
   * nada—, pero si algún día alguien los vuelve a encoger «para que quepan», que sepa
   * que ese camino ya se anduvo y se volvió.
   */
  const chip = (texto: string, href: string, activo: boolean) =>
    activo ? (
      <span
        aria-current="page"
        className="inline-flex items-center whitespace-nowrap rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background sm:px-5 sm:py-2.5 sm:text-base"
      >
        {texto}
      </span>
    ) : (
      <Link
        href={href}
        className="inline-flex items-center whitespace-nowrap rounded-lg bg-muted px-4 py-2 text-sm text-foreground transition-colors hover:bg-muted/70 sm:px-5 sm:py-2.5 sm:text-base"
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
     * de hoy —Todas, Bebidas, Despensa, Dulces, Galletas— la tira mide unos 395 px al
     * tamaño de móvil, y un móvil de 375 px deja 343 útiles: **no caben**. Y aunque se
     * forzara, la siguiente categoría que se añada lo rompe otra vez. Encoger más
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
      <ul className="mx-auto flex w-max gap-2 px-4 pb-2 sm:gap-3">
        {/* «Todas» es quitar el filtro, así que lleva a la portada. */}
        <li>{chip("Todas", "/", !activa)}</li>
        {categorias.map((c) => (
          <li key={c.slug}>{chip(c.nombre, rutaDeCategoria(c.slug), activa === c.slug)}</li>
        ))}
      </ul>
    </nav>
  );
}
