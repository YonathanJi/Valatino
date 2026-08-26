import { finDelDiaEnEspana } from "./dia-de-la-tienda";

/**
 * ⚠️⚠️ EL CASO REAL QUE ORIGINA ESTO, y es el primer test por eso.
 *
 * El panel guardaba `new Date("2026-08-26").toISOString()` = `2026-08-26T00:00:00.000Z`,
 * o sea el PRINCIPIO del 26. Con `now() > valido_hasta` en la base, un código «válido
 * hasta el 26» estaba muerto durante todo el 26. Pasó tres veces de tres.
 *
 * Lo que fija este fichero es que la fecha que se escribe en el panel **incluye su
 * propio día**, en el calendario de la tienda y no en el del navegador.
 */
describe("finDelDiaEnEspana", () => {
  it("el día que se nombra cuenta entero (verano, CEST +02:00)", () => {
    // 23:59:59.999 en Madrid = 21:59:59.999 UTC
    expect(finDelDiaEnEspana("2026-08-26")).toBe("2026-08-26T21:59:59.999Z");
  });

  it("y en invierno también (CET +01:00)", () => {
    // 23:59:59.999 en Madrid = 22:59:59.999 UTC
    expect(finDelDiaEnEspana("2026-01-15")).toBe("2026-01-15T22:59:59.999Z");
  });

  /**
   * ⭐ LA COMPARACIÓN QUE IMPORTA: lo que hacía el panel antes contra lo que hace
   * ahora. Sin este test, el arreglo se puede deshacer sin que nada se queje.
   */
  it("mejora lo que hacía el panel: antes el día no contaba, ahora sí", () => {
    const antes = new Date("2026-08-26").toISOString();
    const ahora = finDelDiaEnEspana("2026-08-26")!;

    expect(antes).toBe("2026-08-26T00:00:00.000Z");
    expect(new Date(ahora).getTime()).toBeGreaterThan(new Date(antes).getTime());

    // Un pedido a mediodía del 26 en España: con el valor viejo el código ya había
    // caducado; con el nuevo, no.
    const mediodiaDel26 = new Date("2026-08-26T10:00:00.000Z");
    expect(mediodiaDel26.getTime()).toBeGreaterThan(new Date(antes).getTime()); // caducado
    expect(mediodiaDel26.getTime()).toBeLessThan(new Date(ahora).getTime()); // vigente
  });

  /**
   * ⚠️ Los dos domingos del año en que cambia la hora. El desplazamiento se ancla al
   * MEDIODÍA del día pedido y no a las 23:59 UTC —que ya es el día siguiente en
   * Madrid—, y esto es lo que lo comprueba.
   */
  it("acierta el domingo en que entra el horario de verano", () => {
    // 2026-03-29: a las 02:00 CET se pasa a 03:00 CEST. El final del día es +02:00.
    expect(finDelDiaEnEspana("2026-03-29")).toBe("2026-03-29T21:59:59.999Z");
  });

  it("acierta el domingo en que sale el horario de verano", () => {
    // 2026-10-25: a las 03:00 CEST se vuelve a 02:00 CET. El final del día es +01:00.
    expect(finDelDiaEnEspana("2026-10-25")).toBe("2026-10-25T22:59:59.999Z");
  });

  it("y el día anterior al cambio sigue en el huso de antes", () => {
    expect(finDelDiaEnEspana("2026-03-28")).toBe("2026-03-28T22:59:59.999Z"); // aún CET
    expect(finDelDiaEnEspana("2026-10-24")).toBe("2026-10-24T21:59:59.999Z"); // aún CEST
  });

  /** «Sin fecha» tiene que seguir siendo «sin fecha», no una fecha inventada. */
  it("sin fecha devuelve null", () => {
    expect(finDelDiaEnEspana("")).toBeNull();
    expect(finDelDiaEnEspana("no-es-una-fecha")).toBeNull();
  });

  /** Un año bisiesto y el último día del año, que es donde se cuela un off-by-one. */
  it("aguanta el 29 de febrero y el 31 de diciembre", () => {
    expect(finDelDiaEnEspana("2028-02-29")).toBe("2028-02-29T22:59:59.999Z");
    expect(finDelDiaEnEspana("2026-12-31")).toBe("2026-12-31T22:59:59.999Z");
  });
});
