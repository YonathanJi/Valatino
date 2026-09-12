import { Suspense } from "react";
import { ProductoGrid } from "@components/storefront/ProductoGrid";
import { FiltroCategorias } from "@components/storefront/FiltroCategorias";
import { Skeleton } from "@components/ui/Skeleton";

export const metadata = {
  title: "Catálogo — Productos Latinoamericanos",
  description:
    "Descubre los mejores productos latinoamericanos enviados a toda España.",
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
          Productos originales colombianos, venezolanos y más, enviados a toda
          España.
        </p>
      </section>

      {/* Catálogo */}
      <section className="max-w-7xl mx-auto px-4 py-12">
        <h2 className="text-2xl font-semibold">Todos los productos</h2>

        {/*
          ⚠️ El filtro va justo DEBAJO del título de la sección, y ha estado en tres
          sitios en un día: entre el hero y el catálogo, luego pegado a la cabecera
          —siguiendo una captura de New Balance— y por fin aquí, que es donde lo quiso
          Jonathan al verlo. Se queda escrito porque el sitio no es indiferente: por
          debajo son los enlaces internos hacia las fichas que Google no rastrea, y
          aquí siguen estando **antes** de la rejilla en el HTML, que es lo que
          importaba de tenerlos arriba.
        */}
        <div className="mb-8 mt-4">
          <Suspense fallback={null}>
            <FiltroCategorias />
          </Suspense>
        </div>
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
