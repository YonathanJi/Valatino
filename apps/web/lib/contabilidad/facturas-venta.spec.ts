import type { FacturaDeLaVenta } from "@valatino/types";

import { resumenDeLaVenta } from "./facturas-venta";

/**
 * El resumen de lo que queda facturado de una venta. Es aritmética de dinero
 * sobre documentos fiscales, así que se aprieta aquí: la alternativa es que
 * alguien mire la ficha, sume mal de cabeza y se quede con una cifra que no es.
 */
const factura = (f: Partial<FacturaDeLaVenta>): FacturaDeLaVenta => ({
  id: crypto.randomUUID(),
  numero: "VALF202600100",
  tipo: "completa",
  fecha_expedicion: "2026-08-14",
  total: 0,
  vigente: true,
  sustituida_por: null,
  rectifica_a_numero: null,
  ...f,
});

describe("resumenDeLaVenta", () => {
  it("sin facturas no hay nada que resumir", () => {
    expect(resumenDeLaVenta([])).toEqual({
      facturado: 0,
      rectificado: 0,
      neto: 0,
      hayQueResumir: false,
    });
  });

  it("una sola factura no se resume: su fila ya lo dice", () => {
    const r = resumenDeLaVenta([factura({ total: 3.02 })]);
    expect(r.facturado).toBe(3.02);
    expect(r.neto).toBe(3.02);
    // Una línea que repite el número de arriba enseña a no leer las que sí
    // añaden algo.
    expect(r.hayQueResumir).toBe(false);
  });

  /**
   * ⭐ EL CASO REAL DEL 2026-08-14, y el que originó todo esto: la venta
   * `260814015565` se devolvió entera en dos reembolsos parciales. La completa
   * sigue diciendo 3,02 € —una factura emitida no se toca— y las dos
   * rectificativas la dejan en cero.
   */
  it("una venta devuelta entera queda en cero", () => {
    const r = resumenDeLaVenta([
      factura({ numero: "VALF202600100", total: 3.02 }),
      factura({ numero: "VALR202600100", tipo: "rectificativa", total: -0.62 }),
      factura({ numero: "VALR202600101", tipo: "rectificativa", total: -2.4 }),
    ]);

    expect(r.facturado).toBe(3.02);
    expect(r.rectificado).toBe(-3.02);
    expect(r.neto).toBe(0);
    expect(r.hayQueResumir).toBe(true);
  });

  /**
   * ⚠️ Y que sea EXACTAMENTE cero, no «casi». En coma flotante
   * `3.02 - 0.62 - 2.4` es `-4.44e-16`, que con dos decimales se pinta «-0,00 €»
   * — un neto negativo en una venta que quedó saldada. Por eso se suma en
   * céntimos enteros.
   */
  it("el cero es cero de verdad, no un negativo de coma flotante", () => {
    const { neto } = resumenDeLaVenta([
      factura({ total: 3.02 }),
      factura({ tipo: "rectificativa", total: -0.62 }),
      factura({ tipo: "rectificativa", total: -2.4 }),
    ]);

    expect(neto).toBe(0);
    expect(Object.is(neto, -0)).toBe(false);
    expect(1 / neto).toBe(Infinity);
  });

  it("una devolución parcial deja el resto facturado", () => {
    const r = resumenDeLaVenta([
      factura({ total: 3.02 }),
      factura({ tipo: "rectificativa", total: -0.62 }),
    ]);

    expect(r.rectificado).toBe(-0.62);
    expect(r.neto).toBe(2.4);
  });

  /**
   * ⚠️⚠️ LA SUSTITUIDA NO CUENTA, que es la regla de la 073 §5. Una simplificada
   * canjeada por una completa sigue existiendo —no se anula jamás— pero sumarla
   * facturaría la venta dos veces. Es el mismo error que el libro y el 303 evitan
   * con `vigente`, y aquí se pinta en la misma pantalla donde alguien decidiría
   * si la venta cuadra.
   */
  it("una simplificada canjeada no suma", () => {
    const r = resumenDeLaVenta([
      factura({
        numero: "VALS202600100",
        tipo: "simplificada",
        total: 3.02,
        vigente: false,
        sustituida_por: "VALF202600100",
      }),
      factura({ numero: "VALF202600100", total: 3.02 }),
    ]);

    expect(r.facturado).toBe(3.02);
    expect(r.neto).toBe(3.02);
    // Dos filas en pantalla, una sola vigente: la lista no se lee de un vistazo
    // y el resumen desambigua cuál cuenta.
    expect(r.hayQueResumir).toBe(true);
  });

  it("dos tipos de IVA y varios documentos siguen sumando al céntimo", () => {
    const r = resumenDeLaVenta([
      factura({ total: 119.51 }),
      factura({ tipo: "rectificativa", total: -0.01 }),
      factura({ tipo: "rectificativa", total: -19.5 }),
    ]);

    expect(r.neto).toBe(100);
  });
});
