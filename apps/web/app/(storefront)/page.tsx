import { Suspense } from "react";
import { ProductoGrid } from "@components/storefront/ProductoGrid";
import { FiltroCategorias } from "@components/storefront/FiltroCategorias";
import { Skeleton } from "@components/ui/Skeleton";

export const metadata = {
  title: "Catálogo — Productos Latinoamericanos",
  description: "Descubre los mejores productos latinoamericanos enviados a toda España.",
  /**
   * El canonical va aquí, en la portada, y NO en el layout raíz: desde el layout
   * lo heredarían `/carrito`, `/checkout`, `/login` y las dos legales, y las cinco
   * dirían ser duplicados de la portada. El porqué, largo, en `app/layout.tsx`.
   */
  alternates: { canonical: "/" },
};

export default function StorefrontPage() {
  return (
    <main className="min-h-screen bg-background">
      {/* Hero */}
      <section className="py-16 px-4 text-center bg-gradient-to-b from-primary/5 to-background">
        <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          Sabores de <span className="text-primary">Latinoamérica</span>
        </h1>
        <p className="mt-4 text-lg text-muted-foreground max-w-xl mx-auto">
          Productos originales colombianos, venezolanos y más, enviados a toda España.
        </p>
      </section>

      {/*
        El filtro por categoría, entre el hero y el catálogo.
        ⚠️ Va AQUÍ ARRIBA a propósito y no en el pie: por debajo son enlaces internos
        hacia las fichas que Google no rastrea (13 de 34 el 12/09), y un enlace al
        principio del HTML pesa más que uno al final. Para el cliente es además donde
        se espera encontrar un filtro. En la portada no hay ninguna activa: el chip
        «Todas» sale marcado, que es «sin filtro».
      */}
      <Suspense fallback={null}>
        <FiltroCategorias />
      </Suspense>

      {/* Catálogo */}
      <section className="max-w-7xl mx-auto px-4 py-12">
        <h2 className="text-2xl font-semibold mb-8">Todos los productos</h2>
        <Suspense fallback={<CatalogoSkeleton />}>
          <ProductoGrid />
        </Suspense>
      </section>
    </main>
  );
}

function CatalogoSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-64 rounded-xl" />
      ))}
    </div>
  );
}
