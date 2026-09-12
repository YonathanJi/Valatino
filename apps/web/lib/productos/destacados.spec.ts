import type { Producto } from "@valatino/types";
import type { ItemCatalogo } from "./variantes";
import { CADA_CUANTAS, esDestacado, repartirCatalogo } from "./destacados";

/**
 * El reparto del catálogo con productos destacados.
 *
 * ⚠️ Está aquí y no en el componente por la regla de siempre: el runner de la web
 * corre en `node` sin `jsdom` y un `.tsx` no se puede montar. Lo que puede salir mal
 * —perder un destacado, duplicarlo, colocarlo donde no toca— es esto.
 */

function producto(n: number, extra: Partial<Producto> = {}): Producto {
  return {
    id: `p${n}`,
    nombre: `Producto ${n}`,
    slug: `producto-${n}`,
    descripcion: "",
    precio: 1,
    imagenes: [],
    categoria: "Dulces",
    stock_disponible: 5,
    stock_reservado: 0,
    activo: true,
    destacado: false,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-20T00:00:00Z",
    iva_pct: 10,
    ...extra,
  } as unknown as Producto;
}

const suelto = (n: number, destacado = false): ItemCatalogo => ({
  clase: "producto",
  producto: producto(n, { destacado }),
});

/** `n` tarjetas normales seguidas. */
const normales = (n: number): ItemCatalogo[] =>
  Array.from({ length: n }, (_, i) => suelto(i + 1));

const nombres = (r: ReturnType<typeof repartirCatalogo>) =>
  r.map((x) => (x.item.clase === "producto" ? x.item.producto.nombre : x.item.grupo.familia));

const grandes = (r: ReturnType<typeof repartirCatalogo>) =>
  r.filter((x) => x.grande).map((x) => (x.item.clase === "producto" ? x.item.producto.nombre : "?"));

describe("qué cuenta como destacado", () => {
  it("un producto suelto, si lo lleva marcado", () => {
    expect(esDestacado(suelto(1, true))).toBe(true);
    expect(esDestacado(suelto(1, false))).toBe(false);
  });

  /**
   * ⚠️ Un grupo de presentaciones va entero: basta con que UNA lo esté. Pedirle a
   * quien marca los productos que marque las dos presentaciones sería pedirle que
   * sepa cómo se agrupan por dentro.
   */
  it("un grupo, si CUALQUIERA de sus presentaciones lo lleva", () => {
    const grupo: ItemCatalogo = {
      clase: "grupo",
      grupo: {
        familia: "Nucita",
        tipo: "formato",
        productos: [
          producto(1, { destacado: false }),
          producto(2, { destacado: true }),
        ] as never,
      },
    };

    expect(esDestacado(grupo)).toBe(true);
  });

  /** Un producto de antes de la migración no trae el campo, y eso no es «destacado». */
  it("sin el campo, no está destacado", () => {
    const viejo = { clase: "producto", producto: producto(1, { destacado: undefined }) };
    expect(esDestacado(viejo as ItemCatalogo)).toBe(false);
  });
});

describe("el reparto del catálogo", () => {
  /** El caso normal: hoy no hay ninguno marcado y el catálogo no debe cambiar. */
  it("sin destacados, la lista sale tal cual y ninguna es grande", () => {
    const r = repartirCatalogo(normales(9));

    expect(r).toHaveLength(9);
    expect(r.every((x) => !x.grande)).toBe(true);
    expect(nombres(r)).toEqual(normales(9).map((_, i) => `Producto ${i + 1}`));
  });

  it("coloca el destacado después de seis normales", () => {
    const r = repartirCatalogo([...normales(9), suelto(99, true)]);

    expect(r[6]).toMatchObject({ grande: true });
    expect(nombres(r)[6]).toBe("Producto 99");
    // Y los seis de antes son los normales, en su orden.
    expect(nombres(r).slice(0, 6)).toEqual([1, 2, 3, 4, 5, 6].map((n) => `Producto ${n}`));
  });

  /**
   * ⭐⭐ EL QUE MÁS IMPORTA: el destacado se MUDA, no se copia. Enseñar el mismo
   * producto dos veces en la misma pantalla hace que la tienda parezca tener menos
   * catálogo del que tiene.
   */
  it("el destacado NO aparece además en su sitio normal", () => {
    const r = repartirCatalogo([...normales(9), suelto(99, true)]);

    expect(nombres(r).filter((n) => n === "Producto 99")).toHaveLength(1);
    expect(r).toHaveLength(10);
  });

  it("con dos destacados, uno cada seis normales", () => {
    const r = repartirCatalogo([...normales(14), suelto(98, true), suelto(99, true)]);

    expect(grandes(r)).toEqual(["Producto 98", "Producto 99"]);
    expect(r[6]?.grande).toBe(true);
    // El segundo va tras SEIS normales más, no seis posiciones más.
    expect(r[13]?.grande).toBe(true);
  });

  /**
   * ⚠️⚠️ UN DESTACADO QUE NO CABE NO SE PIERDE: va al final. Un producto marcado que
   * no aparece por ninguna parte sería un fallo mudo — se marca, se mira la tienda y
   * no se entiende nada.
   */
  it("si no hay suficientes normales, los destacados van al final", () => {
    const r = repartirCatalogo([...normales(3), suelto(98, true), suelto(99, true)]);

    expect(r).toHaveLength(5);
    expect(grandes(r)).toEqual(["Producto 98", "Producto 99"]);
    expect(nombres(r).slice(0, 3)).toEqual(["Producto 1", "Producto 2", "Producto 3"]);
  });

  it("un catálogo que SOLO tiene destacados sale entero, todos grandes", () => {
    const r = repartirCatalogo([suelto(1, true), suelto(2, true)]);

    expect(r).toHaveLength(2);
    expect(r.every((x) => x.grande)).toBe(true);
  });

  it("no pierde ni inventa tarjetas, haya los que haya", () => {
    for (const cuantos of [0, 1, 2, 5]) {
      const items = [
        ...normales(20),
        ...Array.from({ length: cuantos }, (_, i) => suelto(90 + i, true)),
      ];
      const r = repartirCatalogo(items);

      expect(r).toHaveLength(items.length);
      expect(new Set(nombres(r)).size).toBe(items.length);
      expect(grandes(r)).toHaveLength(cuantos);
    }
  });

  it("conserva el orden entre los normales y entre los destacados", () => {
    const r = repartirCatalogo([...normales(18), suelto(97, true), suelto(98, true), suelto(99, true)]);

    expect(grandes(r)).toEqual(["Producto 97", "Producto 98", "Producto 99"]);
    // ⚠️ Se filtra por `grande` y no por el nombre: `startsWith("Producto 9")` cazaba
    // también al «Producto 9» normal, y el test fallaba por su propio criterio.
    const soloNormales = r
      .filter((x) => !x.grande)
      .map((x) => (x.item.clase === "producto" ? x.item.producto.nombre : "?"));
    expect(soloNormales).toEqual(normales(18).map((_, i) => `Producto ${i + 1}`));
  });

  /**
   * ⭐ Seis, y no un número impar, porque la rejilla del móvil es de DOS columnas:
   * seis son tres filas completas. Con cinco o siete, la grande caería a mitad de
   * fila y dejaría un hueco al lado.
   */
  it("el intervalo es par, que es lo que cierra filas de dos columnas", () => {
    expect(CADA_CUANTAS % 2).toBe(0);
  });
});
