/**
 * Cuándo se esconde la barra de arriba al hacer scroll.
 *
 * Bajando desaparece, subiendo vuelve. Suena a una línea —«si bajas, ocúltala»—
 * y no lo es: escrita así, la barra parpadea con el temblor del trackpad, se
 * esconde en cuanto tocas la rueda estando arriba del todo, y en el iPhone
 * desaparece al estirar la página hacia abajo, que es justo el gesto con el que
 * la gente quiere ver la cabecera.
 *
 * Por eso está aquí y no dentro del componente: son cuatro reglas y cada una
 * tiene su prueba. La web no tiene tests de componentes, así que lo que se quede
 * en el `useEffect` se queda sin red.
 */

/** Lo que mide la barra (`h-16`). Por debajo de esto no se esconde nunca. */
export const ALTURA_BARRA = 64;

/**
 * Movimiento mínimo para hacer caso, en píxeles.
 *
 * ⚠️ Sin esto la barra parpadea. Un trackpad y el desplazamiento por inercia de
 * un móvil emiten decenas de eventos con saltos de uno o dos píxeles que cambian
 * de signo, así que la cabecera entraría y saldría varias veces por segundo sin
 * que nadie haya cambiado de dirección.
 */
export const UMBRAL = 8;

export interface EstadoScroll {
  /** Dónde está el scroll ahora. */
  y: number;
  /** Dónde estaba en la lectura anterior. */
  yPrevio: number;
  /** Si la barra está escondida ahora mismo. */
  oculta: boolean;
}

/**
 * Devuelve si la barra debe quedar escondida. Pura: mismas entradas, misma
 * respuesta, y ninguna referencia a `window`.
 */
export function decidirOculta({ y, yPrevio, oculta }: EstadoScroll): boolean {
  /**
   * ⚠️ EL REBOTE DE iOS DA UN `scrollY` NEGATIVO. Al estirar la página hacia
   * abajo estando arriba, Safari devuelve valores por debajo de cero; sin
   * normalizar, el salto de −60 a 0 se lee como «está bajando» y la barra se
   * esconde justo cuando el gesto pedía verla.
   */
  const actual = Math.max(0, y);
  const anterior = Math.max(0, yPrevio);

  /**
   * ⚠️ ARRIBA DEL TODO NO SE ESCONDE NUNCA, aunque el gesto sea hacia abajo. Si
   * no, el primer golpe de rueda se lleva la cabecera y en una página corta no
   * queda scroll de vuelta con el que recuperarla.
   */
  if (actual <= ALTURA_BARRA) return false;

  const delta = actual - anterior;

  // Temblor: se conserva lo que hubiera. Devolver `false` aquí haría que la
  // barra reapareciera sola cada vez que el dedo se para.
  if (Math.abs(delta) < UMBRAL) return oculta;

  return delta > 0;
}
