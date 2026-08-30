import type { Producto, TipoVariante } from "@valatino/types";

/**
 * Agrupado de presentaciones del mismo artículo —caja y unidad, o los sabores—
 * en una sola tarjeta con selector: el cliente ve un producto y elige antes de
 * indicar la cantidad.
 *
 * El parentesco vive en **columnas propias** (`familia`, `variante`,
 * `variante_tipo`; migración 057) y **ya no se deduce del nombre**. La convención
 * anterior obligaba a llamar «Quipitos Formato C/U» a un producto que se llama
 * «Quipitos Pops C/U», y eso es hacerlo al revés: el nombre es del negocio, el
 * parentesco es un dato del sistema.
 *
 * ⚠️ **Por debajo siguen siendo PRODUCTOS INDEPENDIENTES**, con su stock, su
 * precio y su línea en las facturas. El agrupado es solo visual, a propósito: un
 * stock único con factores de conversión entraría en `reservar_carrito`,
 * `confirmar_venta`, `stock_reservas` y los reembolsos con reposición — la ruta
 * por la que pasa el dinero.
 *
 * ⚠️ **La consecuencia que hay que conocer**: los stocks van por separado. Con 2
 * cajas y 0 unidades sueltas el cliente **no puede comprar unidades** aunque
 * físicamente haya 48 dentro, hasta que alguien abra una con «Desempaquetar» en
 * Inventario (migración 056). El selector es el escaparate; desempaquetar es el
 * almacén.
 */

/** Dos productos son hermanos si comparten familia, ignorando mayúsculas y espacios. */
function claveFamilia(familia: string): string {
  return familia.trim().toLowerCase();
}

/** Un producto declarado como presentación de una familia. */
export interface ProductoConVariante extends Producto {
  familia: string;
  variante: string;
  variante_tipo: TipoVariante;
}

/**
 * ¿Este producto declara su familia? Los tres campos van juntos por CHECK en la
 * base de datos, así que basta comprobar que están.
 */
export function tieneVariante(p: Producto): p is ProductoConVariante {
  return Boolean(p.familia?.trim() && p.variante?.trim() && p.variante_tipo);
}

/**
 * Envases habituales, para no tener que teclear la etiqueta a mano.
 *
 * No es una lista cerrada de verdad: el formulario ofrece «Otro…» y guarda lo
 * que se escriba. Está aquí para que lo normal sea rápido, no para limitar.
 */
export const ENVASES_FORMATO = ["C/U", "Caja", "Paquete", "Bolsa"] as const;

/** El envase suelto, sin cantidad: una unidad no lleva «de cuántas». */
const ENVASE_UNIDAD = "C/U";

/**
 * Cómo se DICE una variante, que no es cómo se guarda.
 *
 * `C/U` es la forma corta de «cada uno» y se usa en el almacén y en el
 * formulario, pero en la tienda no dice nada: el cliente ve un bote y una caja de
 * 24, y «C/U» no le explica que ese es el bote suelto. Se dice **«Unidad»**.
 *
 * ⚠️⚠️ SOLO CAMBIA LO QUE SE ENSEÑA. El valor guardado en `productos.variante`
 * sigue siendo `C/U` y NO se toca: es lo que agrupa las familias, lo que compara
 * el `<select>` del formulario y lo que `partirEtiquetaFormato` sabe leer al
 * editar. Traducir el dato en vez de la etiqueta rompería las tres cosas y
 * dejaría los 6 productos que hoy la tienen sin poder agruparse.
 *
 * ⚠️ Compara en mayúsculas porque el dato canónico es `C/U` pero nada impide que
 * llegue un `c/u` escrito a mano; el resto se devuelve tal cual, que es lo que
 * hay que hacer con «Caja 24 unidades» y con cualquier sabor.
 */
export function varianteVisible(variante: string): string {
  const limpio = variante.trim();
  return limpio.toUpperCase() === ENVASE_UNIDAD ? "Unidad" : limpio;
}

/**
 * Construye la etiqueta que verá el cliente juntando envase y cantidad.
 *
 * Existe porque la etiqueta real es «Caja 24 unidades» y un desplegable cerrado
 * no puede enumerar todas las cantidades. Se pregunta el envase (lista corta) y
 * cuántas trae (número), y la etiqueta se arma aquí.
 */
export function etiquetaFormato(envase: string, unidades?: number | null): string {
  const limpio = envase.trim();
  if (!limpio || limpio === ENVASE_UNIDAD) return ENVASE_UNIDAD;
  if (!unidades || unidades < 2) return limpio;
  return `${limpio} ${unidades} unidades`;
}

