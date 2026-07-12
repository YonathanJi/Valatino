import { EstadoBadge } from "./EstadoBadge";
import { EstadoSelector } from "./EstadoSelector";
import { Skeleton } from "@components/ui/Skeleton";
import { formatEUR } from "@lib/utils";

interface Pedido {
  id: string;
  numero_pedido: string | null;
  estado: string;
  total: number;
  metodo_pago: string;
  created_at: string;
}

interface PedidoTablaProps {
  pedidos: Pedido[];
  isLoading: boolean;
  onEstadoChange: (pedidoId: string, nuevoEstado: string) => void;
}

export function PedidoTabla({ pedidos, isLoading, onEstadoChange }: PedidoTablaProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
    );
  }

  if (pedidos.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-12 text-center text-muted-foreground">
        No hay pedidos disponibles
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/50">
          <tr>
            <th className="text-left p-3 font-medium text-muted-foreground">Nº pedido</th>
            <th className="text-left p-3 font-medium text-muted-foreground">Fecha</th>
            <th className="text-left p-3 font-medium text-muted-foreground">Total</th>
            <th className="text-left p-3 font-medium text-muted-foreground">Pago</th>
            <th className="text-left p-3 font-medium text-muted-foreground">Estado</th>
            <th className="text-left p-3 font-medium text-muted-foreground">Acción</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {pedidos.map((p) => (
            <PedidoFila key={p.id} pedido={p} onEstadoChange={onEstadoChange} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface PedidoFilaProps {
  pedido: Pedido;
  onEstadoChange: (pedidoId: string, nuevoEstado: string) => void;
}

export function PedidoFila({ pedido, onEstadoChange }: PedidoFilaProps) {
  return (
    <tr className="hover:bg-muted/30 transition-colors">
      <td className="p-3 font-mono text-xs">{pedido.numero_pedido ?? pedido.id.slice(0, 8).toUpperCase()}</td>
      <td className="p-3 text-muted-foreground">
        {new Date(pedido.created_at).toLocaleDateString("es-ES")}
      </td>
      <td className="p-3 font-medium">{formatEUR(Number(pedido.total))}</td>
      <td className="p-3 capitalize text-muted-foreground">{pedido.metodo_pago}</td>
      <td className="p-3">
        <EstadoBadge estado={pedido.estado} />
      </td>
      <td className="p-3">
        <EstadoSelector
          pedidoId={pedido.id}
          estadoActual={pedido.estado}
          onCambiar={onEstadoChange}
        />
      </td>
    </tr>
  );
}
