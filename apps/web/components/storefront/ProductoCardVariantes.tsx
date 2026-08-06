"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { etiquetaVariantes, type GrupoVariantes } from "@lib/productos/variantes";
import { formatEUR } from "@lib/utils";

interface ProductoCardVariantesProps {
  grupo: GrupoVariantes;
}

/**
 * Tarjeta de catálogo para una familia con varias presentaciones: una sola
 * tarjeta con el nombre de la familia y acceso a la ficha, donde se elige.
 *
 * El título es la **familia declarada** (`Quipitos Pops`), no un trozo del
 * nombre: los nombres reales son los del negocio («Quipitos Pops Caja 24
 * Unidades») y no tienen por qué compartir prefijo.
 */
export function ProductoCardVariantes({ grupo }: ProductoCardVariantesProps) {
  const { familia: base, tipo, productos } = grupo;
  const disponible = productos.find((p) => p.stock_disponible > 0);
  const representante = disponible ?? productos[0]!;
  const agotado = !disponible;
  // Imagen de familia (imagenes[1] de cualquier variante) si existe; si no,
  // la foto de la variante representante (la primera con stock)
  const imagenFamilia = productos.map((p) => p.imagenes[1]).find(Boolean);
  const imagenPrincipal = imagenFamilia ?? representante.imagenes[0] ?? "/placeholder.png";
  const href = `/productos/${representante.slug ?? representante.id}`;

  const precios = productos.map((p) => Number(p.precio));
  const precioMin = Math.min(...precios);
  const preciosVarian = Math.max(...precios) !== precioMin;

  const valores = productos.map((p) => p.variante);

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
      className="group rounded-xl border bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow"
    >
      <Link href={href}>
        <div className="relative aspect-square overflow-hidden bg-muted">
          <Image
            src={imagenPrincipal}
            alt={base}
            unoptimized={imagenPrincipal.endsWith(".svg")}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          />
          <span className="absolute left-2 top-2 rounded-full bg-background/90 px-2.5 py-0.5 text-xs font-medium border">
            {etiquetaVariantes(tipo, valores.length)}
          </span>
          {agotado && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <span className="text-white font-semibold text-sm">Agotado</span>
            </div>
          )}
        </div>
      </Link>

      <div className="p-3 space-y-2">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">
          {representante.categoria}
        </p>
        <Link href={href}>
          <h3 className="font-medium text-sm leading-tight hover:text-primary transition-colors line-clamp-2">
            {base}
          </h3>
        </Link>
        <p className="text-xs text-muted-foreground line-clamp-1">{valores.join(" · ")}</p>
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold text-primary">
            {preciosVarian ? `Desde ${formatEUR(precioMin)}` : formatEUR(precioMin)}
          </span>
          <Link
            href={href}
            className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors"
          >
            Elegir {tipo}
          </Link>
        </div>
      </div>
    </motion.article>
  );
}
