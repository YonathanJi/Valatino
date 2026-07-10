"use client";

import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { Navbar } from "@components/storefront/Navbar";
import { CarritoProvider } from "@lib/hooks/useCarrito";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <CarritoProvider>
      <Navbar />
      {children}
      <Toaster position="top-right" richColors />
    </CarritoProvider>
  );
}