/**
 * Lo contrario, para rellenar el formulario al editar un producto que ya tiene
 * su etiqueta guardada. Devuelve `null` si no reconoce el patrón, y entonces el
 * formulario la trata como texto libre en vez de inventarse un envase.
 */
export function partirEtiquetaFormato(
  variante: string,
): { envase: string; unidades: number | null } | null {
  const limpio = variante.trim();
  if (!limpio) return null;

  // «unidad» y «unidades»: `unidades?` solo haría opcional la `s` y dejaría
  // fuera el singular. Lo cazó el test.
  const conCantidad = /^(.+?)\s+(\d+)\s+unidad(?:es)?$/i.exec(limpio);
  if (conCantidad) {
    const envase = envaseCanonico(conCantidad[1]!);
    return envase ? { envase, unidades: Number(conCantidad[2]) } : null;
  }

  const envase = envaseCanonico(limpio);
  return envase ? { envase, unidades: null } : null;
}

/**
 * Devuelve el envase con su forma de la lista, o `null` si no es de los
 * conocidos. La forma canónica importa: el `<select>` del formulario compara por
 * valor, así que «caja» no seleccionaría la opción «Caja».
 */
function envaseCanonico(envase: string): string | null {
  const buscado = envase.trim().toLowerCase();
  return ENVASES_FORMATO.find((e) => e.toLowerCase() === buscado) ?? null;
}

export interface GrupoVariantes {
  /** El nombre de la familia, tal como se escribió en la primera del grupo */
  familia: string;
  tipo: TipoVariante;
  /** Presentaciones del grupo, en el orden del catálogo */
  productos: ProductoConVariante[];
}

/**
 * Un elemento del catálogo: o un producto suelto, o un grupo de presentaciones.
 *
 * El discriminante se llama `clase` y no `tipo` a propósito: `GrupoVariantes`
 * tiene su propio `tipo` (sabor/formato), y tener dos `tipo` a un nivel de
 * distancia es de donde salen los bugs que se leen bien.
 */
export type ItemCatalogo =
  | { clase: "producto"; producto: Producto }
  | { clase: "grupo"; grupo: GrupoVariantes };

/**
 * Agrupa por familia. El resto pasa sin cambios y se conserva el orden original:
 * el grupo ocupa la posición de su primera presentación.
 *
 * **No se exige la misma categoría.** Si alguien escribió la familia es que lo
 * dijo a propósito, y obligar a que coincida la categoría solo daría grupos
 * partidos en dos sin explicación visible.
 */
export function agruparPorVariante(productos: Producto[]): ItemCatalogo[] {
  const grupos = new Map<string, GrupoVariantes>();
  const items: ItemCatalogo[] = [];

  for (const p of productos) {
    if (!tieneVariante(p)) {
      items.push({ clase: "producto", producto: p });
      continue;
    }

    const clave = claveFamilia(p.familia);
    const existente = grupos.get(clave);

    if (existente) {
      existente.productos.push(p);
    } else {
      const grupo: GrupoVariantes = {
        familia: p.familia.trim(),
        tipo: p.variante_tipo,
        productos: [p],
      };
      grupos.set(clave, grupo);
      items.push({ clase: "grupo", grupo });
    }
  }

  // Una familia con una sola presentación no es un grupo: se muestra como
  // producto normal, o el catálogo enseñaría un selector de un solo valor.
  return items.map((item) =>
    item.clase === "grupo" && item.grupo.productos.length < 2
      ? { clase: "producto", producto: item.grupo.productos[0]! }
      : item,
  );
}

/** Cuando un producto no tiene foto. Mismo fichero que usan las dos tarjetas. */
export const IMAGEN_PLACEHOLDER = "/placeholder.png";

/**
 * La miniatura de una presentación: su propia foto.
 *
 * Pide un `Producto` y no una `ProductoConVariante` porque solo mira `imagenes`:
 * exigir el tipo estrecho obligaba a castear en cada llamada sin ganar nada.
 */
export function miniaturaDe(p: Producto): string {
  return p.imagenes[0] ?? IMAGEN_PLACEHOLDER;
}

/**
 * Lo que enseña la tarjeta de una familia, según la presentación que el cliente
 * haya elegido en la tira de miniaturas.
 *
 * ⚠️ **Vive aquí y no en el componente a propósito.** La web no tiene tests de
 * componentes, así que una regla metida en el JSX es una regla sin red. Aquí son
 * cuatro decisiones —qué foto, qué precio, a dónde se va y si está agotado— y
 * cada una tiene su prueba.
 *
 * ⭐ **El estado inicial NO es «la primera variante», es la familia entera**, y eso
 * es deliberado: la tarjeta sigue abriendo con la foto de familia y el «Desde
 * X €» que ya tenía, y solo se convierte en una presentación concreta cuando
 * alguien la elige. Arrancar con una elegida cambiaría el catálogo de hoy sin
 * que nadie lo hubiera pedido, y además dejaría la foto de familia sin usar.
 */
