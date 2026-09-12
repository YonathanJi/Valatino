"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import type { Producto } from "@valatino/types";
import { BotonCarrito } from "./BotonCarrito";
import { BotonFavorito } from "./BotonFavorito";
import { medidaDeFoto } from "@lib/productos/destacados";
import { formatEUR } from "@lib/utils";

interface ProductoCardProps {
  producto: Producto;
  /** Si se pinta a lo ancho en el móvil de la portada. Ver la nota de abajo. */
  grande?: boolean;
}


/**
 * ⚠️⚠️ `grande` ES SOLO PARA EL MÓVIL DE LA PORTADA, donde la tarjeta ocupa las dos
 * columnas (ver `ListaProductos` y `lib/productos/destacados.ts`). Agranda el texto y
 * —esto es lo que se olvidó al principio— le pide al navegador una foto del ancho que
 * de verdad ocupa, vía `medidaDeFoto`. De `sm` en adelante no hace nada, porque ahí la
 * tarjeta ya no es ancha.
 */

/**
 * ⚠️⚠️ LA FOTO SE QUEDA CUADRADA, Y ESTO YA SE PROBÓ AL REVÉS EL MISMO DÍA.
 *
 * La grande nació apaisada (`aspect-[16/10]`) con el argumento de que, al doble de
 * ancho, un cuadrado se comería la pantalla del móvil. Jonathan la vio en producción y
 * la tumbó —«no queda cuadrada, como era, y se ve fea»— y tenía razón por un motivo
 * que se puede medir: **las fotos del catálogo son cuadradas** (la Nucita es de
 * 1024×1024), así que encajarlas en 16/10 con `object-cover` se lleva el **37,5 %**
 * del alto, 18,75 % por arriba y otro tanto por abajo. La foto no se adaptaba al
 * hueco: se le recortaba el producto que vende.
 *
 * ⭐ Que sea más alta es justo lo que se pidió. Ocupa las dos columnas y es cuadrada,
 * o sea **cuatro veces** el área de una normal — eso es destacar. Y la rejilla se lee
 * mejor con todas las fotos de la misma forma, no peor.
 */
export function ProductoCard({ producto, grande = false }: ProductoCardProps) {
  const imagenPrincipal = producto.imagenes[0] ?? "/placeholder.png";
  const agotado = producto.stock_disponible <= 0;
  const href = `/productos/${producto.slug ?? producto.id}`;

  /**
   * ⚠️⚠️ `h-full flex flex-col` + el `mt-auto` del precio: LAS TARJETAS TIENEN QUE
   * MEDIR TODAS LO MISMO Y ACABAR IGUAL. Sin esto, una rejilla de dos columnas se ve
   * torcida en cuanto los contenidos difieren —un nombre de dos líneas, una tira de
   * presentaciones— porque cada tarjeta acaba donde acaba su contenido y los precios
   * quedan a alturas distintas.
   *
   * Se notó el 12/09 al meter la tarjeta grande: no la causaba ella, pero la hizo
   * evidente («se distorsiona todo el catálogo y no lleva un orden»). El grid ya
   * estira las celdas; lo que faltaba era que la tarjeta ocupara la celda entera y
   * repartiera por dentro.
   */
  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
      className="group flex h-full flex-col rounded-xl border bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow"
    >
      {/**
       * El `relative` vive aquí fuera y no en el contenedor de la imagen porque
       * ese recorta (`overflow-hidden`) para el zoom del hover y se comería el
       * botón. Y el botón es HERMANO del enlace, nunca hijo: ver `BotonCarrito`.
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
              sizes={medidaDeFoto(grande)}
            />
            {agotado && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                <span className="text-white font-semibold text-sm">Agotado</span>
              </div>
            )}
          </div>
        </Link>

        {/* El corazón sale SIEMPRE, agotado incluido: guardar algo que ahora no
            está es justo para lo que sirve una lista de deseos. */}
        <BotonFavorito productoId={producto.id} nombre={producto.nombre} />

        {/* Agotado: no hay carrito. El cartel ya lo dice a pantalla completa, y
            un botón apagado encima solo añade ruido a algo que no se puede
            hacer. */}
        {!agotado && <BotonCarrito productoId={producto.id} nombre={producto.nombre} />}
      </div>

      <div className="flex flex-1 flex-col p-3 space-y-2">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">
          {producto.categoria}
        </p>
        <Link href={href}>
          <h3 className={`font-medium leading-tight hover:text-primary transition-colors line-clamp-2 ${grande ? "text-base sm:text-sm" : "text-sm"}`}>
            {producto.nombre}
          </h3>
        </Link>
        <span className={`mt-auto block pt-1 font-bold text-primary ${grande ? "text-lg sm:text-base" : ""}`}>{formatEUR(Number(producto.precio))}</span>
      </div>
    </motion.article>
  );
}
