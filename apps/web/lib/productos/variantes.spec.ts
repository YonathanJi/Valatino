import type { Producto, TipoVariante } from "@valatino/types";
import {
  agruparPorVariante,
  etiquetaFormato,
  etiquetaVariantes,
  hermanosDeVariante,
  partirEtiquetaFormato,
  tieneVariante,
} from "./variantes";

/**
 * El parentesco entre presentaciones vive en columnas (`familia`, `variante`,
 * `variante_tipo`) desde la migración 057; antes se deducía del nombre. Estos
 * tests fijan el comportamiento nuevo y, sobre todo, los casos que antes daban
 * problemas: que una familia suelta no forme grupo, que el orden se conserve y
 * que los espacios y las mayúsculas no partan un grupo en dos.
 */

let n = 0;
function prod(nombre: string, extra: Partial<Producto> = {}): Producto {
  n += 1;
  return {
    id: `p-${n}`,
    nombre,
    descripcion: null,
    precio: 1,
    imagenes: [],
    categoria: "Dulces",
    stock_disponible: 10,
    stock_reservado: 0,
    activo: true,
    slug: `p-${n}`,
    familia: null,
    variante: null,
    variante_tipo: null,
    created_at: "",
    updated_at: "",
    ...extra,
  };
}

/** Atajo: producto que declara familia y variante. */
function conVariante(
  nombre: string,
  familia: string,
  variante: string,
  tipo: TipoVariante = "formato",
  extra: Partial<Producto> = {},
): Producto {
  return prod(nombre, { familia, variante, variante_tipo: tipo, ...extra });
}

describe("tieneVariante", () => {
  it("es cierto cuando los tres campos están", () => {
    expect(tieneVariante(conVariante("Quipitos Pops C/U", "Quipitos Pops", "C/U"))).toBe(true);
  });

  it("es falso para un producto suelto", () => {
    expect(tieneVariante(prod("Bon Bon Bum"))).toBe(false);
  });

  it("es falso si algún campo viene vacío o en blanco", () => {
    // El CHECK de la BD lo impide, pero la web no debe pintar una pastilla vacía
    // si algún día llega así por otro camino.
    expect(tieneVariante(prod("X", { familia: "F", variante: "", variante_tipo: "formato" }))).toBe(
      false,
    );
    expect(
      tieneVariante(prod("X", { familia: "   ", variante: "C/U", variante_tipo: "formato" })),
    ).toBe(false);
  });
});

describe("etiquetaVariantes", () => {
  it("pluraliza en español", () => {
    expect(etiquetaVariantes("sabor", 3)).toBe("3 sabores");
    expect(etiquetaVariantes("formato", 2)).toBe("2 formatos");
    expect(etiquetaVariantes("formato", 1)).toBe("1 formato");
  });
});

describe("etiquetaFormato", () => {
  it("arma la etiqueta con la cantidad", () => {
    // El caso de Jonathan, tal cual lo escribiría él.
    expect(etiquetaFormato("Caja", 24)).toBe("Caja 24 unidades");
    expect(etiquetaFormato("Paquete", 6)).toBe("Paquete 6 unidades");
  });

  it("la unidad no lleva cantidad", () => {
    expect(etiquetaFormato("C/U")).toBe("C/U");
    // Aunque se cuele un 1: «C/U 1 unidades» no lo diría nadie.
    expect(etiquetaFormato("C/U", 1)).toBe("C/U");
  });

  it("sin cantidad deja el envase solo", () => {
    expect(etiquetaFormato("Caja")).toBe("Caja");
    expect(etiquetaFormato("Caja", null)).toBe("Caja");
    expect(etiquetaFormato("Caja", 1)).toBe("Caja");
  });
});

describe("partirEtiquetaFormato", () => {
  it("reconoce lo que arma etiquetaFormato (ida y vuelta)", () => {
    expect(partirEtiquetaFormato(etiquetaFormato("Caja", 24))).toEqual({
      envase: "Caja",
      unidades: 24,
    });
    expect(partirEtiquetaFormato(etiquetaFormato("C/U"))).toEqual({
      envase: "C/U",
      unidades: null,
    });
  });

  it("acepta el singular y devuelve el envase en su forma canónica", () => {
    // Canónica porque el <select> del formulario compara por valor: «caja» no
    // seleccionaría la opción «Caja».
    expect(partirEtiquetaFormato("caja 1 unidad")).toEqual({ envase: "Caja", unidades: 1 });
    expect(partirEtiquetaFormato("c/u")).toEqual({ envase: "C/U", unidades: null });
    expect(partirEtiquetaFormato("  CAJA 24 UNIDADES  ")).toEqual({
      envase: "Caja",
      unidades: 24,
    });
  });

  it("devuelve null si el envase no es de los conocidos", () => {
    // Así el formulario la trata como texto libre en vez de inventarse un envase
    // y perder lo que el usuario habia escrito.
    expect(partirEtiquetaFormato("Fresa")).toBeNull();
    expect(partirEtiquetaFormato("Botellín 33 cl")).toBeNull();
    expect(partirEtiquetaFormato("Display 12 unidades")).toBeNull();
    expect(partirEtiquetaFormato("")).toBeNull();
  });
});

