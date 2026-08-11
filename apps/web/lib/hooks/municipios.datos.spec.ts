import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PROVINCIAS_ES, provinciaPorCP } from "@valatino/types";

/**
 * Integridad de los datos que sirve `public/municipios/`.
 *
 * No prueban código: prueban el FICHERO GENERADO, y esa es la gracia. Los
 * escribe `scripts/generar-municipios.mjs` cruzando dos fuentes —el diccionario
 * del INE y una tabla de códigos postales que no es oficial— y ese cruce puede
 * degradarse sin que nadie lo note: basta con que la fuente de CP cambie de
 * formato o de convención de nombres.
 *
 * Lo que rompería en producción si esto no estuviera: un índice fuera de rango
 * deja el desplegable con huecos vacíos, y un CP colado en la provincia
 * equivocada ofrece localidades que el servidor va a rechazar **al pagar**, que
 * es el peor momento posible para descubrirlo.
 */

const DIR = join(__dirname, "../../public/municipios");

interface DatosProvincia {
  municipios: string[];
  porCP: Record<string, number[]>;
}

const ficheros = readdirSync(DIR).filter((f) => f.endsWith(".json"));

function leer(fichero: string): DatosProvincia {
  return JSON.parse(readFileSync(join(DIR, fichero), "utf8")) as DatosProvincia;
}

describe("datos de municipios por provincia", () => {
  it("hay un fichero por provincia española", () => {
    expect(ficheros).toHaveLength(PROVINCIAS_ES.length);
    expect(ficheros).toHaveLength(52);
  });

  it("los ficheros se llaman como el código de su provincia", () => {
    const codigos = PROVINCIAS_ES.map((p) => p.codigo).sort();
    expect(ficheros.map((f) => f.replace(".json", "")).sort()).toEqual(codigos);
  });

  describe.each(ficheros)("%s", (fichero) => {
    const cpro = fichero.replace(".json", "");
    const datos = leer(fichero);

    it("tiene municipios y su tabla de códigos postales", () => {
      expect(datos.municipios.length).toBeGreaterThan(0);
      expect(datos.porCP).toBeDefined();
    });

    it("los municipios vienen ordenados y sin repetir", () => {
      const ordenados = [...datos.municipios].sort((a, b) => a.localeCompare(b, "es"));
      expect(datos.municipios).toEqual(ordenados);
      expect(new Set(datos.municipios).size).toBe(datos.municipios.length);
    });

    it("⚠️ todos los índices apuntan a un municipio que existe", () => {
      for (const [cp, indices] of Object.entries(datos.porCP)) {
        for (const i of indices) {
          // Un índice fuera de rango daría `undefined` y pintaría una opción
          // en blanco que se puede elegir y no significa nada.
          expect(datos.municipios[i]).toBeDefined();
          expect(typeof datos.municipios[i]).toBe("string");
          expect(`${cp}:${datos.municipios[i]}`).not.toContain("undefined");
        }
      }
    });

    it("⚠️ todos los CP pertenecen a esta provincia", () => {
      for (const cp of Object.keys(datos.porCP)) {
        expect(cp).toMatch(/^\d{5}$/);
        expect(cp.slice(0, 2)).toBe(cpro);
        // Y la provincia que deduce la aplicación tiene que ser la misma que
        // la del fichero, o el desplegable y la validación dirían cosas
        // distintas del mismo código postal.
        expect(provinciaPorCP(cp)).not.toBeNull();
      }
    });

    it("ningún CP se queda con una lista vacía", () => {
      for (const [cp, indices] of Object.entries(datos.porCP)) {
        // Un CP presente pero sin municipios acotaría el desplegable a nada y
        // el cliente vería cero opciones sin entender por qué.
        expect({ cp, n: indices.length }).toEqual({ cp, n: expect.any(Number) });
        expect(indices.length).toBeGreaterThan(0);
      }
    });
  });
});

describe("cobertura del cruce", () => {
  it("mapea decenas de miles de códigos postales", () => {
    const total = ficheros.reduce((n, f) => n + Object.keys(leer(f).porCP).length, 0);
    // Hay ~11.000 CP en España. Si esto se desploma es que el cruce con el INE
    // se rompió y el acotado dejó de existir sin dar ningún error.
    expect(total).toBeGreaterThan(9000);
  });

  it("acota de verdad: la mayoría de CP dejan 1 o 2 localidades", () => {
    const tamanos: number[] = [];
    for (const f of ficheros) {
      for (const indices of Object.values(leer(f).porCP)) tamanos.push(indices.length);
    }
    const cortos = tamanos.filter((n) => n <= 2).length;
    // Si esto bajara del 80 %, acotar habría dejado de servir para algo y
    // valdría la pena replantear el diseño en vez de dejarlo a medias.
    expect(cortos / tamanos.length).toBeGreaterThan(0.8);
  });
});
