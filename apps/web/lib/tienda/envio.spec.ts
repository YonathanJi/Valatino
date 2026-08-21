import { estadoEnvio, faltaParaEnvioGratis } from "./envio";

/**
 * Estos tests existen porque **esta lógica falla en silencio**.
 *
 * Un «te faltan 3,40 € para el envío gratis» mal calculado no da error, no rompe
 * la página y no sale en ningún log. Solo hace que el cliente añada algo que no
 * le sirve —o que la tienda calle cuando le faltaba un euro y se pierda la venta
 * de más—. Es el mismo perfil de avería que la `og:image` del 20/08 y que los
 * límites del multipart, que estuvieron seis días rotos.
 *
 * Lo que se fija, por orden de lo que cuesta si se rompe:
 *
 *   1. Que el céntimo no se escape por la coma flotante. Es el que se ve.
 *   2. Que «gratis» se decida por el importe que se cobra y NUNCA por el umbral.
 *   3. Que sin umbral no se prometa nada.
 */
describe("faltaParaEnvioGratis", () => {
  it("dice lo que falta cuando el carrito está por debajo del umbral", () => {
    expect(
      faltaParaEnvioGratis({ subtotal: 36.6, costeEnvio: 4.95, envioGratisDesde: 40 }),
    ).toBe(3.4);
  });

  /**
   * ⚠️ EL CASO QUE JUSTIFICA LOS CÉNTIMOS ENTEROS. `40 - 36.6` en coma flotante
   * es `3.4000000000000057`, y eso llega al formateador y sale impreso. Con
   * `Math.round(n * 100)` no hay cola que imprimir.
   */
  it("no arrastra la cola de la coma flotante", () => {
    const falta = faltaParaEnvioGratis({
      subtotal: 36.6,
      costeEnvio: 4.95,
      envioGratisDesde: 40,
    });
    expect(falta).not.toBeNull();
    expect(String(falta)).toBe("3.4");
  });

  it("cuenta bien un céntimo suelto", () => {
    expect(
      faltaParaEnvioGratis({ subtotal: 39.99, costeEnvio: 4.95, envioGratisDesde: 40 }),
    ).toBe(0.01);
  });

  it("calla cuando el carrito ya llega justo al umbral", () => {
    expect(
      faltaParaEnvioGratis({ subtotal: 40, costeEnvio: 0, envioGratisDesde: 40 }),
    ).toBeNull();
  });

  it("calla cuando lo pasa", () => {
    expect(
      faltaParaEnvioGratis({ subtotal: 55.2, costeEnvio: 0, envioGratisDesde: 40 }),
    ).toBeNull();
  });

  it("calla cuando la tienda no tiene umbral", () => {
    expect(
      faltaParaEnvioGratis({ subtotal: 12.3, costeEnvio: 4.95, envioGratisDesde: null }),
    ).toBeNull();
  });

  it("calla con el carrito vacío, aunque haya umbral", () => {
    expect(
      faltaParaEnvioGratis({ subtotal: 0, costeEnvio: 0, envioGratisDesde: 40 }),
    ).toBeNull();
  });
});

describe("estadoEnvio", () => {
  it("un carrito vacío no dice nada del envío", () => {
    expect(estadoEnvio({ subtotal: 0, costeEnvio: 0, envioGratisDesde: 40 })).toBe("vacio");
  });

  /**
   * ⚠️⚠️ EL TEST QUE MÁS IMPORTA. «Gratis» se decide por el porte que la API dice
   * que se va a cobrar, NO por comparar el subtotal con el umbral.
   *
   * Aquí el subtotal (30 €) está por DEBAJO del umbral (40 €) y aun así el porte
   * es 0. Eso no es una incoherencia: puede ser una promoción, un cambio de
   * tarifa a mitad de sesión, o el porte congelado en `checkout_datos` mientras
   * alguien editaba la tarifa en el panel (080 §2). La pantalla tiene que decir
   * la verdad de lo que se cobra, no su propia deducción.
   */
  it("dice «gratis» cuando el porte es 0, aunque el subtotal no llegue al umbral", () => {
    expect(estadoEnvio({ subtotal: 30, costeEnvio: 0, envioGratisDesde: 40 })).toBe("gratis");
  });

  it("empuja cuando se cobra y el umbral está a la vista", () => {
    expect(estadoEnvio({ subtotal: 30, costeEnvio: 4.95, envioGratisDesde: 40 })).toBe(
      "con_umbral",
    );
  });

  it("se limita a cobrar cuando no hay umbral que ofrecer", () => {
    expect(estadoEnvio({ subtotal: 30, costeEnvio: 4.95, envioGratisDesde: null })).toBe(
      "se_cobra",
    );
  });

  /** Un umbral de 0 no debería existir (hay un CHECK en la base), pero si llega
      no puede leerse como «gratis desde 0 €» y hacer callar al aviso. */
  it("ignora un umbral de 0 en vez de tomarlo por alcanzado", () => {
    expect(estadoEnvio({ subtotal: 30, costeEnvio: 4.95, envioGratisDesde: 0 })).toBe(
      "se_cobra",
    );
  });
});
