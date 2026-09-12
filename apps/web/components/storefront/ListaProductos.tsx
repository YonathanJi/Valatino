import type { Producto } from "@valatino/types";
import { ProductoCard } from "./ProductoCard";
import { ProductoCardVariantes } from "./ProductoCardVariantes";
import { agruparPorVariante } from "@lib/productos/variantes";
import { repartirCatalogo } from "@lib/productos/destacados";

/**
 * La rejilla de tarjetas del catálogo, a partir de una lista ya pedida.
 *
 * ⭐ Existe desde el 12/09 para que la portada y las páginas de categoría pinten
 * **exactamente igual** sin copiar el JSX. La diferencia con `ProductoGrid` es de
 * quién trae los datos: aquel los pide él mismo, este los recibe.
 *
 * ⚠️ No decide qué hacer cuando no hay nada: eso depende de por qué no hay, y quien
 * llama es el único que lo sabe. Una categoría vacía y una API dormida piden mensajes
 * distintos, y confundirlos es la avería que este proyecto lleva persiguiendo.
 */
export function ListaProductos({
  productos,
  /**
   * Si se intercalan los productos marcados como destacados, a lo ancho y cada seis
   * tarjetas.
   *
   * ⚠️⚠️ APAGADO POR DEFECTO, y eso es deliberado: **solo la portada lo enciende**.
   * Una categoría de cuatro productos no tiene monotonía que romper, y el destacado
   * saldría antes de llegar a las seis tarjetas o no saldría — en los dos casos,
   * raro. Que haya que pedirlo obliga a decidirlo en cada sitio en vez de heredarlo
   * sin pensar.
   */
  conDestacados = false,
}: {
  productos: Producto[];
  conDestacados?: boolean;
}) {
  // Las variantes («Producto Sabor X», «Formato Y») se agrupan en una sola tarjeta
  // con selector; el resto pasa como producto suelto.
  const items = agruparPorVariante(productos);
  const rejilla = conDestacados
    ? repartirCatalogo(items)
    : items.map((item) => ({ item, grande: false }));

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {rejilla.map(({ item, grande }) => {
        const clave =
          item.clase === "producto" ? item.producto.id : `grupo-${item.grupo.productos[0]!.id}`;

        return (
          <div
            key={clave}
            /**
             * ⚠️⚠️ EL `sm:col-span-1` ES LO QUE HACE QUE ESTO SEA «SOLO MÓVIL», y sin
             * él la tarjeta grande ocuparía dos de las cuatro columnas del escritorio
             * —media pantalla para un producto— que no es lo que se pidió ni queda
             * bien. En móvil la rejilla es de dos columnas, así que `col-span-2` es el
             * ancho entero; de `sm` en adelante vuelve a ocupar una sola.
             */
            className={grande ? "col-span-2 sm:col-span-1" : undefined}
          >
            {item.clase === "producto" ? (
              <ProductoCard producto={item.producto} grande={grande} />
            ) : (
              <ProductoCardVariantes grupo={item.grupo} grande={grande} />
            )}
          </div>
        );
      })}
    </div>
  );
}
