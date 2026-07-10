"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@lib/supabase/client";
import { PedidoTabla } from "@components/backoffice/PedidoTabla";
import type { RealtimeChannel } from "@supabase/supabase-js";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface Pedido {
  id: string;
  estado: string;
  total: number;
  metodo_pago: string;
  created_at: string;
  updated_at: string;
  pedido_items?: Array<{ nombre_producto: string; cantidad: number }>;
}

export default function BackofficePedidosPage() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createSupabaseBrowserClient();

  const loadPedidos = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const res = await fetch(`${API_URL}/admin/pedidos?limit=100`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
      credentials: "include",
    });

    if (res.ok) {
      const json = (await res.json()) as { data: Pedido[] };
      setPedidos(json.data);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    void loadPedidos();

    // Suscripción a Supabase Realtime para actualizaciones en tiempo real
    let channel: RealtimeChannel | null = null;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;

      channel = supabase
        .channel("pedidos-backoffice")
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
      if (channel) void supabase.removeChannel(channel);
    };
  }, [supabase]);

  const handleEstadoChange = async (pedidoId: string, nuevoEstado: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    await fetch(`${API_URL}/admin/pedidos/${pedidoId}/estado`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      credentials: "include",
      body: JSON.stringify({ estado: nuevoEstado }),
    });
    // La actualización llega por Realtime
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
