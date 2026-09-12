import type { Producto } from "@valatino/types";
import {
  categoriaPorSlug,
  categoriasDe,
  descripcionDeCategoria,
  textoEscritoDe,
  rutaDeCategoria,
  slugDeCategoria,
} from "./categorias";

/**
 * ⚠️⚠️ DE QUÉ MEDICIÓN VIENE ESTE FICHERO.
 *
 * El 12/09, Search Console: **21 de 34 páginas indexadas**. Las 13 que faltan
 * comparten estado —«Descubierta: actualmente sin indexar»— y **último rastreo N/D**,
 * o sea que Google no ha ido nunca a verlas. Entre ellas `/productos/nucita`, y
 * «nucita» es la segunda consulta con más impresiones de la tienda: la gente la
 * busca, sale `nucita-caja-12` (5,90 €) en vez de la unidad (0,50 €), y nadie hace
 * clic.
 *
 * Las categorías son, antes que contenido, **enlaces internos**: un camino corto
 * desde la portada hasta cada ficha. Por eso la lógica está aquí y con pruebas.
 */

function producto(n: number, extra: Partial<Producto> = {}): Producto {
  return {
    id: `0000-${n}`,
    nombre: `Producto ${n}`,
    slug: `producto-${n}`,
    descripcion: "",
    precio: 1,
    imagenes: [],
    categoria: "Dulces",
    stock_disponible: 5,
    stock_reservado: 0,
    activo: true,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-20T00:00:00Z",
    iva_pct: 10,
    ...extra,
  } as unknown as Producto;
}

describe("el slug de una categoría", () => {
  it("pasa a minúsculas y une las palabras con guiones", () => {
    expect(slugDeCategoria("Dulces")).toBe("dulces");
    expect(slugDeCategoria("Bebidas")).toBe("bebidas");
    expect(slugDeCategoria("Comida preparada")).toBe("comida-preparada");
  });

  /**
   * ⚠️⚠️ EL TEST QUE PROTEGE LOS CARACTERES INVISIBLES. El rango de diacríticas de
   * `slugDeCategoria` se escribe con dos caracteres que **no se ven en el editor**.
   * Borrarlos no da ningún error: «Café» pasaría a dar `caf-` en vez de `cafe`, o sea
   * una URL distinta para la misma categoría — un 404 y una página que desaparece.
   * Este test es lo único que lo impide.
   */
  it("respeta los acentos: los quita en vez de romper la palabra", () => {
    expect(slugDeCategoria("Café")).toBe("cafe");
    expect(slugDeCategoria("Piñata")).toBe("pinata");
    expect(slugDeCategoria("Jamón Ibérico")).toBe("jamon-iberico");
  });

  it("no deja guiones sueltos en los bordes ni repetidos", () => {
    expect(slugDeCategoria("  Dulces  ")).toBe("dulces");
    expect(slugDeCategoria("Dulces & Chocolates")).toBe("dulces-chocolates");
    expect(slugDeCategoria("¡Ofertas!")).toBe("ofertas");
  });

  /** Sin slug no hay URL posible, y eso lo tiene que notar quien llame. */
  it("devuelve cadena vacía cuando no queda nada que poner en una URL", () => {
    expect(slugDeCategoria("!!!")).toBe("");
    expect(slugDeCategoria("   ")).toBe("");
  });

  it("la ruta se construye con el slug", () => {
    expect(rutaDeCategoria("dulces")).toBe("/categorias/dulces");
  });
});

