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
  /** `tarjeta` se posiciona solo sobre la foto; `linea` se coloca donde lo pongan. */
  variante?: "tarjeta" | "linea";
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
export function BotonFavorito({ productoId, nombre, variante = "tarjeta" }: BotonFavoritoProps) {
  const { esFavorito, alternarFavorito, listo } = useFavoritos();

  const guardado = listo && esFavorito(productoId);

  const posicion =
    variante === "tarjeta"
      ? "absolute top-0 right-0 sm:top-2 sm:right-2 items-start justify-end p-1 sm:items-center sm:justify-center sm:p-0"
      : "items-center justify-center";

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
      className={`inline-flex h-10 w-10 shrink-0 rounded-full transition-transform hover:scale-110 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${posicion} ${
        guardado ? "text-red-500" : "text-foreground"
      }`}
    >
      <Heart
        className="h-4 w-4 sm:h-5 sm:w-5 [filter:drop-shadow(0_0_2px_rgb(255_255_255/0.9))]"
        // Relleno cuando está guardado: es lo que se ve de un vistazo en una rejilla.
        fill={guardado ? "currentColor" : "none"}
        aria-hidden="true"
      />
    </button>
  );
}
