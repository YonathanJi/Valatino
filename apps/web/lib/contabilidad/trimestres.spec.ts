import { rangoTrimestre, trimestreDeMes } from "@valatino/types";

/**
 * El rango de un trimestre decide qué ventas y qué facturas entran en un modelo
 * 303. Un día de más o de menos en un extremo mueve operaciones de trimestre, y
 * eso no se ve mirando la pantalla: se ve cuando cuadra mal.
 *
 * Es además lo único de toda la liquidación que se puede probar sin base de
 * datos, así que aquí se aprieta.
 */
describe("rangoTrimestre", () => {
  it("los cuatro trimestres de un año normal", () => {
    expect(rangoTrimestre(2026, 1)).toEqual({ desde: "2026-01-01", hasta: "2026-03-31" });
    expect(rangoTrimestre(2026, 2)).toEqual({ desde: "2026-04-01", hasta: "2026-06-30" });
    expect(rangoTrimestre(2026, 3)).toEqual({ desde: "2026-07-01", hasta: "2026-09-30" });
    expect(rangoTrimestre(2026, 4)).toEqual({ desde: "2026-10-01", hasta: "2026-12-31" });
  });

  /**
   * Ningún trimestre acaba en febrero, así que el año bisiesto no cambia ningún
   * extremo. Se comprueba en vez de razonarlo, porque es justo el sitio donde
   * alguien metería un `new Date(anio, mes, 0)` para "calcular el último día" y
   * abriría la puerta a un fallo de zona horaria.
   */
  it("un año bisiesto da exactamente los mismos días", () => {
    expect(rangoTrimestre(2028, 1)).toEqual({ desde: "2028-01-01", hasta: "2028-03-31" });
    expect(rangoTrimestre(2028, 2)).toEqual({ desde: "2028-04-01", hasta: "2028-06-30" });
  });

  it("rellena el mes con dos dígitos", () => {
    // Sin el padding saldría "2026-1-01", que la API rechaza y —peor— Postgres
    // podría aceptar interpretándolo a su manera.
    expect(rangoTrimestre(2026, 1).desde).toBe("2026-01-01");
    expect(rangoTrimestre(2026, 4).desde).toBe("2026-10-01");
  });

  it("los extremos son de CALENDARIO, sin hora ni zona", () => {
    // Que no aparezca una T ni una Z es la garantía de que nadie ha construido
    // un Date por el camino: la conversión a instantes la hace la base con la
    // zona de España (`dia_fiscal`, migración 068), no el navegador de quien
    // mira el informe.
    for (const t of [1, 2, 3, 4]) {
      const { desde, hasta } = rangoTrimestre(2026, t);
      expect(desde).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(hasta).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("los cuatro trimestres cubren el año entero sin huecos ni solapes", () => {
    const rangos = [1, 2, 3, 4].map((t) => rangoTrimestre(2026, t));
    expect(rangos[0].desde).toBe("2026-01-01");
    expect(rangos[3].hasta).toBe("2026-12-31");
    for (let i = 1; i < rangos.length; i++) {
      // El día siguiente al fin de uno es el inicio del siguiente. Se compara
      // por cadena tras sumar un día en UTC, que aquí es seguro porque las dos
      // fechas nacen sin hora.
      const finAnterior = new Date(`${rangos[i - 1].hasta}T00:00:00Z`);
      finAnterior.setUTCDate(finAnterior.getUTCDate() + 1);
      expect(finAnterior.toISOString().slice(0, 10)).toBe(rangos[i].desde);
    }
  });

  it("rechaza un trimestre que no existe", () => {
    expect(() => rangoTrimestre(2026, 0)).toThrow(/Trimestre inválido/);
    expect(() => rangoTrimestre(2026, 5)).toThrow(/Trimestre inválido/);
    expect(() => rangoTrimestre(2026, 1.5)).toThrow(/Trimestre inválido/);
  });
});

describe("trimestreDeMes", () => {
  it("agrupa los doce meses de tres en tres", () => {
    expect([1, 2, 3].map(trimestreDeMes)).toEqual([1, 1, 1]);
    expect([4, 5, 6].map(trimestreDeMes)).toEqual([2, 2, 2]);
    expect([7, 8, 9].map(trimestreDeMes)).toEqual([3, 3, 3]);
    expect([10, 11, 12].map(trimestreDeMes)).toEqual([4, 4, 4]);
  });

  /**
   * La pantalla abre en el trimestre ANTERIOR al de hoy, que es el que se
   * presenta. En enero eso significa el 4T del año pasado, y es el único caso
   * donde además cambia el ejercicio.
   */
  it("sirve para calcular el trimestre a presentar, incluido el salto de enero", () => {
    const anterior = (mes: number) => {
      const t = trimestreDeMes(mes);
      return t === 1 ? 4 : t - 1;
    };
    expect(anterior(1)).toBe(4);
    expect(anterior(2)).toBe(4);
    expect(anterior(4)).toBe(1);
    expect(anterior(8)).toBe(2);
    expect(anterior(11)).toBe(3);
  });
});
