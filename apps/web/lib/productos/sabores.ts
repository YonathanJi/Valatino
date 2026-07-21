import type { Producto } from "@valatino/types";

/**
 * Convención de sabores del catálogo: los productos que son variantes de
 * sabor se nombran "Producto Sabor X" (ej. "Galleta Festival Sabor Fresa").
 * El storefront los agrupa en una sola tarjeta y la ficha ofrece el selector.
 */
const SEPARADOR_SABOR = /\s+sabor\s+/i;

export function partirNombrePorSabor(
  nombre: string,
): { base: string; sabor: string } | null {
  const partes = nombre.split(SEPARADOR_SABOR);
  if (partes.length !== 2) return null;
  const base = partes[0]!.trim();
  const sabor = partes[1]!.trim();
  if (!base || !sabor) return null;
  return { base, sabor };
}

export interface GrupoSabores {
  /** Nombre común, ej. "Galleta Festival" */
  base: string;
  /** Variantes del grupo, en el orden del catálogo */
  productos: Producto[];
}

export type ItemCatalogo =
  | { tipo: "producto"; producto: Producto }
  | { tipo: "grupo"; grupo: GrupoSabores };

/**
 * Agrupa las variantes de sabor (misma base + misma categoría, 2 o más).
 * El resto de productos pasa sin cambios; se conserva el orden original
 * (el grupo ocupa la posición de su primera variante).
 */
export function agruparPorSabor(productos: Producto[]): ItemCatalogo[] {
  const grupos = new Map<string, GrupoSabores>();
  const items: ItemCatalogo[] = [];

  for (const p of productos) {
    const partes = partirNombrePorSabor(p.nombre);
    if (!partes) {
      items.push({ tipo: "producto", producto: p });
      continue;
    }

    const clave = `${p.categoria}::${partes.base.toLowerCase()}`;
    const existente = grupos.get(clave);
    if (existente) {
      existente.productos.push(p);
    } else {
      const grupo: GrupoSabores = { base: partes.base, productos: [p] };
      grupos.set(clave, grupo);
      items.push({ tipo: "grupo", grupo });
    }
  }

  // Un "grupo" de una sola variante se muestra como producto normal
  return items.map((item) =>
    item.tipo === "grupo" && item.grupo.productos.length < 2
      ? { tipo: "producto", producto: item.grupo.productos[0]! }
      : item,
  );
}

/** Variantes de sabor del mismo producto (incluye al propio), o [] si no aplica */
export function hermanosDeSabor(producto: Producto, todos: Producto[]): Producto[] {
  const partes = partirNombrePorSabor(producto.nombre);
  if (!partes) return [];

  const hermanos = todos.filter((p) => {
    if (p.categoria !== producto.categoria) return false;
    const pp = partirNombrePorSabor(p.nombre);
    return pp !== null && pp.base.toLowerCase() === partes.base.toLowerCase();
  });

  return hermanos.length >= 2 ? hermanos : [];
}
