"use client";

import type { ReactNode } from "react";
import { Navbar } from "@components/storefront/Navbar";
import { CarritoProvider } from "@lib/hooks/useCarrito";

/**
 * Shell del área de tienda (storefront y /cuenta): navbar con carrito y
 * provider del carrito. Las áreas internas (/admin, /backoffice) NO lo usan —
 * tienen su propia visual sin nada de cliente.
 */
export function StorefrontShell({ children }: { children: ReactNode }) {
  return (
    <CarritoProvider>
      <Navbar />
      {children}
    </CarritoProvider>
  );
}
