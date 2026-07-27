import {
  PROVINCIAS_ES,
  codigoPostalValido,
  provinciaPorCP,
  provinciaPorCodigo,
} from "@valatino/types";
import { municipioCanonico, municipiosDe } from "./municipios";
import { MUNICIPIOS_POR_PROVINCIA } from "./municipios.generado";

describe("PROVINCIAS_ES", () => {
  it("son las 52 provincias, con códigos 01 a 52 sin huecos", () => {
    expect(PROVINCIAS_ES).toHaveLength(52);
    const esperados = Array.from({ length: 52 }, (_, i) => String(i + 1).padStart(2, "0"));
    expect(PROVINCIAS_ES.map((p) => p.codigo)).toEqual(esperados);
  });

  it("cuadra exactamente con el diccionario del INE generado", () => {
    // Si el generador y la lista se desincronizan, un CP válido podría quedarse
    // sin municipios y el desplegable saldría vacío sin ningún error.
    expect(Object.keys(MUNICIPIOS_POR_PROVINCIA).sort()).toEqual(
      PROVINCIAS_ES.map((p) => p.codigo).sort(),
    );
  });

  it("no repite nombres", () => {
    const nombres = PROVINCIAS_ES.map((p) => p.nombre);
    expect(new Set(nombres).size).toBe(nombres.length);
  });
});

describe("codigoPostalValido", () => {
  it("acepta códigos postales reales de los extremos del rango", () => {
    for (const cp of ["01001", "28001", "46001", "52001", "07800", "38001"]) {
      expect(codigoPostalValido(cp)).toBe(true);
    }
  });

  it("rechaza lo que no son 5 dígitos", () => {
    for (const cp of ["abc", "2800", "280011", "28 001", "", "2800a"]) {
      expect(codigoPostalValido(cp)).toBe(false);
    }
  });

  it("rechaza los prefijos que no son una provincia", () => {
    // 00 y 53-99 no existen: es lo que hacía que «99999» pasara el filtro de
    // «cinco dígitos» y entrara igualmente en la BD.
    for (const cp of ["00001", "53001", "78123", "99999"]) {
      expect(codigoPostalValido(cp)).toBe(false);
    }
  });

  it("tolera espacios alrededor", () => {
    expect(codigoPostalValido(" 28001 ")).toBe(true);
  });
});

describe("provinciaPorCP", () => {
  it("deduce la provincia de los dos primeros dígitos", () => {
    expect(provinciaPorCP("28840")).toBe("Madrid");
    expect(provinciaPorCP("46001")).toBe("Valencia/València");
    expect(provinciaPorCP("08001")).toBe("Barcelona");
    expect(provinciaPorCP("51001")).toBe("Ceuta");
  });

  it("devuelve null si el CP no es válido, en vez de adivinar", () => {
    expect(provinciaPorCP("99999")).toBeNull();
    expect(provinciaPorCP("abc")).toBeNull();
  });

  it("provinciaPorCodigo resuelve por código de 2 dígitos", () => {
    expect(provinciaPorCodigo("28")).toBe("Madrid");
    expect(provinciaPorCodigo("99")).toBeNull();
  });
});

describe("diccionario del INE", () => {
  it("trae los 8.132 municipios", () => {
    const total = Object.values(MUNICIPIOS_POR_PROVINCIA).reduce((n, l) => n + l.length, 0);
    expect(total).toBe(8132);
  });

  it("cada provincia tiene al menos un municipio", () => {
    for (const { codigo } of PROVINCIAS_ES) {
      expect(municipiosDe(codigo).length).toBeGreaterThan(0);
    }
  });

  it("conserva literales los nombres con coma legítima", () => {
    // Este es el motivo de no invertir el artículo: una regla de «mover lo que
    // va tras la última coma» convertiría esto en un nombre inventado.
    expect(municipiosDe("17")).toContain("Cruïlles, Monells i Sant Sadurní de l'Heura");
  });

  it("los municipios de cada provincia son únicos", () => {
    for (const { codigo } of PROVINCIAS_ES) {
      const lista = municipiosDe(codigo);
      expect(new Set(lista).size).toBe(lista.length);
    }
  });
});

describe("municipioCanonico", () => {
  it("devuelve el nombre oficial cuando el municipio es de esa provincia", () => {
    expect(municipioCanonico("28840", "Mejorada del Campo")).toBe("Mejorada del Campo");
  });

  it("es tolerante con mayúsculas, acentos y espacios de más", () => {
    expect(municipioCanonico("28840", "MEJORADA DEL CAMPO")).toBe("Mejorada del Campo");
    expect(municipioCanonico("28840", "mejorada  del   campo")).toBe("Mejorada del Campo");
    expect(municipioCanonico("28840", "  Mejorada del Campo  ")).toBe("Mejorada del Campo");
    // Sin tilde en Alcalá: quien teclea no tiene que acertar el acento, pero lo
    // que se guarda es el nombre oficial CON tilde.
    expect(municipioCanonico("28801", "alcala de henares")).toBe("Alcalá de Henares");
  });

  it("rechaza un municipio que existe pero en otra provincia", () => {
    // El caso que justifica validar contra la provincia del CP y no contra
    // toda España: Barcelona existe, pero no con un código postal de Madrid.
    expect(municipioCanonico("28001", "Barcelona")).toBeNull();
    expect(municipioCanonico("08001", "Barcelona")).toBe("Barcelona");
  });

  it("rechaza lo que ensució los datos de verdad", () => {
    expect(municipioCanonico("28001", "españa")).toBeNull();
    expect(municipioCanonico("28001", "España")).toBeNull();
    // Un nombre de provincia no es un municipio... salvo cuando lo es de
    // verdad (la capital), y entonces sí debe pasar.
    expect(municipioCanonico("28001", "Madrid")).toBe("Madrid");
    expect(municipioCanonico("09001", "Burgos")).toBe("Burgos");
  });

  it("rechaza un municipio mal escrito", () => {
    expect(municipioCanonico("28001", "Madrit")).toBeNull();
    expect(municipioCanonico("28840", "Mejorada")).toBeNull();
  });

  it("devuelve null si el CP no es válido", () => {
    expect(municipioCanonico("99999", "Madrid")).toBeNull();
    expect(municipioCanonico("", "Madrid")).toBeNull();
  });
});
