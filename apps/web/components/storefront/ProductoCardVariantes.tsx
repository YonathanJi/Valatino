"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  etiquetaVariantes,
  miniaturaDe,
  vistaDeFamilia,
  type GrupoVariantes,
} from "@lib/productos/variantes";
import { formatEUR } from "@lib/utils";

interface ProductoCardVariantesProps {
  grupo: GrupoVariantes;
}

/**
 * Tarjeta de catálogo para una familia con varias presentaciones: una foto
 * grande, la tira de miniaturas de sus hermanas y acceso a la ficha.
 *
 * El título es la **familia declarada** (`Quipitos Pops`), no un trozo del
 * nombre: los nombres reales son los del negocio («Quipitos Pops Caja 24
 * Unidades») y no tienen por qué compartir prefijo.
 *
 * ⚠️⚠️ **LAS DECISIONES DE QUÉ SE ENSEÑA NO ESTÁN AQUÍ**, están en
 * `vistaDeFamilia`. La web no tiene tests de componentes, así que una regla
 * escrita en el JSX es una regla sin red; ahí son cuatro y cada una tiene su
 * prueba. Este fichero pinta.
 *
 * ⚠️ **Elegir una miniatura NO navega**, cambia la tarjeta: foto, precio y
 * nombre. Para entrar se pincha la foto, el título o el botón, y entonces se
 * abre la ficha de **la elegida**. Así se comparan cuatro sabores sin salir del
 * catálogo ni volver atrás cuatro veces, que en móvil es donde se abandona.
 */
export function ProductoCardVariantes({ grupo }: ProductoCardVariantesProps) {
  const { familia: base, tipo, productos } = grupo;
  const [elegidaId, setElegidaId] = useState<string | null>(null);
  const vista = vistaDeFamilia(grupo, elegidaId);

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
      className="group rounded-xl border bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow"
    >
      <Link href={vista.href}>
        <div className="relative aspect-square overflow-hidden bg-muted">
          <Image
            src={vista.imagen}
            alt={vista.alt}
            unoptimized={vista.imagen.endsWith(".svg")}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          />
          {/* Dice el EJE, que es lo único que las fotos no pueden decir: cuatro
              miniaturas no aclaran si lo que cambia es el sabor o el tamaño. */}
          <span className="absolute left-2 top-2 rounded-full bg-background/90 px-2.5 py-0.5 text-xs font-medium border">
            {etiquetaVariantes(tipo, productos.length)}
          </span>
          {vista.agotado && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <span className="text-white font-semibold text-sm">Agotado</span>
            </div>
          )}
        </div>
      </Link>

      <div className="p-3 space-y-2">
        {/**
         * La tira. Son BOTONES y no enlaces: no llevan a ninguna parte, cambian
         * lo que hay encima. Un enlace que no navega es de las cosas que rompen
         * el clic central y el lector de pantalla a la vez.
         */}
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Elegir ${tipo}`}>
          {productos.map((p) => {
            const activa = p.id === elegidaId;
            const sinStock = p.stock_disponible <= 0;
            const miniatura = miniaturaDe(p);

            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setElegidaId(p.id)}
                aria-pressed={activa}
                /**
                 * ⚠️ El nombre va en el BOTÓN y la imagen lleva `alt=""`. Con las
                 * dos etiquetadas, un lector de pantalla leería «Fresa, Fresa».
                 * Y el «(agotado)» va aquí porque el aspa gris no se oye.
                 */
                aria-label={sinStock ? `${p.variante} (agotado)` : p.variante}
                title={p.variante}
                className={`relative h-10 w-10 shrink-0 overflow-hidden rounded-md border transition-all ${
                  activa
                    ? "border-primary ring-2 ring-primary ring-offset-1"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <Image
                  src={miniatura}
                  alt=""
                  unoptimized={miniatura.endsWith(".svg")}
                  width={40}
                  height={40}
                  className="h-full w-full object-cover"
                />
                {/* La agotada se apaga pero NO se esconde: existe, y saber que
                    existe es lo que hace que alguien vuelva a por ella. */}
                {sinStock && <span className="absolute inset-0 bg-background/60" />}
              </button>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground uppercase tracking-wide">
          {productos[0]!.categoria}
        </p>
        <Link href={vista.href}>
          <h3 className="font-medium text-sm leading-tight hover:text-primary transition-colors line-clamp-2">
            {base}
          </h3>
        </Link>
        <p className="text-xs text-muted-foreground line-clamp-1">{vista.subtitulo}</p>
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold text-primary">
            {vista.esDesde ? `Desde ${formatEUR(vista.precio)}` : formatEUR(vista.precio)}
          </span>
          <Link
            href={vista.href}
            className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors"
          >
            {elegidaId ? "Ver" : `Elegir ${tipo}`}
          </Link>
        </div>
      </div>
    </motion.article>
  );
}
