import { Undo2 } from "lucide-react";
import { EstadoBadge } from "./EstadoBadge";
import { EstadoSelector } from "./EstadoSelector";
import { Skeleton } from "@components/ui/Skeleton";
import { formatEUR } from "@lib/utils";
import {
  ESTADOS_REEMBOLSABLES,
  type NivelPermiso,
  type Pedido,
  type PedidoEstado,
} from "@valatino/types";

interface PedidoTablaProps {
  pedidos: Pedido[];
  isLoading: boolean;
  nivel: NivelPermiso;
  onEstadoChange: (pedidoId: string, nuevoEstado: PedidoEstado) => Promise<boolean>;
  /** Abre el modal de devolución. Ausente para quien no puede reembolsar. */
  onReembolsar?: (pedido: Pedido) => void;
  /** Abre la ficha del pedido. */
  onAbrir: (pedido: Pedido) => void;
}

/**
 * Si queda dinero por devolver de este pedido y se puede hacer desde aquí.
 * PayPal se devuelve desde su propio panel: la API lo rechaza, así que ofrecer
 * el botón solo llevaría a un error.
 */
function puedeReembolsarse(pedido: Pedido): boolean {
  if (pedido.metodo_pago !== "stripe" || !pedido.referencia_pago) return false;
  if (!ESTADOS_REEMBOLSABLES.includes(pedido.estado)) return false;

  const restanteCents =
    Math.round(Number(pedido.total) * 100) -
    Math.round(Number(pedido.total_reembolsado ?? 0) * 100);
  return restanteCents > 0;
}

export function PedidoTabla({
  pedidos,
  isLoading,
  nivel,
  onEstadoChange,
  onReembolsar,
  onAbrir,
}: PedidoTablaProps) {
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
    <div className="rounded-xl border bg-card overflow-x-auto">
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
            <PedidoFila
              key={p.id}
              pedido={p}
              nivel={nivel}
              onEstadoChange={onEstadoChange}
              onReembolsar={onReembolsar}
              onAbrir={onAbrir}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface PedidoFilaProps {
  pedido: Pedido;
  nivel: NivelPermiso;
  onEstadoChange: (pedidoId: string, nuevoEstado: PedidoEstado) => Promise<boolean>;
  onReembolsar?: (pedido: Pedido) => void;
  onAbrir: (pedido: Pedido) => void;
}

export function PedidoFila({
  pedido,
  nivel,
  onEstadoChange,
  onReembolsar,
  onAbrir,
}: PedidoFilaProps) {
  const devuelto = Number(pedido.total_reembolsado ?? 0);
  const mostrarReembolso = Boolean(onReembolsar) && puedeReembolsarse(pedido);

  return (
    <tr
      onClick={() => onAbrir(pedido)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onAbrir(pedido);
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`Ver el pedido ${pedido.numero_pedido ?? pedido.id.slice(0, 8)}`}
      className="cursor-pointer transition-colors hover:bg-muted/30 focus-visible:bg-muted/50 focus-visible:outline-none"
    >
      <td className="p-3 font-mono text-xs">
        {pedido.numero_pedido ?? pedido.id.slice(0, 8).toUpperCase()}
      </td>
      <td className="p-3 text-muted-foreground">
        {new Date(pedido.created_at).toLocaleDateString("es-ES")}
      </td>
      <td className="p-3">
        <span className="font-medium">{formatEUR(Number(pedido.total))}</span>
        {devuelto > 0 && (
          // Visible aunque el pedido no esté REEMBOLSADO: una devolución parcial
          // no cambia el estado, así que este es el único sitio donde se ve.
          <span
            className="block text-xs text-amber-600"
            title={`Se han devuelto ${formatEUR(devuelto)} de este pedido`}
          >
            −{formatEUR(devuelto)} devuelto
          </span>
        )}
      </td>
      <td className="p-3 capitalize text-muted-foreground">{pedido.metodo_pago}</td>
      <td className="p-3">
        <EstadoBadge estado={pedido.estado} />
      </td>
      {/* La celda de acciones no abre la ficha: aquí viven el desplegable de
          estado y el botón de reembolso, y que se abriera un modal cada vez que
          se usan sería un incordio. */}
      <td className="p-3" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <EstadoSelector
            pedidoId={pedido.id}
            estadoActual={pedido.estado}
            nivel={nivel}
            onCambiar={onEstadoChange}
          />
          {mostrarReembolso && onReembolsar && (
            <button
              type="button"
              onClick={() => onReembolsar(pedido)}
              title="Devolver dinero al cliente"
              className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Undo2 className="h-3.5 w-3.5" />
              Reembolsar
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
