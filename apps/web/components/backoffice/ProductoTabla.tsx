import { Skeleton } from "@components/ui/Skeleton";
import { StockAjusteModal } from "./StockAjusteModal";
import { formatEUR } from "@lib/utils";
import type { Producto } from "@valatino/types";

interface ProductoTablaProps {
  productos: Producto[];
  isLoading: boolean;
  onEdit: (p: Producto) => void;
  onRefresh: () => void;
}

export function ProductoTabla({ productos, isLoading, onEdit, onRefresh }: ProductoTablaProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/50">
          <tr>
            <th className="text-left p-3 font-medium text-muted-foreground">Nombre</th>
            <th className="text-left p-3 font-medium text-muted-foreground">Categoría</th>
            <th className="text-left p-3 font-medium text-muted-foreground">Precio</th>
            <th className="text-left p-3 font-medium text-muted-foreground">Stock</th>
            <th className="text-left p-3 font-medium text-muted-foreground">Estado</th>
            <th className="text-left p-3 font-medium text-muted-foreground">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {productos.map((p) => (
            <tr key={p.id} className="hover:bg-muted/30 transition-colors">
              <td className="p-3 font-medium">{p.nombre}</td>
              <td className="p-3 text-muted-foreground">{p.categoria}</td>
              <td className="p-3">{formatEUR(Number(p.precio))}</td>
              <td className="p-3">
                <span className={p.stock_disponible === 0 ? "text-destructive" : "text-green-600"}>
                  {p.stock_disponible}
                </span>
              </td>
              <td className="p-3">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  p.activo ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                }`}>
                  {p.activo ? "Activo" : "Inactivo"}
                </span>
              </td>
              <td className="p-3 flex gap-2">
                <button
                  onClick={() => onEdit(p)}
                  className="text-xs text-primary hover:underline"
                >
                  Editar
                </button>
                <StockAjusteModal productoId={p.id} nombreProducto={p.nombre} onAjustado={onRefresh} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
