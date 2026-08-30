"use client";

import { Heart } from "lucide-react";
import { useFavoritos } from "@lib/hooks/useFavoritos";

interface BotonFavoritoProps {
  productoId: string;
  /**
   * Para el `aria-label`. En una rejilla de veinte tarjetas, un «Guardar en
   * favoritos» a secas deja a un lector de pantalla leyendo veinte botones
   * idénticos sin decir de qué producto habla. Mismo motivo que en `BotonCarrito`.
   */
  nombre: string;
}

/**
 * El corazón que guarda un producto.
 *
 * Es **gemelo de `BotonCarrito`** y hereda de él todo lo que allí costó averiguar, así
 * que si se toca uno hay que mirar el otro:
 *
 * ⚠️ **Se posiciona solo** (`absolute`) en la variante de tarjeta, así que el
 * contenedor tiene que ser `relative`. Va aquí y no en cada tarjeta para que no acabe
 * en un sitio distinto en cada una.
 *
 * ⚠️⚠️ **NO PUEDE IR DENTRO DEL `<Link>` de la tarjeta.** Un `<button>` dentro de un
 * `<a>` es HTML inválido y el clic haría las dos cosas: guardar Y navegar a la ficha.
 *
 * ⚠️⚠️ **VA ARRIBA A LA DERECHA Y EL CARRITO ABAJO.** No es estética: son dos botones
 * flotando sobre la misma foto y en móvil, con el catálogo a dos columnas, se tocarían.
 *
 * ⚠️ En móvil el DIBUJO se arrincona pero el cuadro de 40 px **no se encoge**, que es
 * justo donde hay dedos. Y el halo blanco no es decoración: un icono suelto sobre la
 * foto de un producto oscuro desaparece.
 *
 * ⚠️⚠️ Y LO DE LA HIDRATACIÓN, QUE ES LO MÁS FÁCIL DE ROMPER: mientras `listo` es
 * falso el corazón se pinta VACÍO. `localStorage` no existe en el servidor, así que
 * pintarlo relleno en el primer render sería decir en el HTML del servidor algo
 * distinto de lo que dice el navegador — y eso es un aviso de desajuste de
 * hidratación. Ver la cabecera de `useFavoritos`.
 */
export function BotonFavorito({ productoId, nombre }: BotonFavoritoProps) {
  const { esFavorito, alternarFavorito, listo } = useFavoritos();

  const guardado = listo && esFavorito(productoId);

  /**
   * ⚠️ HUBO UNA VARIANTE `linea` para colocarlo al lado del precio en la ficha, y se
   * quitó el 30/08 al mover el corazón también allí a la esquina de la foto: se quedó
   * sin nadie que la usara. Un camino muerto que nadie recorre es de las cosas que
   * este proyecto ya se ha encontrado en verde probando nada (ver la 077).
   */
  const posicion =
    "absolute top-0 right-0 sm:top-2 sm:right-2 items-start justify-end p-1 sm:items-center sm:justify-center sm:p-0";

  return (
    <button
      type="button"
      onClick={() => alternarFavorito(productoId)}
      /** Es un interruptor, no una acción: `aria-pressed` y no solo la etiqueta. */
      aria-pressed={guardado}
      aria-label={
        guardado ? `Quitar ${nombre} de favoritos` : `Guardar ${nombre} en favoritos`
      }
      title={guardado ? "Quitar de favoritos" : "Guardar en favoritos"}
      /**
       * ⚠️ `text-foreground` SIEMPRE, guardado o no. Lo pidió Jonathan: relleno
       * NEGRO, no rojo. Y `text-foreground` y no `text-primary` aunque en la tienda
       * den el mismo negro: la paleta de `:root` tiene el primary NARANJA, así que
       * esto pintado fuera del área de cliente sacaría un corazón naranja. Misma
       * trampa que documenta `BotonCarrito`.
       */
      className={`inline-flex h-10 w-10 shrink-0 rounded-full text-foreground transition-transform hover:scale-110 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${posicion}`}
    >
      {/**
       * ⚠️ El DIBUJO se encoge y adelgaza —lo pidió Jonathan— pero el cuadro de
       * 40 px de arriba NO. Es lo que se toca con el dedo, y encogerlo para ganar
       * unos píxeles sería pagar el ajuste justo donde el botón se usa peor.
       *
       * ⚠️ El halo blanco se queda: un icono de línea fina sobre la foto de un
       * producto oscuro desaparece, y cuanto más fino, más.
       */}
      <Heart
        className="h-[15px] w-[15px] sm:h-[17px] sm:w-[17px] [filter:drop-shadow(0_0_2px_rgb(255_255_255/0.9))]"
        strokeWidth={1.5}
        // Relleno cuando está guardado: es lo que se ve de un vistazo en una rejilla.
        fill={guardado ? "currentColor" : "none"}
        aria-hidden="true"
      />
    </button>
  );
}
