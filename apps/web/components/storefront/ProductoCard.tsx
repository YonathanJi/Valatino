"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { ShoppingBag } from "lucide-react";
import type { Producto } from "@valatino/types";
import { useCarrito } from "@lib/hooks/useCarrito";
import { formatEUR } from "@lib/utils";

interface ProductoCardProps {
  producto: Producto;
}

export function ProductoCard({ producto }: ProductoCardProps) {
  const { addItem, isLoading } = useCarrito();
  /**
   * ⚠️ Pendiente PROPIO de esta tarjeta, y no el `isLoading` del carrito (que es
   * el de su carga inicial). `addItem` no lo trae, así que sin esto dos toques
   * seguidos —y un botón redondo de 40 px en un móvil los invita— mandaban dos
   * altas y metían dos unidades donde el cliente pidió una.
   */
  const [anadiendo, setAnadiendo] = useState(false);
  const imagenPrincipal = producto.imagenes[0] ?? "/placeholder.png";
  const agotado = producto.stock_disponible <= 0;
  const href = `/productos/${producto.slug ?? producto.id}`;

  const anadir = async () => {
    if (anadiendo) return;
    setAnadiendo(true);
    try {
      // No lanza: avisa con un toast por dentro, incluido el 409 de stock.
      await addItem(producto.id, 1);
    } finally {
      setAnadiendo(false);
    }
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
      className="group rounded-xl border bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow"
    >
      {/**
       * ⚠️⚠️ EL BOTÓN ES HERMANO DEL ENLACE, NO VA DENTRO. Un `<button>` dentro de
       * un `<a>` es HTML inválido y además el clic haría las dos cosas: añadir al
       * carrito Y navegar a la ficha. Por eso el `relative` vive aquí fuera y no
       * en el contenedor de la imagen, que además recorta (`overflow-hidden`)
       * para el zoom del hover y se comería la bolsa.
       */}
      <div className="relative">
        <Link href={href}>
          <div className="relative aspect-square overflow-hidden bg-muted">
            <Image
              src={imagenPrincipal}
              alt={producto.nombre}
              unoptimized={imagenPrincipal.endsWith(".svg")}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-105"
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            />
            {agotado && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                <span className="text-white font-semibold text-sm">Agotado</span>
              </div>
            )}
          </div>
        </Link>

        {/**
         * Agotado: no hay bolsa. El cartel ya lo dice a pantalla completa, y un
         * botón apagado encima solo añade ruido a algo que no se puede hacer.
         *
         * ⚠️ El nombre del producto va en el `aria-label` y no un «Añadir al
         * carrito» a secas: en una rejilla de veinte tarjetas, un lector de
         * pantalla leería veinte botones idénticos sin decir de qué.
         */}
        {!agotado && (
          <button
            type="button"
            onClick={() => void anadir()}
            disabled={isLoading || anadiendo}
            aria-label={`Añadir ${producto.nombre} al carrito`}
            title="Añadir al carrito"
            className="absolute bottom-2 right-2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-all hover:bg-primary/90 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <ShoppingBag className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="p-3 space-y-2">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">
          {producto.categoria}
        </p>
        <Link href={href}>
          <h3 className="font-medium text-sm leading-tight hover:text-primary transition-colors line-clamp-2">
            {producto.nombre}
          </h3>
        </Link>
        <span className="block font-bold text-primary">{formatEUR(Number(producto.precio))}</span>
      </div>
    </motion.article>
  );
}
