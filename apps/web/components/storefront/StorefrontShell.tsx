"use client";

import type { ReactNode } from "react";
import { Navbar } from "@components/storefront/Navbar";
import { CarritoProvider } from "@lib/hooks/useCarrito";
import { FavoritosProvider } from "@lib/hooks/useFavoritos";

/**
 * Shell del área de tienda (storefront y /cuenta): navbar con carrito y
 * provider del carrito. Las áreas internas (/admin, /backoffice) NO lo usan —
 * tienen su propia visual sin nada de cliente.
 */
export function StorefrontShell({ children }: { children: ReactNode }) {
  return (
    <CarritoProvider>
      {/*
        Los favoritos van DENTRO del carrito y no al revés por una razón práctica:
        la página de favoritos añade al carrito, así que el de dentro es el que
        puede necesitar al de fuera. Al revés no hace falta.
      */}
      <FavoritosProvider>
        {/* display: contents — aplica las variables del tema gris sin crear
            una caja que altere el layout de los hijos */}
        <div className="theme-cliente contents">
          <Navbar />
          {children}
        </div>
      </FavoritosProvider>
    </CarritoProvider>
  );
}
