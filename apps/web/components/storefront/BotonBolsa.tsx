"use client";

import { useState } from "react";
import { ShoppingBag } from "lucide-react";
import { useCarrito } from "@lib/hooks/useCarrito";

interface BotonBolsaProps {
  productoId: string;
  /**
   * Para el `aria-label`. En una rejilla de veinte tarjetas, un «Añadir al
   * carrito» a secas deja a un lector de pantalla leyendo veinte botones
   * idénticos sin decir de qué producto habla.
   */
  nombre: string;
}

/**
 * La bolsa que añade una unidad al carrito desde el catálogo.
 *
 * ⚠️⚠️ **VIVE AQUÍ Y NO EN CADA TARJETA** porque lo usan las dos: la de producto
 * suelto y la de familia (esta última **solo cuando ya hay una presentación
 * elegida**, que es cuando se sabe qué se añade). Copiarlo en las dos habría
 * dejado dos botones que se parecen hasta el día que alguien arregle uno —el
 * mismo patrón que costó la migración 074 con el formato del número de factura.
 *
 * ⚠️ **Se posiciona solo** (`absolute bottom-2 right-2`), así que el contenedor
 * de la imagen tiene que ser `relative`. Va aquí dentro a propósito: si cada
 * tarjeta pusiera su posición, la bolsa acabaría en un sitio distinto en cada
 * una y nadie sabría cuál es la buena.
 *
 * ⚠️⚠️ **Y NO PUEDE IR DENTRO DEL `<Link>` de la tarjeta.** Un `<button>` dentro
 * de un `<a>` es HTML inválido y el clic haría las dos cosas: añadir al carrito
 * Y navegar a la ficha.
 */
export function BotonBolsa({ productoId, nombre }: BotonBolsaProps) {
  const { addItem, isLoading } = useCarrito();
  /**
   * ⚠️ Pendiente propio, y no el `isLoading` del carrito (que es el de su carga
   * inicial). `addItem` no lo trae, así que sin esto dos toques seguidos —y un
   * icono en un móvil los invita— metían dos unidades donde se pidió una.
   */
  const [anadiendo, setAnadiendo] = useState(false);

  const anadir = async () => {
    if (anadiendo) return;
    setAnadiendo(true);
    try {
      // No lanza: avisa con un toast por dentro, incluido el 409 de stock.
      await addItem(productoId, 1);
    } finally {
      setAnadiendo(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void anadir()}
      disabled={isLoading || anadiendo}
      aria-label={`Añadir ${nombre} al carrito`}
      title="Añadir al carrito"
      /**
       * Sin fondo: solo el icono. El cuadro de 40 px sigue estando aunque no se
       * vea, porque es el área que se toca con el dedo — un icono de 20 px suelto
       * es un blanco imposible en un móvil.
       *
       * ⚠️ `text-foreground` y NO `text-primary`, aunque en el storefront los dos
       * den el mismo negro: la paleta `.theme-cliente` es de grises pero la de
       * `:root` tiene el primary NARANJA, así que esto pintado fuera del área de
       * cliente sacaría una bolsa naranja.
       *
       * ⚠️⚠️ EN MÓVIL VA PEGADA A LA ESQUINA (`bottom-0 right-0`) Y EN PANTALLA
       * GRANDE SEPARADA (`sm:bottom-2 sm:right-2`). No es un capricho de maqueta:
       * el catálogo va a DOS columnas en móvil, así que la misma separación de
       * 8 px cae mucho más adentro de una tarjeta pequeña y la bolsa termina
       * encima del producto. `sm:` es el mismo corte en el que la rejilla pasa a
       * tres columnas, o sea que las dos cosas cambian a la vez.
       *
       * El cuadro de 40 px NO se toca al bajar de tamaño: es lo que se toca con
       * el dedo, y encogerlo en móvil sería empeorarlo justo donde se usa el
       * dedo. Lo que se mueve es dónde se ancla, no cuánto mide.
       */
      className="absolute bottom-0 right-0 sm:bottom-2 sm:right-2 inline-flex h-10 w-10 items-center justify-center rounded-full text-foreground transition-transform hover:scale-110 active:scale-95 disabled:opacity-40 disabled:hover:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {/**
       * ⚠️ El halo blanco es lo único que queda del fondo, y hace falta: un icono
       * negro suelto sobre la foto de un producto oscuro desaparece. En las fotos
       * claras no se nota; en una oscura es lo que salva el botón.
       */}
      <ShoppingBag
        className="h-5 w-5 [filter:drop-shadow(0_0_2px_rgb(255_255_255/0.9))]"
        aria-hidden="true"
      />
    </button>
  );
}
