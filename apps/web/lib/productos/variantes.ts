import type { Producto } from "@valatino/types";

/**
 * Convención de variantes del catálogo: un producto que es variante de otro se
 * nombra **`Base <PALABRA> Valor`**.
 *
 *     "Galleta Festival Sabor Fresa"  →  base "Galleta Festival", sabor "Fresa"
 *     "Quipitos Formato Caja 24"      →  base "Quipitos",         formato "Caja 24"
 *
 * El escaparate los junta en **una sola tarjeta con selector**, así que el
 * cliente ve un producto y elige sabor o formato antes de indicar la cantidad.
 *
 * ⚠️ **Por debajo son PRODUCTOS INDEPENDIENTES**, con su stock, su precio y su
 * línea en las facturas. El agrupado es solo visual, y es una decisión tomada a
 * propósito: un sistema de variantes de verdad metería factores de conversión
 * dentro de `reservar_carrito`, `confirmar_venta`, `stock_reservas` y los
 * reembolsos con reposición — la ruta por la que pasa el dinero, y donde un
 * fallo no da error sino que descuadra el inventario.
 *
 * ⚠️ **La consecuencia que hay que conocer**: los stocks van por separado. Si
 * quedan 2 cajas y 0 unidades sueltas, el cliente **no puede comprar unidades**
 * aunque físicamente haya 48 dentro de esas cajas, hasta que alguien abra una
 * con «Desempaquetar» en Inventario (migración 056). Las dos piezas se
 * complementan: el selector es el escaparate, desempaquetar es el almacén.
 *
 * ⚠️ **No se combinan**: un nombre con las dos palabras («… Sabor Mora Formato
 * Caja 24») se interpreta como variante de **sabor**, porque `sabor` va primero
 * en esta lista, y el formato acaba dentro del valor. Para sabores Y formatos a
 * la vez haría falta un modelo de verdad, no una convención de nombres.
 */
const TIPOS_VARIANTE = ["sabor", "formato"] as const;

export type TipoVariante = (typeof TIPOS_VARIANTE)[number];

export interface Variante {
  /** Nombre común, ej. "Galleta Festival" */
  base: string;
  tipo: TipoVariante;
  /** Lo que distingue a esta variante, ej. "Fresa" o "Caja 24" */
  valor: string;
}

export function partirNombrePorVariante(nombre: string): Variante | null {
  for (const tipo of TIPOS_VARIANTE) {
    const partes = nombre.split(new RegExp(`\\s+${tipo}\\s+`, "i"));
    if (partes.length !== 2) continue;

    const base = partes[0]!.trim();
    const valor = partes[1]!.trim();
    if (!base || !valor) continue;

    return { base, tipo, valor };
  }
  return null;
}

/**
 * Plural explícito y no `tipo + "s"`: en español las palabras acabadas en
 * consonante lo hacen en `-es`, y añadir una `s` a secas daba «3 sabors» en la
 * tarjeta del catálogo. Lo cazó el test en su primera ejecución.
 */
const PLURAL_VARIANTE: Record<TipoVariante, string> = {
  sabor: "sabores",
  formato: "formatos",
};

/** «3 sabores», «2 formatos», «1 formato» */
export function etiquetaVariantes(tipo: TipoVariante, cuantas: number): string {
  return `${cuantas} ${cuantas === 1 ? tipo : PLURAL_VARIANTE[tipo]}`;
}

export interface GrupoVariantes {
  base: string;
  tipo: TipoVariante;
  /** Variantes del grupo, en el orden del catálogo */
  productos: Producto[];
}

/**
 * Un elemento del catálogo: o un producto suelto, o un grupo de variantes.
 *
 * El discriminante se llama `clase` y no `tipo` a propósito: `GrupoVariantes`
 * tiene su propio `tipo` (sabor/formato) y tener dos `tipo` a un nivel de
 * distancia es de donde salen los bugs que se leen bien.
 */
export type ItemCatalogo =
  | { clase: "producto"; producto: Producto }
  | { clase: "grupo"; grupo: GrupoVariantes };

/**
 * Agrupa las variantes (misma base, mismo tipo y misma categoría, 2 o más).
 * El resto de productos pasa sin cambios y se conserva el orden original: el
 * grupo ocupa la posición de su primera variante.
 */
export function agruparPorVariante(productos: Producto[]): ItemCatalogo[] {
  const grupos = new Map<string, GrupoVariantes>();
  const items: ItemCatalogo[] = [];

  for (const p of productos) {
    const v = partirNombrePorVariante(p.nombre);
    if (!v) {
      items.push({ clase: "producto", producto: p });
      continue;
    }

    // La categoría entra en la clave: dos productos que se llamen igual en
    // secciones distintas no son variantes del mismo.
    const clave = `${p.categoria}::${v.tipo}::${v.base.toLowerCase()}`;
    const existente = grupos.get(clave);

    if (existente) {
      existente.productos.push(p);
    } else {
      const grupo: GrupoVariantes = { base: v.base, tipo: v.tipo, productos: [p] };
      grupos.set(clave, grupo);
      items.push({ clase: "grupo", grupo });
    }
  }

  // Un "grupo" de una sola variante no es un grupo: se muestra como producto
  // normal, o el catálogo enseñaría una tarjeta con selector de un solo valor.
  return items.map((item) =>
    item.clase === "grupo" && item.grupo.productos.length < 2
      ? { clase: "producto", producto: item.grupo.productos[0]! }
      : item,
  );
}

/** Variantes hermanas del mismo producto (incluida ella), o [] si no aplica. */
export function hermanosDeVariante(producto: Producto, todos: Producto[]): Producto[] {
  const v = partirNombrePorVariante(producto.nombre);
  if (!v) return [];

  const hermanos = todos.filter((p) => {
    if (p.categoria !== producto.categoria) return false;
    const pv = partirNombrePorVariante(p.nombre);
    // El tipo tiene que coincidir: un sabor no es hermano de un formato.
    return pv !== null && pv.tipo === v.tipo && pv.base.toLowerCase() === v.base.toLowerCase();
  });

  return hermanos.length >= 2 ? hermanos : [];
}
