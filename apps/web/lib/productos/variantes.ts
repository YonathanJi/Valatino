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

/** «3 sabores», «2 formatos», «1 formato» */
const PLURAL_VARIANTE: Record<TipoVariante, string> = {
  // Plural explícito y no `tipo + "s"`: en español las palabras acabadas en
  // consonante lo hacen en `-es`, y añadir una `s` daba «3 sabors» en la tarjeta
  // del catálogo. Lo cazó el test en su primera ejecución.
  sabor: "sabores",
  formato: "formatos",
};

export function etiquetaVariantes(tipo: TipoVariante, cuantas: number): string {
  return `${cuantas} ${cuantas === 1 ? tipo : PLURAL_VARIANTE[tipo]}`;
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

/** Hermanas de la misma familia (incluida ella), o [] si no aplica. */
export function hermanosDeVariante(producto: Producto, todos: Producto[]): ProductoConVariante[] {
  if (!tieneVariante(producto)) return [];

  const clave = claveFamilia(producto.familia);
  const hermanos = todos.filter(
    (p): p is ProductoConVariante => tieneVariante(p) && claveFamilia(p.familia) === clave,
  );

  return hermanos.length >= 2 ? hermanos : [];
}