export interface VistaDeFamilia {
  /** La foto grande. */
  imagen: string;
  /** Su texto alternativo, que cambia con lo elegido. */
  alt: string;
  /** A dónde llevan la foto y el nombre. */
  href: string;
  precio: number;
  /** `true` si el precio es un «desde» y no el de una presentación concreta. */
  esDesde: boolean;
  /** Bajo el título: la elegida, o la lista entera mientras no haya ninguna. */
  subtitulo: string;
  /** Si lo que se está enseñando ahora mismo no se puede comprar. */
  agotado: boolean;
  /**
   * El id del producto que la tarjeta está enseñando: el elegido, o el
   * representante mientras no haya elegido ninguno.
   *
   * ⚠️⚠️ EXISTE PORQUE EL CORAZÓN LO NECESITA. Antes solo salía de aquí el `href`,
   * así que la tarjeta sabía a dónde llevaba pero no QUÉ estaba enseñando, y el
   * corazón tenía que esperar a que alguien eligiera una presentación para
   * aparecer. Lo levantó Jonathan: «el corazón debe aparecer siempre, no solo
   * cuando se dé clic en un producto».
   *
   * ⭐ Es el MISMO producto al que lleva `href`, y eso es lo que hace que guardar
   * sea coherente: se guarda lo que se está viendo y lo que se abriría al tocar.
   * El carrito sigue exigiendo elegida a propósito —añadir el sabor equivocado sí
   * es un problema—, pero guardar lo que tienes delante no tiene ambigüedad.
   */
  visibleId: string;
}

export function vistaDeFamilia(grupo: GrupoVariantes, elegidaId: string | null): VistaDeFamilia {
  const { familia, productos } = grupo;

  const elegida = productos.find((p) => p.id === elegidaId) ?? null;
  // La representante es la primera CON STOCK: enseñar de entrada una agotada
  // teniendo hermanas disponibles es mandar a la gente a una puerta cerrada.
  const representante = productos.find((p) => p.stock_disponible > 0) ?? productos[0]!;
  const visible = elegida ?? representante;

  // La foto de familia es `imagenes[1]` de cualquier hermana (convención previa
  // a esto). Manda mientras no haya elegida; en cuanto la hay, manda la suya.
  const imagenFamilia = productos.map((p) => p.imagenes[1]).find(Boolean);
  const imagen = elegida
    ? (elegida.imagenes[0] ?? IMAGEN_PLACEHOLDER)
    : (imagenFamilia ?? representante.imagenes[0] ?? IMAGEN_PLACEHOLDER);

  const precios = productos.map((p) => Number(p.precio));
  const precioMin = Math.min(...precios);

  return {
    imagen,
    visibleId: visible.id,
    alt: elegida ? `${familia} · ${varianteVisible(elegida.variante)}` : familia,
    href: `/productos/${visible.slug ?? visible.id}`,
    precio: elegida ? Number(elegida.precio) : precioMin,
    esDesde: !elegida && Math.max(...precios) !== precioMin,
    /**
     * ⚠️ El nombre de la elegida NO es decorativo, y es lo que compensa haber
     * puesto foto también en los formatos: dos fotos de «C/U» y «Caja 24» son
     * casi idénticas en 40 px, así que sin este texto la tarjeta no diría qué
     * has elegido. En sabores la foto ya distingue y el texto solo confirma.
     */
    subtitulo: elegida
      ? varianteVisible(elegida.variante)
      : productos.map((p) => varianteVisible(p.variante)).join(" · "),
    // Sin elegida, la tarjeta habla de la familia: solo está agotada si lo están
    // TODAS. Con elegida, manda su stock aunque haya hermanas disponibles.
    agotado: elegida ? elegida.stock_disponible <= 0 : !productos.some((p) => p.stock_disponible > 0),
  };
}

/** Hermanas de la misma familia (incluida ella), o [] si no aplica. */
export function hermanosDeVariante(producto: Producto, todos: Producto[]): ProductoConVariante[] {
  if (!tieneVariante(producto)) return [];

  const clave = claveFamilia(producto.familia);
  const hermanos = todos.filter(
    (p): p is ProductoConVariante => tieneVariante(p) && claveFamilia(p.familia) === clave,
  );

  return hermanos.length >= 2 ? hermanos : [];
}
