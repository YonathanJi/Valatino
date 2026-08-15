"use client";

import { useState } from "react";
import { ShoppingCart } from "lucide-react";
import { useCarrito } from "@lib/hooks/useCarrito";

interface BotonCarritoProps {
  productoId: string;
  /**
   * Para el `aria-label`. En una rejilla de veinte tarjetas, un «Añadir al
   * carrito» a secas deja a un lector de pantalla leyendo veinte botones
   * idénticos sin decir de qué producto habla.
   */
  nombre: string;
}

/**
 * El carrito que añade una unidad al catálogo desde la tarjeta.
 *
 * ⚠️ **El icono es `ShoppingCart`, EL MISMO QUE LA BARRA DE ARRIBA.** Antes era
 * una bolsa, y eran dos dibujos distintos para la misma idea en la misma
 * pantalla: se toca el carrito de la tarjeta y el número que sube está en el
 * carrito del menú. Si algún día se cambia uno, hay que cambiar el otro —
 * `Navbar.tsx` es el que manda.
 *
 * ⚠️⚠️ **VIVE AQUÍ Y NO EN CADA TARJETA** porque lo usan las dos: la de producto
 * suelto y la de familia (esta última **solo cuando ya hay una presentación
 * elegida**, que es cuando se sabe qué se añade). Copiarlo en las dos habría
 * dejado dos botones que se parecen hasta el día que alguien arregle uno —el
 * mismo patrón que costó la migración 074 con el formato del número de factura.
 *
 * ⚠️ **Se posiciona solo** (`absolute`), así que el contenedor de la imagen tiene
 * que ser `relative`. Va aquí dentro a propósito: si cada tarjeta pusiera su
 * posición, acabaría en un sitio distinto en cada una.
 *
 * ⚠️⚠️ **Y NO PUEDE IR DENTRO DEL `<Link>` de la tarjeta.** Un `<button>` dentro
 * de un `<a>` es HTML inválido y el clic haría las dos cosas: añadir al carrito
 * Y navegar a la ficha.
 */
export function BotonCarrito({ productoId, nombre }: BotonCarritoProps) {
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
       * Sin fondo: solo el icono.
       *
       * ⚠️ `text-foreground` y NO `text-primary`, aunque en el storefront los dos
       * den el mismo negro: la paleta `.theme-cliente` es de grises pero la de
       * `:root` tiene el primary NARANJA, así que esto pintado fuera del área de
       * cliente sacaría un carrito naranja.
       *
       * ⚠️⚠️ EN MÓVIL VA PEGADO A LA ESQUINA Y CON EL ICONO ARRINCONADO DENTRO DE
       * SU PROPIO CUADRO (`items-end justify-end p-1`), y en pantalla grande
       * centrado y separado. El motivo: el catálogo va a DOS columnas en móvil,
       * así que la misma separación cae mucho más adentro de una tarjeta pequeña
       * y el icono termina encima del producto.
       *
       * ⭐ Y ESE ES EL TRUCO QUE IMPORTA: lo que se arrincona es el DIBUJO, no el
       * botón. El cuadro de 40 px —lo que se toca con el dedo— no se encoge en
       * móvil, que es justo donde hay dedos. Encogerlo para ganar 6 px de margen
       * habría sido pagar el arreglo con el único sitio donde el botón se usa mal.
       */
      className="absolute bottom-0 right-0 sm:bottom-2 sm:right-2 inline-flex h-10 w-10 items-end justify-end p-1 sm:items-center sm:justify-center sm:p-0 rounded-full text-foreground transition-transform hover:scale-110 active:scale-95 disabled:opacity-40 disabled:hover:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {/**
       * ⚠️ El halo blanco es lo único que queda del fondo, y hace falta: un icono
       * negro suelto sobre la foto de un producto oscuro desaparece. En las fotos
       * claras no se nota; en una oscura es lo que salva el botón.
       */}
      <ShoppingCart
        className="h-4 w-4 sm:h-5 sm:w-5 [filter:drop-shadow(0_0_2px_rgb(255_255_255/0.9))]"
        aria-hidden="true"
      />
    </button>
  );
}
