"use client";

import { useCallback, useEffect, useState } from "react";
import { decidirOculta } from "@lib/ui/barra-al-scroll";

/**
 * Escucha el scroll y dice si la barra de arriba debe estar escondida.
 *
 * Las reglas viven en `decidirOculta`, que es pura y tiene sus tests. Aquí solo
 * está el cableado con el navegador, que es lo que no se puede probar sin un
 * navegador.
 *
 * ⚠️ **El listener es `passive`**: sin eso el navegador tiene que esperar por si
 * la función llama a `preventDefault`, y eso se nota como scroll pegajoso en
 * móvil — justo donde este efecto se usa más.
 *
 * ⚠️⚠️ **Y la lectura va dentro de un `requestAnimationFrame`.** El evento de
 * scroll se dispara decenas de veces por fotograma, y leer `window.scrollY` es
 * lo que obliga al navegador a recalcular la maqueta. Sin la compuerta, un dedo
 * bajando por la pantalla provoca cientos de recálculos por segundo; con ella,
 * uno por fotograma como mucho.
 */
export function useBarraOculta(): { oculta: boolean; revelar: () => void } {
  const [oculta, setOculta] = useState(false);

  /**
   * Para que algo que pasa fuera del scroll pueda devolver la barra: hoy, que el
   * carrito crezca. El siguiente gesto hacia abajo la vuelve a esconder, que es
   * lo que se quiere — se enseña el número, no se ancla la barra.
   */
  const revelar = useCallback(() => setOculta(false), []);

  useEffect(() => {
    let yPrevio = window.scrollY;
    let pendiente = false;

    const leer = () => {
      pendiente = false;
      const y = window.scrollY;
      /**
       * ⚠️ `yPrevio` se actualiza FUERA del actualizador de estado. React puede
       * llamarlo dos veces (en desarrollo lo hace a propósito), y como el
       * actualizador es puro eso da igual — pero si `yPrevio` se moviera ahí
       * dentro, la segunda llamada compararía contra un valor ya pisado y el
       * gesto se leería al revés.
       */
      setOculta((actual) => decidirOculta({ y, yPrevio, oculta: actual }));
      yPrevio = y;
    };

    const alScroll = () => {
      if (pendiente) return;
      pendiente = true;
      requestAnimationFrame(leer);
    };

    window.addEventListener("scroll", alScroll, { passive: true });
    return () => window.removeEventListener("scroll", alScroll);
  }, []);

  return { oculta, revelar };
}
