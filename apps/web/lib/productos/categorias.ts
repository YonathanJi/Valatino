import type { Producto } from "@valatino/types";

/**
 * Las categorías del catálogo, y las páginas que las hacen encontrables.
 *
 * ── POR QUÉ EXISTE ESTO, Y EL DATO QUE LO PIDIÓ ──
 *
 * La auditoría SEO del 09/09 lo puso como P2: las categorías existían en la base
 * —cada producto tiene la suya— pero **no tenían página**, así que la portada era el
 * único listado de catálogo y la tienda solo podía salir por marca o por producto
 * exacto.
 *
 * ⚠️⚠️ El 12/09 Search Console lo convirtió de recomendación en diagnóstico, y el
 * motivo de fondo NO es el que parecía. Los números:
 *
 *   · 34 URLs en el sitemap, **21 indexadas y 13 no**.
 *   · Las 13 con el mismo estado: «Descubierta: actualmente sin indexar», y
 *     **último rastreo N/D** — o sea que Google **no ha ido nunca** a verlas.
 *   · Entre ellas, `/productos/nucita`. Y «nucita» es la segunda consulta con más
 *     impresiones de la tienda.
 *
 * ⭐ Se comprobó que no era culpa del código: los `canonical` de esas fichas apuntan
 * a sí mismos y ninguna lleva `noindex`. Lo que falta es **presupuesto de rastreo**,
 * y eso se gana con enlaces — los de fuera (la bio de Instagram, ya puesta) y **los
 * de dentro**, que son estos.
 *
 * Hoy `chocolate-corona` solo está enlazada desde la portada, perdida entre 29
 * tarjetas. Una página `/categorias/despensa` que enlace a sus cuatro productos le da
 * a Google un camino corto y una señal de que esa ficha importa. **Ese es el motivo
 * principal de este fichero; el contenido para búsquedas genéricas es el segundo.**
 *
 * ── DÓNDE VIVE CADA COSA ──
 *
 * ⚠️ La categoría de un producto es un **dato de la base** (`productos.categoria`) y
 * de ahí salen la lista, los slugs y el reparto. Lo único que está escrito en código
 * es la **prosa** de cada una, y eso es una decisión con fecha de caducidad: el día
 * que haya que retocarlas a menudo, se mueven a una tabla con su pantalla en el
 * panel, como se hizo con los datos del negocio. Cuatro párrafos no justifican una
 * migración todavía.
 */

/**
 * El nombre de una categoría, convertido en algo que cabe en una URL.
 *
 * ⚠️ Quita los acentos por descomposición Unicode en vez de con una tabla de
 * reemplazos: así «Café» y «Piñata» funcionan sin tener que acordarse de añadirles
 * una entrada. Lo que NO hace es transliterar nada que no sea un acento — una
 * categoría en cirílico daría un slug vacío, y por eso `categoriasDe` descarta las
 * que se quedan sin slug en vez de servir `/categorias/`.
 */
