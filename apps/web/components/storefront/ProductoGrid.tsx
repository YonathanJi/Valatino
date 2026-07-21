import type { Producto } from "@valatino/types";
import { ProductoCard } from "./ProductoCard";
import { ProductoCardSabores } from "./ProductoCardSabores";
import { agruparPorSabor } from "@lib/productos/sabores";

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

  // Las variantes de sabor ("Producto Sabor X") se agrupan en una tarjeta
  const items = agruparPorSabor(productos);

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((item) =>
        item.tipo === "producto" ? (
          <ProductoCard key={item.producto.id} producto={item.producto} />
        ) : (
          <ProductoCardSabores
            key={`grupo-${item.grupo.productos[0]!.id}`}
            base={item.grupo.base}
            productos={item.grupo.productos}
          />
        ),
      )}
    </div>
  );
}
