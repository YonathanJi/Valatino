"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { BotonCarrito } from "./BotonCarrito";
import { BotonFavorito } from "./BotonFavorito";
import {
  miniaturaDe,
  vistaDeFamilia,
  type GrupoVariantes,
  varianteVisible,
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
 * nombre. Para entrar se pincha la foto o el título, y entonces se abre la ficha
 * de **la elegida**. Así se comparan cuatro sabores sin salir del catálogo ni
 * volver atrás cuatro veces, que en móvil es donde se abandona.
 */
export function ProductoCardVariantes({ grupo }: ProductoCardVariantesProps) {
  const { familia: base, tipo, productos } = grupo;
  const [elegidaId, setElegidaId] = useState<string | null>(null);
  const vista = vistaDeFamilia(grupo, elegidaId);
  /**
   * ⚠️⚠️ EL CARRITO SOLO EXISTE CUANDO YA HAY UNA ELEGIDA, y ese es el motivo de
   * que esta tarjeta no lo tuviera al principio: **antes de elegir no se sabe qué
   * sabor añadir**, y un botón que decide por su cuenta es peor que no tenerlo.
   *
   * En cuanto se elige, la ambigüedad desaparece —hay un producto concreto, con
   * su precio y su stock— y entonces añadir desde el catálogo es exactamente lo
   * mismo que en una tarjeta suelta. Lo levantó Jonathan probándolo: elegía un
   * sabor y se quedaba sin poder añadirlo como en las demás.
   */
  const elegida = productos.find((p) => p.id === elegidaId) ?? null;

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
      className="group rounded-xl border bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow"
    >
      <div className="relative">
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
            {vista.agotado && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                <span className="text-white font-semibold text-sm">Agotado</span>
              </div>
            )}
          </div>
        </Link>

        {/* ⚠️ Se guarda LA PRESENTACIÓN ELEGIDA, no la familia: los favoritos son
            ids de producto, y «Nucita» sin decir cuál no es nada que se pueda
            guardar. Por eso pide `elegida`, igual que el carrito. */}
        {elegida && (
          <BotonFavorito
            productoId={elegida.id}
            nombre={`${base} ${varianteVisible(elegida.variante)}`}
          />
        )}

        {/* Con una elegida y con stock, se añade desde aquí igual que en
            cualquier otra tarjeta. `vista.agotado` ya es el stock de LA ELEGIDA,
            no el de la familia. */}
        {elegida && !vista.agotado && (
          <BotonCarrito productoId={elegida.id} nombre={`${base} ${varianteVisible(elegida.variante)}`} />
        )}
      </div>

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
                aria-label={
                  sinStock ? `${varianteVisible(p.variante)} (agotado)` : varianteVisible(p.variante)
                }
                title={varianteVisible(p.variante)}
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
        {/**
         * Sin botón de «Elegir sabor»: las miniaturas YA son el selector y la
         * foto y el título ya entran a la ficha, así que era un tercer camino
         * para lo que ya se podía hacer de dos formas.
         *
         * ⭐ Y de paso arregla lo que chirriaba: esta tarjeta tenía un botón de
         * texto abajo mientras las de producto suelto llevaban el icono sobre la
         * foto, así que la rejilla se leía en dos idiomas. Ahora las dos acaban
         * igual —datos y precio— y la acción vive en el mismo sitio en ambas.
         */}
        <span className="block font-bold text-primary">
          {vista.esDesde ? `Desde ${formatEUR(vista.precio)}` : formatEUR(vista.precio)}
        </span>
      </div>
    </motion.article>
  );
}
