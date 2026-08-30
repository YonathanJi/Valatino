"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { BotonCarrito } from "./BotonCarrito";
import { BotonFavorito } from "./BotonFavorito";
import {
  miniaturaDe,
  representanteDe,
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
  /**
   * ⚠️⚠️ SE PRESELECCIONA LA REPRESENTANTE, y antes esto empezaba en `null`.
   *
   * Lo levantó Jonathan el 30/08: en las siete tarjetas de familia el carrito no
   * aparecía hasta elegir una presentación, y al lado de las demás se veía como si
   * faltara algo.
   *
   * ⭐ Se arregla preseleccionando y NO enseñando el carrito sobre una familia sin
   * elegir, que era la otra salida y es la mala: sin elegir, la tarjeta decía «Desde
   * 0,62 €» y enumeraba los cuatro sabores —o sea, **a propósito no se comprometía**—
   * y un carrito ahí se habría comprometido por el cliente. En Pony Malta eso es
   * meterle la unidad de 1,50 € a quien venía por la caja de 36 €.
   *
   * Preseleccionando, la tarjeta SÍ se compromete: foto, precio y nombre son los de
   * una presentación concreta, y el carrito añade exactamente lo que se está viendo.
   *
   * ⚠️ Lo que cuesta: se pierde el «Desde …» y la lista de sabores del subtítulo. En
   * este catálogo el «Desde» solo aplicaba a las familias de FORMATO —en las de sabor
   * todas valen igual— y la lista de presentaciones sigue estando en las miniaturas.
   */
  const [elegidaId, setElegidaId] = useState<string>(() => representanteDe(grupo).id);
  const vista = vistaDeFamilia(grupo, elegidaId);
  /**
   * Siempre hay una: la preseleccionada o la que se haya tocado. La caída al
   * representante es defensiva —un id que no pertenece a la familia— y es lo que
   * permite que de aquí abajo no haya que tratar el caso «ninguna».
   *
   * ⚠️ Esta tarjeta llegó a NO tener carrito, y luego a tenerlo solo tras elegir. Las
   * dos veces el problema era el mismo: quién decide qué se añade. Ahora lo decide la
   * tarjeta a la vista, y por eso el botón puede estar desde el principio.
   */
  const elegida = productos.find((p) => p.id === elegidaId) ?? representanteDe(grupo);

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

        {/* ⚠️⚠️ EL CORAZÓN SALE SIEMPRE, se haya elegido presentación o no, y ahí se
            aparta del carrito a propósito. El carrito espera porque añadir el sabor
            equivocado sí es un problema; guardar **lo que tienes delante** no tiene
            ninguna ambigüedad: es el mismo producto al que lleva la foto. Antes
            había que elegir primero y el corazón parecía que no estaba. */}
        <BotonFavorito productoId={vista.visibleId} nombre={vista.alt} />

        {/* Con una elegida y con stock, se añade desde aquí igual que en
            cualquier otra tarjeta. `vista.agotado` ya es el stock de LA ELEGIDA,
            no el de la familia. */}
        {!vista.agotado && (
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