describe("agruparPorVariante", () => {
  it("agrupa las presentaciones de una familia, con el nombre real del producto libre", () => {
    // El caso que motivó la 057: los nombres son los del negocio.
    const items = agruparPorVariante([
      conVariante("Quipitos Pops Caja 24 Unidades", "Quipitos Pops", "Caja 24 unidades"),
      conVariante("Quipitos Pops C/U", "Quipitos Pops", "C/U"),
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]!.clase).toBe("grupo");
    if (items[0]!.clase === "grupo") {
      expect(items[0]!.grupo.familia).toBe("Quipitos Pops");
      expect(items[0]!.grupo.tipo).toBe("formato");
      expect(items[0]!.grupo.productos.map((p) => p.variante)).toEqual([
        "Caja 24 unidades",
        "C/U",
      ]);
    }
  });

  it("una familia con una sola presentación NO forma grupo", () => {
    const items = agruparPorVariante([conVariante("Quipitos Pops C/U", "Quipitos Pops", "C/U")]);
    expect(items).toHaveLength(1);
    expect(items[0]!.clase).toBe("producto");
  });

  it("los espacios y las mayúsculas no parten el grupo", () => {
    const items = agruparPorVariante([
      conVariante("A", "Quipitos Pops", "C/U"),
      conVariante("B", " quipitos pops ", "Caja 24"),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]!.clase).toBe("grupo");
  });

  it("agrupa aunque las categorías no coincidan", () => {
    // Decisión de la 057: manda la familia declarada, no la categoría.
    const items = agruparPorVariante([
      conVariante("A", "Quipitos Pops", "C/U", "formato", { categoria: "Dulces" }),
      conVariante("B", "Quipitos Pops", "Caja 24", "formato", { categoria: "Snacks" }),
    ]);
    expect(items).toHaveLength(1);
  });

  it("no agrupa familias distintas", () => {
    const items = agruparPorVariante([
      conVariante("A", "Quipitos Pops", "C/U"),
      conVariante("B", "Jugo Hit", "Mora", "sabor"),
    ]);
    expect(items.every((i) => i.clase === "producto")).toBe(true);
  });

  it("conserva el orden y deja pasar los productos sueltos", () => {
    const items = agruparPorVariante([
      prod("Bon Bon Bum"),
      conVariante("Galleta Festival Sabor Fresa", "Galleta Festival", "Fresa", "sabor"),
      prod("Nucita"),
      conVariante("Galleta Festival Sabor Limón", "Galleta Festival", "Limón", "sabor"),
    ]);

    // El grupo ocupa el sitio de su primera presentación.
    expect(
      items.map((i) => (i.clase === "producto" ? i.producto.nombre : i.grupo.familia)),
    ).toEqual(["Bon Bon Bum", "Galleta Festival", "Nucita"]);
  });
});

describe("hermanosDeVariante", () => {
  it("devuelve las de la misma familia, incluida la propia", () => {
    const caja = conVariante("Quipitos Pops Caja 24 Unidades", "Quipitos Pops", "Caja 24");
    const uni = conVariante("Quipitos Pops C/U", "Quipitos Pops", "C/U");
    const otro = prod("Bon Bon Bum");

    expect(hermanosDeVariante(caja, [caja, uni, otro])).toEqual([caja, uni]);
  });

  it("no devuelve nada si es la única de su familia", () => {
    const uni = conVariante("Quipitos Pops C/U", "Quipitos Pops", "C/U");
    expect(hermanosDeVariante(uni, [uni, prod("Nucita")])).toEqual([]);
  });

  it("no devuelve nada para un producto suelto", () => {
    const solo = prod("Bon Bon Bum");
    expect(hermanosDeVariante(solo, [solo, prod("Nucita")])).toEqual([]);
  });
});