describe("las categorías de un catálogo", () => {
  it("agrupa los productos por su categoría", () => {
    const cats = categoriasDe([
      producto(1, { categoria: "Dulces" }),
      producto(2, { categoria: "Bebidas" }),
      producto(3, { categoria: "Dulces" }),
    ]);

    expect(cats.map((c) => c.nombre)).toEqual(["Bebidas", "Dulces"]);
    expect(cats.find((c) => c.slug === "dulces")?.productos).toHaveLength(2);
  });

  /**
   * ⚠️ Misma regla que el mapa del sitio: ofrecerle al buscador una categoría llena
   * de artículos que no se pueden comprar es invitar a una visita que acaba en nada.
   */
  it("deja fuera los productos desactivados", () => {
    const cats = categoriasDe([
      producto(1, { categoria: "Dulces" }),
      producto(2, { categoria: "Dulces", activo: false }),
    ]);

    expect(cats[0]?.productos).toHaveLength(1);
  });

  /** Una categoría que se queda sin ningún producto activo no debería existir. */
  it("una categoría entera desactivada no aparece", () => {
    const cats = categoriasDe([
      producto(1, { categoria: "Dulces" }),
      producto(2, { categoria: "Descatalogado", activo: false }),
    ]);

    expect(cats.map((c) => c.nombre)).toEqual(["Dulces"]);
  });

  /**
   * ⭐ ORDEN ALFABÉTICO Y NO POR TAMAÑO, que era lo natural: ordenar por número de
   * productos haría que **la navegación se reordenara sola** al entrar o agotarse
   * stock. Un menú que cambia de sitio sin que nadie lo toque es un menú en el que no
   * se puede coger la costumbre de mirar.
   */
  it("van en orden alfabético, que no depende del stock", () => {
    const pocos = categoriasDe([
      producto(1, { categoria: "Galletas" }),
      producto(2, { categoria: "Bebidas" }),
      producto(3, { categoria: "Bebidas" }),
      producto(4, { categoria: "Bebidas" }),
    ]);

    expect(pocos.map((c) => c.nombre)).toEqual(["Bebidas", "Galletas"]);
  });

  it("ignora productos sin categoría o con la categoría en blanco", () => {
    const cats = categoriasDe([
      producto(1, { categoria: "Dulces" }),
      producto(2, { categoria: "   " }),
      producto(3, { categoria: null as unknown as string }),
    ]);

    expect(cats).toHaveLength(1);
  });

  /** Una categoría cuyo nombre no da slug no tiene URL: no puede salir. */
  it("descarta las que no pueden tener URL", () => {
    const cats = categoriasDe([
      producto(1, { categoria: "Dulces" }),
      producto(2, { categoria: "!!!" }),
    ]);

    expect(cats.map((c) => c.nombre)).toEqual(["Dulces"]);
  });

  it("encuentra una categoría por su slug, y `null` si no existe", () => {
    const catalogo = [producto(1, { categoria: "Bebidas" })];

    expect(categoriaPorSlug(catalogo, "bebidas")?.nombre).toBe("Bebidas");
    expect(categoriaPorSlug(catalogo, "dulces")).toBeNull();
  });
});

describe("lo que se cuenta de cada categoría", () => {
  /**
   * ⭐ Las cuatro del catálogo real (medido el 12/09: Dulces 9 · Bebidas 8 ·
   * Galletas 8 · Despensa 4) tienen texto propio. Si alguien añade una quinta, este
   * test no falla —no puede saberlo— pero su meta description saldrá generada en vez
   * de escrita, que es justo lo que fija el test de abajo.
   */
  it("las cuatro categorías reales tienen texto escrito", () => {
    for (const slug of ["dulces", "bebidas", "galletas", "despensa"]) {
      expect(textoEscritoDe(slug)).toBeTruthy();
    }
  });

  /** Textos escritos a mano: si dos coincidieran, uno de los dos sería relleno. */
  it("y cada una dice algo distinto", () => {
    const textos = ["dulces", "bebidas", "galletas", "despensa"].map(textoEscritoDe);

    expect(new Set(textos).size).toBe(4);
  });

  /**
   * ⚠️⚠️ NO SE INVENTA UN PÁRRAFO GENÉRICO, y este test existe para que nadie lo
   * «arregle» añadiendo uno por defecto. La auditoría del 09/09 pedía explícitamente
   * «evitar párrafos genéricos repetidos»: una categoría sin prosa se pinta con su
   * título y su listado, que es una página perfectamente válida. Es la misma regla
   * que `descripcionPropia` en `lib/seo/metadatos`.
   */
  it("una categoría sin texto escrito NO recibe uno de relleno", () => {
    expect(textoEscritoDe("conservas")).toBeUndefined();
  });

  /**
   * ⚠️ La meta description sí se genera cuando falta, y no se contradice con lo de
   * arriba: **una página sin meta description no tiene nada que enseñar en los
   * resultados de Google**, así que callarse ahí cuesta algo. Y lo generado lleva el
   * nombre y el recuento, que es información, no relleno.
   */
  it("la meta description usa el texto escrito si lo hay", () => {
    const cat = { nombre: "Dulces", slug: "dulces", productos: [producto(1)] };

    expect(descripcionDeCategoria(cat)).toBe(textoEscritoDe("dulces"));
  });

  it("y si no la hay, dice qué categoría es y cuántos productos tiene", () => {
    const cat = {
      nombre: "Conservas",
      slug: "conservas",
      productos: [producto(1), producto(2)],
    };

    expect(descripcionDeCategoria(cat)).toContain("Conservas");
    expect(descripcionDeCategoria(cat)).toContain("2 productos");
  });

  it("y concuerda en singular con un solo producto", () => {
    const cat = { nombre: "Conservas", slug: "conservas", productos: [producto(1)] };

    // La frase ENTERA concuerda, no solo el sustantivo: lo cazó este test.
    expect(descripcionDeCategoria(cat)).toContain("1 producto latinoamericano original");
    expect(descripcionDeCategoria(cat)).toContain("enviado a toda España");
    expect(descripcionDeCategoria(cat)).not.toContain("originales");
  });
});
