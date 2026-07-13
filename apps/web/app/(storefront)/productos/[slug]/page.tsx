import Image from "next/image";
import { notFound } from "next/navigation";
import type { Producto } from "@valatino/types";
import { AddToCartButton } from "@components/storefront/AddToCartButton";
import { formatEUR } from "@lib/utils";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function getProducto(slug: string): Promise<Producto | null> {
  const res = await fetch(`${API_URL}/productos/slug/${slug}`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) return null;
  return res.json() as Promise<Producto>;
}

interface Props {
  params: { slug: string };
}

export async function generateMetadata({ params }: Props) {
  const producto = await getProducto(params.slug);
  if (!producto) return { title: "Producto no encontrado" };
  return {
    title: producto.nombre,
    description: producto.descripcion,
  };
}

export default async function ProductoPage({ params }: Props) {
  const producto = await getProducto(params.slug);
  if (!producto) notFound();

  const agotado = producto.stock_disponible <= 0;

  return (
    <main className="max-w-5xl mx-auto px-4 py-12">
      <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
        {/* Imagen */}
        <div className="relative aspect-square rounded-2xl overflow-hidden bg-muted">
          <Image
            src={producto.imagenes[0] ?? "/placeholder.png"}
            alt={producto.nombre}
            unoptimized={(producto.imagenes[0] ?? "").endsWith(".svg")}
            fill
            className="object-cover"
            priority
          />
        </div>

        {/* Información */}
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground uppercase tracking-widest">
            {producto.categoria}
          </p>
          <h1 className="text-3xl font-bold">{producto.nombre}</h1>
          {producto.descripcion && (
            <p className="text-muted-foreground leading-relaxed">{producto.descripcion}</p>
          )}

          <p className="text-4xl font-bold text-primary">{formatEUR(Number(producto.precio))}</p>

          <p className="text-sm text-muted-foreground">
            {agotado ? (
              <span className="text-destructive font-medium">Sin stock</span>
            ) : (
              // El stock real no se muestra al cliente
              <span className="text-neutral-600 font-medium">Disponible</span>
            )}
          </p>

          <AddToCartButton productoId={producto.id} agotado={agotado} />
        </div>
      </div>
    </main>
  );
}
