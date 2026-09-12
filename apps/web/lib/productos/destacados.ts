import type { ItemCatalogo } from "./variantes";

/**
 * El reparto del catálogo cuando hay productos destacados: cada tantas tarjetas
 * normales, una que ocupa el ancho entero.
 *
 * ── DE DÓNDE SALE ──
 *
 * Lo pidió Jonathan el 12/09, de haberlo visto en otras tiendas: en el móvil el
 * catálogo va de dos en dos y, cada seis tarjetas, aparece un producto a lo ancho.
 * Rompe la monotonía de una lista larga y da un sitio donde poner lo que interese
 * empujar esa semana.
 *
 * ⚠️ **Solo en la portada y solo en móvil**, que es donde la lista es larga y estrecha.
 * En una categoría de cuatro productos no hay monotonía que romper, y en escritorio la
 * rejilla ya es de cuatro columnas.
 *
 * ── LAS DOS DECISIONES QUE HAY DETRÁS ──
 *
 * ⭐ **El destacado NO se duplica: se muda.** Sale de su posición normal y aparece
 * solo en la grande. Enseñar el mismo producto dos veces en la misma pantalla es lo
 * que hace que una tienda parezca que tiene menos catálogo del que tiene.
 *
 * ⭐ **Sin tope de destacados.** Se coloca uno cada seis mientras haya; si Jonathan
 * marca cinco, salen los cinco repartidos. Un tope duro obligaría a un mensaje de
 * error en el panel para un caso que se ve de un vistazo mirando la tienda — y quien
 * marca los productos es quien la mira.
 */

/**
 * El `sizes` de la foto de una tarjeta del catalogo.
 *
 * ⚠️⚠️ EXISTE PORQUE LA GRANDE SE VEIA BORROSA, y el motivo no era la foto sino esta
 * cadena. Las dos tarjetas compartian `sizes="(max-width: 640px) 50vw, …"`, pero la
 * grande ocupa las DOS columnas del movil: 100vw, no 50vw. El navegador elige del
 * `srcSet` por lo que le diga esto, asi que pedia media foto y luego la estiraba al
 * doble. Medido el 12/09 en produccion sobre la Nucita destacada: el original es de
 * 1024x1024 y el movil se bajaba la copia de 384 px para pintarla a ~694.
 *
 * ⭐ Solo cambia el primer tramo. De `sm` en adelante la grande vuelve a ser una celda
 * normal (`sm:col-span-1` en `ListaProductos`), asi que ahi mide lo mismo que el resto.
 *
 * ⚠️ Esta aqui, y no en el JSX de cada tarjeta, porque son DOS componentes
 * (`ProductoCard` y `ProductoCardVariantes`) y el fallo fue justamente que la cadena
 * estaba copiada: al nacer la grande solo habia que tocar un sitio, y ese sitio no
 * existia.
 */
export function medidaDeFoto(grande: boolean): string {
  return `(max-width: 640px) ${grande ? "100vw" : "50vw"}, (max-width: 1024px) 33vw, 25vw`;
}

/** Una tarjeta con su sitio en la rejilla. */
export interface EnRejilla {
  item: ItemCatalogo;
  /** Si ocupa el ancho entero. En escritorio se ignora. */
  grande: boolean;
}

/**
 * Cada cuántas tarjetas normales aparece una grande.
 *
 * Seis es lo que pidió Jonathan («seis más o menos») y encaja con la rejilla de dos
 * columnas del móvil: **tres filas completas** y luego la grande. Un número impar
 * dejaría la grande a mitad de una fila, con un hueco al lado.
 */
export const CADA_CUANTAS = 6;

/** Si esta tarjeta lleva algún producto marcado como destacado. */
export function esDestacado(item: ItemCatalogo): boolean {
  return item.clase === "producto"
    ? item.producto.destacado === true
    : // ⚠️ Un grupo de presentaciones va entero: basta con que UNA lo esté. Marcar
      // «Nucita caja» destaca la tarjeta de Nucita, que es la que se ve — pedirle a
      // Jonathan que marque las dos presentaciones sería pedirle que sepa cómo se
      // agrupan por dentro.
      item.grupo.productos.some((p) => p.destacado === true);
}

/**
 * Reparte el catálogo intercalando los destacados.
 *
 * ⚠️ Conserva el orden en los dos grupos: los normales entre sí y los destacados
 * entre sí. Lo único que cambia es dónde cae cada destacado.
 *
 * ⚠️ Los destacados que no lleguen a colocarse —porque se acabaron las tarjetas
 * normales— **se ponen al final en vez de perderse**. Un producto marcado que no
 * aparece por ninguna parte sería un fallo mudo: Jonathan lo marcaría, miraría la
 * tienda y no entendería nada.
 */
export function repartirCatalogo(
  items: ItemCatalogo[],
  cada: number = CADA_CUANTAS,
): EnRejilla[] {
  const destacados = items.filter(esDestacado);

  // Sin destacados no hay nada que repartir, y conviene que sea exactamente la lista
  // de siempre: es el caso normal del catálogo.
  if (destacados.length === 0) return items.map((item) => ({ item, grande: false }));

  const normales = items.filter((item) => !esDestacado(item));
  const salida: EnRejilla[] = [];
  let siguiente = 0;

  normales.forEach((item, i) => {
    salida.push({ item, grande: false });

    // Tras cada bloque completo de `cada` normales entra una grande, si queda.
    const cerroBloque = (i + 1) % cada === 0;
    if (cerroBloque && siguiente < destacados.length) {
      salida.push({ item: destacados[siguiente]!, grande: true });
      siguiente++;
    }
  });

  // Lo que no cupo, al final. Ver la nota de arriba: no se pierde ninguno.
  for (; siguiente < destacados.length; siguiente++) {
    salida.push({ item: destacados[siguiente]!, grande: true });
  }

  return salida;
}
