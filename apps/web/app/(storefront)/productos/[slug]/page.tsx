import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Producto } from "@valatino/types";
import { AddToCartButton } from "@components/storefront/AddToCartButton";
import { hermanosDeSabor, partirNombrePorSabor } from "@lib/productos/sabores";
import { formatEUR } from "@lib/utils";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function getProducto(slug: string): Promise<Producto | null> {
  try {
    const res = await fetch(`${API_URL}/productos/slug/${slug}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return (await res.json()) as Producto;
  } catch {
    return null;
  }
}

/** Variantes de sabor del producto (para el selector de la ficha) */
async function getHermanos(producto: Producto): Promise<Producto[]> {
  if (!partirNombrePorSabor(producto.nombre)) return [];
  try {
    const res = await fetch(`${API_URL}/productos?limit=100`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data: Producto[] };
    return hermanosDeSabor(producto, json.data ?? []);
  } catch {
    return [];
  }
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
  const hermanos = await getHermanos(producto);
  const partes = partirNombrePorSabor(producto.nombre);

  return (
    <main className="max-w-5xl mx-auto px-4 py-12">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        ← Volver al catálogo
      </Link>
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
          <h1 className="text-3xl font-bold">
            {hermanos.length > 0 && partes ? partes.base : producto.nombre}
          </h1>
          {producto.descripcion && (
            <p className="text-muted-foreground leading-relaxed">{producto.descripcion}</p>
          )}

          {/* Selector de sabor (variantes "Producto Sabor X") */}
          {hermanos.length > 0 && partes && (
            <div className="space-y-2">
              <p className="text-sm font-medium">
                Sabor: <span className="text-muted-foreground">{partes.sabor}</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {hermanos.map((h) => {
                  const sabor = partirNombrePorSabor(h.nombre)?.sabor ?? h.nombre;
                  const esActual = h.id === producto.id;
                  return esActual ? (
                    <span
                      key={h.id}
                      aria-current="true"
                      className="inline-flex items-center rounded-full border-2 border-primary bg-primary/5 px-4 py-1.5 text-sm font-medium"
                    >
                      {sabor}
                    </span>
                  ) : (
                    <Link
                      key={h.id}
                      href={`/productos/${h.slug ?? h.id}`}
                      className="inline-flex items-center rounded-full border px-4 py-1.5 text-sm hover:border-primary hover:text-primary transition-colors"
                    >
                      {sabor}
                      {h.stock_disponible <= 0 && (
                        <span className="ml-1.5 text-xs text-muted-foreground">(agotado)</span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
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
