import type { Producto } from "@valatino/types";
import {
  agruparPorVariante,
  etiquetaVariantes,
  hermanosDeVariante,
  partirNombrePorVariante,
} from "./variantes";

/**
 * Estos son los PRIMEROS tests de la web, y no es casualidad dónde caen: aquí
 * vive la convención que decide qué ve el cliente en el catálogo. La lógica ya
 * estaba en producción para los sabores cuando se generalizó a formatos, así que
 * la mitad de estos tests existen para demostrar que **el comportamiento de los
 * sabores no cambió** al añadir los formatos.
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
    categoria: "Galletas",
    stock_disponible: 10,
    stock_reservado: 0,
    activo: true,
    slug: `p-${n}`,
    created_at: "",
    updated_at: "",
    ...extra,
  };
}

describe("partirNombrePorVariante", () => {
  it("reconoce un sabor", () => {
    expect(partirNombrePorVariante("Galleta Festival Sabor Fresa")).toEqual({
      base: "Galleta Festival",
      tipo: "sabor",
      valor: "Fresa",
    });
  });

  it("reconoce un formato con espacios y números", () => {
    expect(partirNombrePorVariante("Quipitos Formato Caja 24")).toEqual({
      base: "Quipitos",
      tipo: "formato",
      valor: "Caja 24",
    });
  });

  it("no distingue mayúsculas en la palabra clave", () => {
    expect(partirNombrePorVariante("Jugo Hit SABOR Mora")?.valor).toBe("Mora");
    expect(partirNombrePorVariante("Quipitos formato Unidad")?.tipo).toBe("formato");
  });

  it("devuelve null si no sigue la convención", () => {
    // El caso real que hizo falta arreglar: «Jugo Hit Mora» no agrupaba.
    expect(partirNombrePorVariante("Jugo Hit Mora")).toBeNull();
    expect(partirNombrePorVariante("Bon Bon Bum")).toBeNull();
  });

  it("devuelve null si falta un lado", () => {
    expect(partirNombrePorVariante("Sabor Fresa")).toBeNull();
    expect(partirNombrePorVariante("Galleta Festival Sabor")).toBeNull();
  });

  it("devuelve null si la palabra clave aparece dos veces", () => {
    // Con tres trozos no se puede saber cuál es la base.
    expect(partirNombrePorVariante("A Sabor B Sabor C")).toBeNull();
  });

  it("con sabor Y formato en el nombre, gana el sabor (limitación conocida)", () => {
    expect(partirNombrePorVariante("Jugo Hit Sabor Mora Formato Caja 24")).toEqual({
      base: "Jugo Hit",
      tipo: "sabor",
      valor: "Mora Formato Caja 24",
    });
  });
});

describe("etiquetaVariantes", () => {
  it("pluraliza", () => {
    expect(etiquetaVariantes("sabor", 3)).toBe("3 sabores");
    expect(etiquetaVariantes("formato", 2)).toBe("2 formatos");
    expect(etiquetaVariantes("formato", 1)).toBe("1 formato");
  });
});

describe("agruparPorVariante", () => {
  it("agrupa dos o más variantes del mismo tipo y base", () => {
    const items = agruparPorVariante([
      prod("Galleta Festival Sabor Fresa"),
      prod("Galleta Festival Sabor Limón"),
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]!.clase).toBe("grupo");
    if (items[0]!.clase === "grupo") {
      expect(items[0]!.grupo.base).toBe("Galleta Festival");
      expect(items[0]!.grupo.tipo).toBe("sabor");
      expect(items[0]!.grupo.productos).toHaveLength(2);
    }
  });

  it("una sola variante NO forma grupo", () => {
    // Si no, el catálogo enseñaría un selector de un solo valor.
    const items = agruparPorVariante([prod("Galleta Festival Sabor Fresa")]);
    expect(items).toHaveLength(1);
    expect(items[0]!.clase).toBe("producto");
  });

  it("no mezcla sabores con formatos aunque compartan base", () => {
    const items = agruparPorVariante([
      prod("Quipitos Sabor Original"),
      prod("Quipitos Sabor Limón"),
      prod("Quipitos Formato Unidad"),
      prod("Quipitos Formato Caja 24"),
    ]);

    expect(items).toHaveLength(2);
    const tipos = items.map((i) => (i.clase === "grupo" ? i.grupo.tipo : "producto"));
    expect(tipos).toEqual(["sabor", "formato"]);
  });

  it("no agrupa variantes de categorías distintas", () => {
    const items = agruparPorVariante([
      prod("Quipitos Formato Unidad", { categoria: "Snacks" }),
      prod("Quipitos Formato Caja 24", { categoria: "Despensa" }),
    ]);
    expect(items.every((i) => i.clase === "producto")).toBe(true);
  });

  it("conserva el orden y deja pasar los productos sin convención", () => {
    const items = agruparPorVariante([
      prod("Bon Bon Bum"),
      prod("Galleta Festival Sabor Fresa"),
      prod("Nucita"),
      prod("Galleta Festival Sabor Limón"),
    ]);

    // El grupo ocupa el sitio de su primera variante.
    expect(items.map((i) => (i.clase === "producto" ? i.producto.nombre : i.grupo.base))).toEqual([
      "Bon Bon Bum",
      "Galleta Festival",
      "Nucita",
    ]);
  });
});

describe("hermanosDeVariante", () => {
  it("devuelve las variantes del mismo grupo, incluida la propia", () => {
    const fresa = prod("Galleta Festival Sabor Fresa");
    const limon = prod("Galleta Festival Sabor Limón");
    const otro = prod("Bon Bon Bum");

    expect(hermanosDeVariante(fresa, [fresa, limon, otro])).toEqual([fresa, limon]);
  });

  it("no devuelve nada si es la única variante", () => {
    const fresa = prod("Galleta Festival Sabor Fresa");
    expect(hermanosDeVariante(fresa, [fresa, prod("Nucita")])).toEqual([]);
  });

  it("no devuelve nada para un producto sin convención", () => {
    const solo = prod("Bon Bon Bum");
    expect(hermanosDeVariante(solo, [solo, prod("Nucita")])).toEqual([]);
  });

  it("un formato no es hermano de un sabor", () => {
    const caja = prod("Quipitos Formato Caja 24");
    const unidad = prod("Quipitos Formato Unidad");
    const sabor = prod("Quipitos Sabor Limón");

    expect(hermanosDeVariante(caja, [caja, unidad, sabor])).toEqual([caja, unidad]);
  });
});
