import type { Producto } from "@valatino/types";
import { ProductoCard } from "./ProductoCard";
import { ProductoCardVariantes } from "./ProductoCardVariantes";
import { agruparPorVariante } from "@lib/productos/variantes";

/**
 * La rejilla de tarjetas del catálogo, a partir de una lista ya pedida.
 *
 * ⭐ Existe desde el 12/09 para que la portada y las páginas de categoría pinten
 * **exactamente igual** sin copiar el JSX. La diferencia con `ProductoGrid` es de
 * quién trae los datos: aquel los pide él mismo, este los recibe. Las categorías
 * necesitan recibirlos porque ya tienen el catálogo entero en la mano —lo usan para
 * saber qué categorías existen— y volver a pedirlo sería una segunda llamada para
 * los mismos productos.
 *
 * ⚠️ No decide qué hacer cuando no hay nada: eso depende de por qué no hay, y quien
 * llama es el único que lo sabe. Una categoría vacía y una API dormida piden mensajes
 * distintos, y confundirlos es la avería que este proyecto lleva persiguiendo.
 */
export function ListaProductos({ productos }: { productos: Producto[] }) {
  // Las variantes («Producto Sabor X», «Formato Y») se agrupan en una sola tarjeta
  // con selector; el resto pasa como producto suelto.
  const items = agruparPorVariante(productos);

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((item) =>
        item.clase === "producto" ? (
          <ProductoCard key={item.producto.id} producto={item.producto} />
        ) : (
          <ProductoCardVariantes key={`grupo-${item.grupo.productos[0]!.id}`} grupo={item.grupo} />
        ),
      )}
    </div>
  );
}
