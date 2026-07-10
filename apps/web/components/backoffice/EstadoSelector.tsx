"use client";

import { useState } from "react";
import { toast } from "sonner";

const SIGUIENTES_ESTADOS: Record<string, string[]> = {
  PENDIENTE_PAGO: ["PROCESANDO", "CANCELADO"],
  PROCESANDO: ["ENVIADO", "CANCELADO"],
  ENVIADO: ["ENTREGADO"],
  ENTREGADO: [],
  CANCELADO: [],
};

const ESTADO_LABELS: Record<string, string> = {
  PROCESANDO: "Procesando",
  ENVIADO: "Enviado",
  ENTREGADO: "Entregado",
  CANCELADO: "Cancelado",
};

interface EstadoSelectorProps {
  pedidoId: string;
  estadoActual: string;
  onCambiar: (pedidoId: string, nuevoEstado: string) => void;
}

export function EstadoSelector({ pedidoId, estadoActual, onCambiar }: EstadoSelectorProps) {
  const [isLoading, setIsLoading] = useState(false);
  const siguientes = SIGUIENTES_ESTADOS[estadoActual] ?? [];

  if (siguientes.length === 0) return <span className="text-xs text-muted-foreground">—</span>;

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nuevoEstado = e.target.value;
    if (!nuevoEstado) return;

    setIsLoading(true);
    try {
      onCambiar(pedidoId, nuevoEstado);
      toast.success(`Estado actualizado a ${ESTADO_LABELS[nuevoEstado] ?? nuevoEstado}`);
    } catch {
      toast.error("Error al actualizar el estado");
    } finally {
      setIsLoading(false);
      e.target.value = "";
    }
  };

  return (
    <select
      onChange={handleChange}
      disabled={isLoading}
      defaultValue=""
      className="text-xs rounded border bg-background px-2 py-1 text-muted-foreground disabled:opacity-50"
    >
      <option value="" disabled>
        Cambiar a…
      </option>
      {siguientes.map((estado) => (
        <option key={estado} value={estado}>
          {ESTADO_LABELS[estado] ?? estado}
        </option>
      ))}
    </select>
  );
}
