import { Suspense } from "react";
import { ProductoGrid } from "@components/storefront/ProductoGrid";
import { Skeleton } from "@components/ui/Skeleton";

export const metadata = {
  title: "Catálogo — Productos Latinoamericanos",
  description: "Descubre los mejores productos latinoamericanos enviados a toda España.",
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
