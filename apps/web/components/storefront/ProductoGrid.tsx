import type { Producto } from "@valatino/types";
import { ProductoCard } from "./ProductoCard";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function getProductos(): Promise<Producto[]> {
  const res = await fetch(`${API_URL}/productos?limit=50`, {
    next: { revalidate: 60 },
  });

  if (!res.ok) return [];
  const json = (await res.json()) as { data: Producto[] };
  return json.data;
}

export async function ProductoGrid() {
  const productos = await getProductos();

  if (productos.length === 0) {
    return (
      <p className="text-center text-muted-foreground py-12">
        No hay productos disponibles en este momento.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {productos.map((p) => (
        <ProductoCard key={p.id} producto={p} />
      ))}
    </div>
  );
}
