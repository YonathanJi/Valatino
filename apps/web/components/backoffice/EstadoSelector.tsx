"use client";

import { useState } from "react";
import {
  PEDIDO_ESTADO_LABELS,
  transicionesPermitidas,
  type PedidoEstado,
} from "@valatino/types";

interface EstadoSelectorProps {
  pedidoId: string;
  estadoActual: string;
  /** Rol del usuario: acota las transiciones ofrecidas (el asesor no cancela ni reembolsa) */
  rol: "admin" | "asesor";
  /** Debe resolver a true solo si el cambio se guardó: el aviso depende de eso */
  onCambiar: (pedidoId: string, nuevoEstado: PedidoEstado) => Promise<boolean>;
}

export function EstadoSelector({ pedidoId, estadoActual, rol, onCambiar }: EstadoSelectorProps) {
  const [isLoading, setIsLoading] = useState(false);
  // Tabla compartida con la API (@valatino/types): lo que se ofrece aquí es
  // exactamente lo que el backend va a autorizar.
  const siguientes = transicionesPermitidas(estadoActual as PedidoEstado, rol);

  if (siguientes.length === 0) return <span className="text-xs text-muted-foreground">—</span>;

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nuevoEstado = e.target.value as PedidoEstado;
    if (!nuevoEstado) return;

    const select = e.currentTarget;
    setIsLoading(true);
    // El aviso lo emite quien conoce el resultado real de la llamada. Antes se
    // lanzaba el toast de éxito sin esperarla, así que una transición rechazada
    // se anunciaba como guardada.
    await onCambiar(pedidoId, nuevoEstado);
    setIsLoading(false);
    select.value = "";
  };

  return (
    <select
      onChange={(e) => void handleChange(e)}
      disabled={isLoading}
      defaultValue=""
      className="text-xs rounded border bg-background px-2 py-1 text-muted-foreground disabled:opacity-50"
    >
      <option value="" disabled>
        {isLoading ? "Guardando…" : "Cambiar a…"}
      </option>
      {siguientes.map((estado) => (
        <option key={estado} value={estado}>
          {PEDIDO_ESTADO_LABELS[estado]}
        </option>
      ))}
    </select>
  );
}
