"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@lib/supabase/client";
import { apiFetch } from "@lib/api/client";
import { PedidoTabla } from "@components/backoffice/PedidoTabla";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { Pedido, PaginatedResponse } from "@valatino/types";

export default function BackofficePedidosPage() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createSupabaseBrowserClient();

  const loadPedidos = async () => {
    try {
      const json = await apiFetch<PaginatedResponse<Pedido>>("/admin/pedidos?limit=100");
      setPedidos(json.data ?? []);
    } catch {
      // sin sesión o sin permisos: el layout ya protege la ruta
    }
    setIsLoading(false);
  };

  useEffect(() => {
    void loadPedidos();

    // Suscripción a Supabase Realtime para actualizaciones en tiempo real.
    // La suscripción ocurre tras un await: si el efecto se limpia antes de
    // que resuelva (doble montaje de React en dev), hay que abortar — y el
    // nombre del canal lleva sufijo único porque el cliente reutiliza
    // canales por nombre y re-suscribirse a uno ya suscrito lanza error.
    let channel: RealtimeChannel | null = null;
    let cancelado = false;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session || cancelado) return;

      channel = supabase
        .channel(`pedidos-backoffice-${Math.random().toString(36).slice(2)}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "pedidos" },
          (payload) => {
            if (payload.eventType === "INSERT") {
              setPedidos((prev) => [payload.new as Pedido, ...prev]);
            } else if (payload.eventType === "UPDATE") {
              setPedidos((prev) =>
                prev.map((p) =>
                  p.id === (payload.new as Pedido).id ? { ...p, ...(payload.new as Pedido) } : p,
                ),
              );
            }
          },
        )
        .subscribe();
    });

    return () => {
      cancelado = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [supabase]);

  const handleEstadoChange = async (pedidoId: string, nuevoEstado: string) => {
    try {
      await apiFetch(`/admin/pedidos/${pedidoId}/estado`, {
        method: "PATCH",
        body: JSON.stringify({ estado: nuevoEstado }),
      });
      // La actualización llega por Realtime
    } catch {
      // transición no permitida o sin permisos
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Panel de Pedidos</h1>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs text-muted-foreground">Actualización en tiempo real</span>
        </div>
      </div>

      <PedidoTabla
        pedidos={pedidos}
        isLoading={isLoading}
        onEstadoChange={handleEstadoChange}
      />
    </div>
  );
}
