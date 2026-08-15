import type { Producto, TipoVariante } from "@valatino/types";
import {
  agruparPorVariante,
  etiquetaFormato,
  etiquetaVariantes,
  hermanosDeVariante,
  IMAGEN_PLACEHOLDER,
  miniaturaDe,
  partirEtiquetaFormato,
  tieneVariante,
  vistaDeFamilia,
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
    iva_pct: 10,
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

/**
 * Lo que enseña la tarjeta del catálogo según lo que el cliente haya elegido en
 * la tira de miniaturas. Vive en una función pura precisamente para poder
 * probarlo: la web no tiene tests de componentes, así que lo que se quede en el
 * JSX se queda sin red.
 */
describe("vistaDeFamilia", () => {
  /** Una familia de sabores con foto propia cada una, y foto de familia. */
  function galletas() {
    const choco = conVariante("Galleta Festival Sabor Chocolate", "Galleta Festival", "Chocolate", "sabor", {
      precio: 0.8,
      imagenes: ["/choco.jpg", "/familia.jpg"],
      slug: "galleta-chocolate",
    });
    const fresa = conVariante("Galleta Festival Sabor Fresa", "Galleta Festival", "Fresa", "sabor", {
      precio: 0.9,
      imagenes: ["/fresa.jpg"],
      slug: "galleta-fresa",
    });
    const grupo = agruparPorVariante([choco, fresa])[0]!;
    if (grupo.clase !== "grupo") throw new Error("debería agrupar");
    return { grupo: grupo.grupo, choco, fresa };
  }

  describe("mientras no hay ninguna elegida", () => {
    it("manda la foto de familia y el precio es un «desde»", () => {
      const { grupo } = galletas();
      const v = vistaDeFamilia(grupo, null);

      // `imagenes[1]` de cualquier hermana: la convención que ya existía.
      expect(v.imagen).toBe("/familia.jpg");
      expect(v.precio).toBe(0.8);
      expect(v.esDesde).toBe(true);
      expect(v.alt).toBe("Galleta Festival");
    });

    it("el subtítulo enumera las presentaciones", () => {
      const { grupo } = galletas();
      expect(vistaDeFamilia(grupo, null).subtitulo).toBe("Chocolate · Fresa");
    });

    it("con un solo precio no dice «desde»", () => {
      const { grupo, fresa } = galletas();
      fresa.precio = 0.8;
      expect(vistaDeFamilia(grupo, null).esDesde).toBe(false);
    });
  });

  describe("con una elegida", () => {
    it("manda SU foto, SU precio y SU nombre", () => {
      const { grupo, fresa } = galletas();
      const v = vistaDeFamilia(grupo, fresa.id);

      expect(v.imagen).toBe("/fresa.jpg");
      expect(v.precio).toBe(0.9);
      expect(v.esDesde).toBe(false);
      expect(v.subtitulo).toBe("Fresa");
      expect(v.alt).toBe("Galleta Festival · Fresa");
    });

    /**
     * ⚠️ El enlace es a la ELEGIDA, no a la representante. Si llevara siempre a
     * la misma, elegir fresa y entrar te abriría chocolate — y el cliente no
     * tiene forma de saber que el catálogo no le hizo caso.
     */
    it("el enlace lleva a la ficha de la elegida", () => {
      const { grupo, fresa } = galletas();
      expect(vistaDeFamilia(grupo, fresa.id).href).toBe("/productos/galleta-fresa");
    });

    it("sin foto propia cae al placeholder, no a la de familia", () => {
      const { grupo, fresa } = galletas();
      fresa.imagenes = [];
      // Enseñar la foto de familia haría creer que esa ES la foto de la fresa.
      expect(vistaDeFamilia(grupo, fresa.id).imagen).toBe(IMAGEN_PLACEHOLDER);
    });
  });

  describe("el agotado", () => {
    it("la familia solo está agotada si lo están todas", () => {
      const { grupo, choco } = galletas();
      choco.stock_disponible = 0;

      expect(vistaDeFamilia(grupo, null).agotado).toBe(false);
    });

    /**
     * ⚠️ Y con una elegida manda la suya AUNQUE haya hermanas disponibles. Si la
     * tarjeta dijera «disponible» porque queda otro sabor, el cliente entraría a
     * la ficha a encontrarse el botón apagado.
     */
    it("con una elegida manda el stock de esa", () => {
      const { grupo, fresa } = galletas();
      fresa.stock_disponible = 0;

      expect(vistaDeFamilia(grupo, fresa.id).agotado).toBe(true);
    });

    it("sin elegida, la foto y el enlace son de la primera CON stock", () => {
      const { grupo, choco } = galletas();
      choco.stock_disponible = 0;
      choco.imagenes = ["/choco.jpg"]; // se queda sin foto de familia

      const v = vistaDeFamilia(grupo, null);
      expect(v.imagen).toBe("/fresa.jpg");
      expect(v.href).toBe("/productos/galleta-fresa");
    });
  });

  it("un id que no es de la familia se ignora, no rompe la tarjeta", () => {
    const { grupo } = galletas();
    expect(vistaDeFamilia(grupo, "p-inventado").subtitulo).toBe("Chocolate · Fresa");
  });
});

describe("miniaturaDe", () => {
  it("es la primera foto de la presentación", () => {
    const p = conVariante("X", "F", "C/U", "formato", { imagenes: ["/a.jpg", "/b.jpg"] });
    expect(miniaturaDe(p)).toBe("/a.jpg");
  });

  it("sin fotos, el placeholder: la tira no puede tener un hueco", () => {
    const p = conVariante("X", "F", "C/U", "formato", { imagenes: [] });
    expect(miniaturaDe(p)).toBe(IMAGEN_PLACEHOLDER);
  });
});