export function slugDeCategoria(nombre: string): string {
  return nombre
    .normalize("NFD")
    /**
     * Las marcas diacríticas combinantes: lo que queda suelto al descomponer «á»
     * en «a» + tilde.
     *
     * ⚠️⚠️ LOS DOS EXTREMOS DEL RANGO SON CARACTERES INVISIBLES. En el editor esta
     * línea parece `[-]` con algo raro en medio, y borrarlos «limpiando» no da
     * ningún error: simplemente deja de quitar acentos, y «Café» pasaría a tener
     * slug `caf-` en vez de `cafe` — una URL distinta para la misma categoría, que
     * en producción es un 404 y una página que desaparece del sitio.
     *
     * ⭐ Por eso lo que protege esto NO es este comentario, sino el test
     * «respeta los acentos» de `categorias.spec.ts`, que pasa «Café» y «Piñata» y
     * exige `cafe` y `pinata`. Un comentario avisa; un test impide.
     */
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Una categoría con lo que hay dentro. */
export interface Categoria {
  /** Tal y como está escrita en la base. Es lo que se enseña. */
  nombre: string;
  slug: string;
  productos: Producto[];
}

/**
 * Las categorías que hay en un catálogo, con sus productos.
 *
 * ⚠️ **Solo los activos**, igual que el mapa del sitio: ofrecerle al buscador una
 * categoría que se llena de artículos que no se pueden comprar es invitar a una
 * visita que acaba en nada.
 *
 * ⭐ ORDEN ALFABÉTICO, y es una decisión: lo natural era ordenar por número de
 * productos, pero entonces **la navegación de la tienda se reordenaría sola cada vez
 * que entrara o se agotara stock**. Un menú que cambia de orden sin que nadie lo
 * toque es un menú en el que no se puede coger la costumbre de mirar al mismo sitio.
 * Alfabético es estable y predecible.
 *
 * ⚠️ Si dos nombres distintos dieran el mismo slug («Café» y «Cafe»), aquí saldrían
 * como dos categorías y `categoriaPorSlug` devolvería la primera. Es un error de
 * datos, no un caso que valga la pena modelar — pero queda dicho para que, si algún
 * día una categoría «desaparece» de la tienda, se mire aquí.
 */
export function categoriasDe(productos: Producto[]): Categoria[] {
  const porNombre = new Map<string, Producto[]>();

  for (const p of productos) {
    if (!p.activo) continue;
    const nombre = p.categoria?.trim();
    if (!nombre) continue;

    const ya = porNombre.get(nombre);
    if (ya) ya.push(p);
    else porNombre.set(nombre, [p]);
  }

  return [...porNombre.entries()]
    .map(([nombre, productos]) => ({ nombre, slug: slugDeCategoria(nombre), productos }))
    // Una categoría sin slug no tiene URL posible. Ver la nota de `slugDeCategoria`.
    .filter((c) => c.slug !== "")
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/** La categoría de un slug, o `null` si ese slug no corresponde a ninguna. */
export function categoriaPorSlug(productos: Producto[], slug: string): Categoria | null {
  return categoriasDe(productos).find((c) => c.slug === slug) ?? null;
}

/**
 * La prosa de cada categoría, escrita a mano. **Desde el 12/09 no se pinta en la
 * página**: es lo que va a la `<meta name="description">`, o sea el párrafo que Google
 * enseña en los resultados. Ver `textoEscritoDe`.
 *
 * ⚠️⚠️ SE ESCRIBE UNA POR UNA Y MENCIONA PRODUCTOS DE VERDAD, que es justo lo que
 * pedía la auditoría: «evitar párrafos genéricos repetidos». Un texto que sirva igual
 * para las cuatro categorías no le dice nada a nadie —ni a un cliente ni a Google— y
 * además es el tipo de relleno que Google sabe reconocer.
 *
 * ⚠️ La contrapartida de nombrar productos es que **el texto envejece con el
 * catálogo**: si mañana se deja de vender Bon Bon Bum, este párrafo miente. Al
 * retirar una familia entera, mirar aquí.
 */
const TEXTOS: Record<string, string> = {
  dulces:
    "Chocolatinas, bombones y caramelos colombianos de los de siempre: Nucita, Bon Bon Bum, " +
    "Sparkies y Quipitos Pops. Casi todos se pueden pedir sueltos o por caja para compartir.",
  bebidas:
    "Pony Malta y Jugos Hit, en lata y en botella de vidrio. Los néctares vienen en cuatro " +
    "sabores —mango, lulo, mora y tropical— y la malta, suelta o por caja.",
  galletas:
    "Las galletas que acompañan el café en Colombia: Festival en cuatro sabores, Ducales y " +
    "Saltín de Noel, y los Tostados la Gitana.",
  despensa:
    "Para el desayuno y para tener en casa: Colcafé, Milo, Chocolate Corona y las rosquillas " +
    "caleñas. Lo que no se encuentra en el supermercado de aquí.",
};

/**
 * El texto escrito a mano de una categoría, si lo tiene.
 *
 * ⚠️⚠️ SE LLAMABA `introduccionDe` Y SE PINTABA BAJO EL TÍTULO. Jonathan lo quitó de
 * la pantalla el 12/09 —«quita el texto de cada categoría, no me gusta»— y el nombre
 * se cambió con él: un `introduccionDe` que ya no introduce nada en ninguna página
 * sería un nombre mintiendo, que es la piedra con la que este proyecto lleva
 * tropezando.
 *
 * ⭐ El texto **no se borró**, se quedó donde de verdad sirve: es lo que
 * `descripcionDeCategoria` pone en la `<meta name="description">`, o sea el párrafo
 * que Google enseña bajo el título en los resultados. Ahí no molesta a nadie y sigue
 * siendo mejor que un recuento automático. Si algún día se vuelve a querer en
 * pantalla, está escrito y listo.
 *
 * ⭐ Devuelve `undefined` en vez de un texto de relleno, que es la misma regla que
 * `descripcionPropia` en `lib/seo/metadatos`. Hay un test que lo fija, para que nadie
 * lo «arregle» con un párrafo por defecto.
 */
export function textoEscritoDe(slug: string): string | undefined {
  return TEXTOS[slug];
}

/**
 * Lo que se le cuenta al buscador de una categoría, en la meta description.
 *
 * ⚠️ Aquí SÍ se genera texto cuando no hay uno escrito, y no se contradice con la
 * nota de arriba: **una página sin meta description no tiene nada que enseñar en los
 * resultados de Google**, así que callarse cuesta algo. Y lo generado no es genérico:
 * lleva el nombre de la categoría y cuántos artículos tiene, que es información.
 */
export function descripcionDeCategoria(categoria: Categoria): string {
  const escrita = textoEscritoDe(categoria.slug);
  if (escrita) return escrita;

  /**
   * ⚠️ La frase entera cambia con el número, no solo el sustantivo. La primera
   * versión solo ponía «producto/productos» y dejaba el resto en plural: «1 producto
   * latinoamericanos originales, enviados…». Lo cazó el test, que es lo que tienen
   * que hacer los tests — y es un recordatorio de que en castellano concuerda todo,
   * no solo la palabra que se está contando.
   */
  const n = categoria.productos.length;
  return n === 1
    ? `${categoria.nombre}: 1 producto latinoamericano original, enviado a toda España.`
    : `${categoria.nombre}: ${n} productos latinoamericanos originales, enviados a toda España.`;
}

/**
 * Un nombre presentable a partir del slug, para cuando **no se pudo pedir el
 * catálogo** y aun así hay que pintar la página.
 *
 * ⚠️⚠️ ES UNA APROXIMACIÓN Y SOLO VALE PARA ESO. No sabe de acentos —`cafe` da
 * «Cafe» y no «Café»— porque el acento se perdió al hacer el slug y de ahí no vuelve.
 * Se usa únicamente en el estado degradado de cinco minutos que dura hasta la
 * siguiente revalidación; **el nombre de verdad sale siempre de la base**.
 *
 * La alternativa era dar 404 cuando la API no contesta, y eso es peor: Next cachearía
 * ese 404 y una categoría real quedaría muerta.
 */
export function nombreProbableDe(slug: string): string {
  const palabras = slug.replace(/-/g, " ").trim();
  return palabras.charAt(0).toUpperCase() + palabras.slice(1);
}

/** La URL de una categoría dentro de la tienda. */
export function rutaDeCategoria(slug: string): string {
  return `/categorias/${slug}`;
}
