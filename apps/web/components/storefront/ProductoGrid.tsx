import type { Producto } from "@valatino/types";
import { ProductoCard } from "./ProductoCard";
import { ProductoCardVariantes } from "./ProductoCardVariantes";
import { agruparPorVariante } from "@lib/productos/variantes";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function getProductos(): Promise<Producto[]> {
  try {
    const res = await fetch(`${API_URL}/productos?limit=50`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data: Producto[] };
    return json.data;
  } catch {
    // API inalcanzable (dormida, red, URL mal configurada): la home no debe
    // caerse — se muestra el catálogo vacío en su lugar.
    return [];
  }
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

  // Las variantes ("Producto Sabor X", "Producto Formato Y") se agrupan en una
  // sola tarjeta con selector; el resto pasa como producto suelto.
  const items = agruparPorVariante(productos);

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((item) =>
        item.clase === "producto" ? (
          <ProductoCard key={item.producto.id} producto={item.producto} />
        ) : (
          <ProductoCardVariantes
            key={`grupo-${item.grupo.productos[0]!.id}`}
            base={item.grupo.base}
            tipo={item.grupo.tipo}
            productos={item.grupo.productos}
          />
        ),
      )}
    </div>
  );
}
