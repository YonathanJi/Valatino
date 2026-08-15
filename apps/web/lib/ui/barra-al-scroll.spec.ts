import { ALTURA_BARRA, UMBRAL, debeRevelar, decidirOculta } from "./barra-al-scroll";

/**
 * Las cuatro reglas de la barra que se esconde al bajar. Cada una está aquí
 * porque sin ella el efecto se siente roto de una forma distinta.
 */
describe("decidirOculta", () => {
  describe("bajando y subiendo", () => {
    it("bajando se esconde", () => {
      expect(decidirOculta({ y: 400, yPrevio: 300, oculta: false })).toBe(true);
    });

    it("subiendo vuelve", () => {
      expect(decidirOculta({ y: 300, yPrevio: 400, oculta: true })).toBe(false);
    });

    it("bajando estando ya escondida, sigue escondida", () => {
      expect(decidirOculta({ y: 900, yPrevio: 800, oculta: true })).toBe(true);
    });
  });

  describe("arriba del todo", () => {
    /**
     * ⚠️ El primer golpe de rueda no puede llevarse la cabecera: en una página
     * corta no quedaría scroll de vuelta con el que recuperarla.
     */
    it("no se esconde aunque el gesto sea hacia abajo", () => {
      expect(decidirOculta({ y: 40, yPrevio: 0, oculta: false })).toBe(false);
    });

    it("y si venía escondida, reaparece al llegar arriba", () => {
      expect(decidirOculta({ y: 10, yPrevio: 500, oculta: true })).toBe(false);
    });

    it("justo en el límite todavía se ve; un píxel más abajo ya puede esconderse", () => {
      expect(decidirOculta({ y: ALTURA_BARRA, yPrevio: 0, oculta: false })).toBe(false);
      expect(decidirOculta({ y: ALTURA_BARRA + 1, yPrevio: 0, oculta: false })).toBe(true);
    });
  });

  describe("el umbral, que es lo que evita el parpadeo", () => {
    /**
     * Un trackpad y la inercia de un móvil emiten decenas de eventos con saltos
     * de uno o dos píxeles que cambian de signo. Sin umbral, la cabecera entra y
     * sale varias veces por segundo sin que nadie haya cambiado de dirección.
     */
    it("un temblor hacia abajo no la esconde", () => {
      expect(decidirOculta({ y: 403, yPrevio: 400, oculta: false })).toBe(false);
    });

    it("un temblor hacia arriba no la devuelve", () => {
      expect(decidirOculta({ y: 397, yPrevio: 400, oculta: true })).toBe(true);
    });

    it("justo en el umbral ya cuenta", () => {
      expect(decidirOculta({ y: 400 + UMBRAL, yPrevio: 400, oculta: false })).toBe(true);
    });

    it("un píxel por debajo del umbral todavía no", () => {
      expect(decidirOculta({ y: 400 + UMBRAL - 1, yPrevio: 400, oculta: false })).toBe(false);
    });
  });

  describe("el rebote de iOS", () => {
    /**
     * ⚠️ Al estirar la página hacia abajo estando arriba, Safari devuelve
     * `scrollY` NEGATIVO. Sin normalizar, la vuelta de −60 a 0 se lee como «está
     * bajando» y la barra se esconde justo con el gesto que pedía verla.
     */
    it("un scroll negativo no esconde nada", () => {
      expect(decidirOculta({ y: -60, yPrevio: 0, oculta: false })).toBe(false);
    });

    it("volver del rebote a cero tampoco cuenta como bajar", () => {
      expect(decidirOculta({ y: 0, yPrevio: -60, oculta: false })).toBe(false);
    });

    /**
     * Y el caso feo: rebote hacia arriba estando en mitad de la página (Safari
     * también lo hace al final del documento). Se normaliza a 0 y por tanto
     * queda por debajo de la altura de la barra: se ve.
     */
    it("un rebote desde el fondo devuelve la barra", () => {
      expect(decidirOculta({ y: -20, yPrevio: 2000, oculta: true })).toBe(false);
    });
  });
});

/**
 * La barra vuelve cuando entra algo al carrito. El aviso se va en dos segundos;
 * la prueba de que el pedido crecio es el numero del carrito, que vive en la
 * barra que se acaba de esconder.
 */
describe("debeRevelar", () => {
  it("vuelve cuando el contador sube", () => {
    expect(debeRevelar(0, 1)).toBe(true);
    expect(debeRevelar(3, 5)).toBe(true);
  });

  /**
   * ⚠️ La primera lectura es la CARGA del carrito, no una compra. Un cliente que
   * vuelve con tres cosas dentro pasa de nada a 3 al hidratar la pagina, y sin
   * esta guarda la barra aparecería sola por algo que hizo la semana pasada.
   */
  it("la primera lectura no cuenta, aunque venga con artículos", () => {
    expect(debeRevelar(null, 3)).toBe(false);
    expect(debeRevelar(null, 0)).toBe(false);
  });

  it("quitar algo no la devuelve", () => {
    // Se quita desde el carrito, donde la barra no estorba y nadie necesita
    // que reaparezca.
    expect(debeRevelar(3, 1)).toBe(false);
    expect(debeRevelar(1, 0)).toBe(false);
  });

  it("sin cambio no pasa nada", () => {
    expect(debeRevelar(2, 2)).toBe(false);
  });
});
