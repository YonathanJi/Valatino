import { estadoEnvio, faltaParaEnvioGratis,
  envioGratisPorCodigo,
} from "./envio";

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

// ── 083 · el código de descuento ──────────────────────────────────────────────

describe("envioGratisPorCodigo", () => {
  /**
   * ⚠️⚠️ ES LO QUE DISTINGUE DOS «GRATIS» QUE SE DICEN DISTINTO: uno es un logro del
   * carrito («ya tienes envío gratis») y el otro del código («te ahorras 3,40 € con
   * tu código»). Y se decide con lo que dice la API, no comparando el subtotal con el
   * umbral — deducirlo sería aplicar aquí la regla del porte.
   */
  it("gratis por CÓDIGO cuando la API dice cuánto ahorra", () => {
    expect(
      envioGratisPorCodigo({
        subtotal: 15,
        costeEnvio: 0,
        envioGratisDesde: 30,
        envioDescontado: 3.4,
      }),
    ).toBe(true);
  });

  it("gratis por UMBRAL no es gratis por código", () => {
    // 35 € pasa de 30, así que el porte es 0 por el carrito y no por ningún código.
    expect(
      envioGratisPorCodigo({ subtotal: 35, costeEnvio: 0, envioGratisDesde: 30 }),
    ).toBe(false);
  });

  it("un código sobre un carrito que YA tenía envío gratis no ahorra nada", () => {
    // ⚠️ Aquí `envioDescontado` es 0 porque el código no está ahorrando: decir «te
    // ahorras 3,40 €» sería mentirle al cliente.
    expect(
      envioGratisPorCodigo({
        subtotal: 35,
        costeEnvio: 0,
        envioGratisDesde: 30,
        envioDescontado: 0,
      }),
    ).toBe(false);
  });

  /**
   * ⚠️⚠️ ESTOS DOS CASOS SON LOS ÚNICOS QUE DISTINGUEN «leer lo que dice la API» de
   * «deducirlo comparando el subtotal con el umbral», y hubo que añadirlos porque los
   * cuatro de arriba daban lo MISMO con las dos implementaciones. Sin ellos el test
   * salía en verde con la regla del porte aplicada aquí, que es justo lo que este
   * fichero tiene prohibido.
   */
  it("una tienda que NO cobra envío no está regalando nada por código", () => {
    // `envio_coste = 0` en ajustes: `coste_envio_de` devuelve 0 para cualquier
    // subtotal y no hay código de por medio. Fue el estado de esta tienda durante
    // meses, hasta que se puso la tarifa el 22/08.
    //
    // Deduciéndolo del umbral esto saldría `true` —15 < 30— y la pantalla diría «te
    // ahorras» un porte que nadie iba a cobrar.
    expect(
      envioGratisPorCodigo({
        subtotal: 15,
        costeEnvio: 0,
        envioGratisDesde: 30,
        envioDescontado: 0,
      }),
    ).toBe(false);
  });

  it("sin umbral configurado, un código de envío gratis sigue siendo un código", () => {
    // Deduciéndolo del umbral esto saldría `false` —no hay umbral que comparar— y el
    // ahorro real del código no se enseñaría.
    expect(
      envioGratisPorCodigo({
        subtotal: 15,
        costeEnvio: 0,
        envioGratisDesde: null,
        envioDescontado: 3.4,
      }),
    ).toBe(true);
  });

  it("si se cobra porte, no es gratis por nada", () => {
    expect(
      envioGratisPorCodigo({
        subtotal: 15,
        costeEnvio: 3.4,
        envioGratisDesde: 30,
        envioDescontado: 0,
      }),
    ).toBe(false);
  });
});

describe("el umbral se mide sobre el subtotal BRUTO", () => {
  /**
   * ⚠️⚠️ ES LA MISMA REGLA QUE APLICA LA BASE (083 §0.5), y aquí importa porque si la
   * pantalla midiera sobre el neto diría «te faltan 6,00» mientras `coste_envio_de`
   * ya está dando el envío gratis. El cliente añadiría 6 € que no le sirven de nada.
   *
   * `subtotal` es el bruto y el descuento viaja aparte a propósito: este fichero no
   * puede restarlo ni queriendo.
   */
  it("un carrito de 30 con un código del −20 % sigue teniendo envío gratis", () => {
    // La API ya devolvió costeEnvio 0 midiendo sobre 30, no sobre 24.
    expect(
      estadoEnvio({ subtotal: 30, costeEnvio: 0, envioGratisDesde: 30 }),
    ).toBe("gratis");
    expect(faltaParaEnvioGratis({ subtotal: 30, costeEnvio: 0, envioGratisDesde: 30 })).toBeNull();
  });

  it("y a 29 le sigue faltando 1, con código o sin él", () => {
    expect(
      faltaParaEnvioGratis({ subtotal: 29, costeEnvio: 3.4, envioGratisDesde: 30 }),
    ).toBe(1);
  });
});
