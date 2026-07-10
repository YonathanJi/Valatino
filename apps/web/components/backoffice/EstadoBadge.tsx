const ESTADO_CONFIG: Record<string, { label: string; className: string }> = {
  PENDIENTE_PAGO: { label: "Pendiente de pago", className: "bg-yellow-100 text-yellow-800" },
  PROCESANDO: { label: "Procesando", className: "bg-blue-100 text-blue-800" },
  ENVIADO: { label: "Enviado", className: "bg-purple-100 text-purple-800" },
  ENTREGADO: { label: "Entregado", className: "bg-green-100 text-green-800" },
  CANCELADO: { label: "Cancelado", className: "bg-red-100 text-red-800" },
};

interface EstadoBadgeProps {
  estado: string;
}

export function EstadoBadge({ estado }: EstadoBadgeProps) {
  const config = ESTADO_CONFIG[estado] ?? {
    label: estado,
    className: "bg-muted text-muted-foreground",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${config.className}`}
    >
      {config.label}
    </span>
  );
}
