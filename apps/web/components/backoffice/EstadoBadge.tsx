import { PEDIDO_ESTADO_LABELS, type PedidoEstado } from "@valatino/types";

const ESTADO_CLASES: Record<PedidoEstado, string> = {
  PENDIENTE_PAGO: "bg-yellow-100 text-yellow-800",
  PROCESANDO: "bg-blue-100 text-blue-800",
  ENVIADO: "bg-purple-100 text-purple-800",
  ENTREGADO: "bg-green-100 text-green-800",
  CANCELADO: "bg-red-100 text-red-800",
  REEMBOLSADO: "bg-orange-100 text-orange-800",
};

interface EstadoBadgeProps {
  estado: string;
}

export function EstadoBadge({ estado }: EstadoBadgeProps) {
  const label = PEDIDO_ESTADO_LABELS[estado as PedidoEstado] ?? estado;
  const className = ESTADO_CLASES[estado as PedidoEstado] ?? "bg-muted text-muted-foreground";

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${className}`}
    >
      {label}
    </span>
  );
}
