import { refundQueCompletaElAcumulado } from "./stripe.service";

/**
 * Los casos salen de devoluciones REALES del sandbox, con sus ids, para que el test
 * no describa lo que creemos que manda Stripe sino lo que mandó. Las listas van del
 * más nuevo al más viejo, que es como las da `refunds.list`.
 */
const ok = (id: string, amount: number) => ({ id, amount, status: "succeeded" });

describe("refundQueCompletaElAcumulado", () => {
  /** Pedido 260825018204: cuatro devoluciones desde el panel sobre 13,41 €. */
  const tarjeta = [
    ok("re_3U8RxYL1kwgv5hCu19jwLedt", 105),
    ok("re_3U8RxYL1kwgv5hCu1PRkdXT5", 196),
    ok("re_3U8RxYL1kwgv5hCu14E1mnIK", 700),
    ok("re_3U8RxYL1kwgv5hCu1YJGK43g", 340),
  ];

  it.each([
    [340, "re_3U8RxYL1kwgv5hCu1YJGK43g"],
    [1040, "re_3U8RxYL1kwgv5hCu14E1mnIK"],
    [1236, "re_3U8RxYL1kwgv5hCu1PRkdXT5"],
    [1341, "re_3U8RxYL1kwgv5hCu19jwLedt"],
  ])("con %i céntimos devueltos, la que lo disparó es %s", (acumulado, esperado) => {
    expect(refundQueCompletaElAcumulado(tarjeta, acumulado)).toBe(esperado);
  });

  /**
   * ⚠️ El caso por el que NO vale coger la más reciente: el aviso de la primera
   * devolución procesado cuando ya existen las otras tres.
   */
  it("no coge la más reciente si el aviso es de una anterior", () => {
    expect(refundQueCompletaElAcumulado(tarjeta, 340)).not.toBe(tarjeta[0].id);
  });

  /** Pedido 260825012812, Bizum: el cargo es `py_…` y sus devoluciones `pyr_…`. */
  it("funciona con las devoluciones de Bizum", () => {
    const bizum = [
      ok("pyr_1U8RjxL1kwgv5hCuCnY89AMJ", 2345),
      ok("pyr_1U8RQ8L1kwgv5hCuBLakcT7c", 43),
    ];

    expect(refundQueCompletaElAcumulado(bizum, 43)).toBe("pyr_1U8RQ8L1kwgv5hCuBLakcT7c");
    expect(refundQueCompletaElAcumulado(bizum, 2388)).toBe("pyr_1U8RjxL1kwgv5hCuCnY89AMJ");
  });

  /** Stripe descuenta de `amount_refunded` las que fallan, así que no suman. */
  it("salta las devoluciones fallidas y canceladas", () => {
    const conFallos = [
      ok("re_C", 200),
      { id: "re_B", amount: 500, status: "failed" },
      { id: "re_X", amount: 50, status: "canceled" },
      ok("re_A", 100),
    ];

    expect(refundQueCompletaElAcumulado(conFallos, 300)).toBe("re_C");
  });

  /** Si nada cuadra, null: mejor no saberlo que apuntar la llave de otra. */
  it("devuelve null si ninguna suma da el acumulado", () => {
    expect(refundQueCompletaElAcumulado(tarjeta, 999)).toBeNull();
    expect(refundQueCompletaElAcumulado([], 340)).toBeNull();
  });
});
