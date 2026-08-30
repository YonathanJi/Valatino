"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import type { Producto } from "@valatino/types";
import { BotonCarrito } from "./BotonCarrito";
import { BotonFavorito } from "./BotonFavorito";
import { formatEUR } from "@lib/utils";

interface ProductoCardProps {
  producto: Producto;
}

export function ProductoCard({ producto }: ProductoCardProps) {
  const imagenPrincipal = producto.imagenes[0] ?? "/placeholder.png";
  const agotado = producto.stock_disponible <= 0;
  const href = `/productos/${producto.slug ?? producto.id}`;

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
      className="group rounded-xl border bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow"
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
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
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
