"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import type { Producto } from "@valatino/types";
import { Button } from "@components/ui/button";
import { useCarrito } from "@lib/hooks/useCarrito";
import { formatEUR } from "@lib/utils";

interface ProductoCardProps {
  producto: Producto;
}

export function ProductoCard({ producto }: ProductoCardProps) {
  const { addItem, isLoading } = useCarrito();
  const imagenPrincipal = producto.imagenes[0] ?? "/placeholder.png";
  const agotado = producto.stock_disponible <= 0;

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
      className="group rounded-xl border bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow"
    >
      <Link href={`/productos/${producto.slug ?? producto.id}`}>
        <div className="relative aspect-square overflow-hidden bg-muted">
          <Image
            src={imagenPrincipal}
            alt={producto.nombre}
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

      <div className="p-3 space-y-2">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">
          {producto.categoria}
        </p>
        <Link href={`/productos/${producto.slug ?? producto.id}`}>
          <h3 className="font-medium text-sm leading-tight hover:text-primary transition-colors line-clamp-2">
            {producto.nombre}
          </h3>
        </Link>
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold text-primary">{formatEUR(Number(producto.precio))}</span>
          <Button
            size="sm"
            disabled={agotado || isLoading}
            onClick={() => addItem(producto.id, 1)}
            className="text-xs h-8"
          >
            {agotado ? "Agotado" : "+ Carrito"}
          </Button>
        </div>
      </div>
    </motion.article>
  );
}
