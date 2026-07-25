"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ShoppingCart } from "lucide-react";
import { createSupabaseBrowserClient } from "@lib/supabase/client";
import { apiFetch, ApiError } from "@lib/api/client";
import { PedidoTabla } from "@components/backoffice/PedidoTabla";
import { PageHeader } from "@components/backoffice/PageHeader";
import { ReembolsoModal } from "@components/backoffice/ReembolsoModal";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  PEDIDO_ESTADO_LABELS,
  type Pedido,
  type PaginatedResponse,
  type PedidoEstado,
  type ResultadoReembolso,
} from "@valatino/types";

export function PedidosPanel({ rol }: { rol: "admin" | "asesor" }) {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [reembolsando, setReembolsando] = useState<Pedido | null>(null);
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

    void supabase.auth.getSession().then(({ data: { session } }) => {
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

  /**
   * Devuelve si el cambio se guardó. El aviso se emite aquí, ya conocido el
   * resultado: antes el selector cantaba éxito sin esperar la llamada y este
   * catch se tragaba el error, así que un 403 se anunciaba como guardado.
   */
  const handleEstadoChange = async (
    pedidoId: string,
    nuevoEstado: PedidoEstado,
  ): Promise<boolean> => {
    try {
      await apiFetch(`/admin/pedidos/${pedidoId}/estado`, {
        method: "PATCH",
        body: JSON.stringify({ estado: nuevoEstado }),
      });
      // La fila se refresca por Realtime; se actualiza igual por si no llega.
      setPedidos((prev) =>
        prev.map((p) => (p.id === pedidoId ? { ...p, estado: nuevoEstado } : p)),
      );
      toast.success(`Pedido marcado como ${PEDIDO_ESTADO_LABELS[nuevoEstado]}`);
      return true;
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo actualizar el estado del pedido",
      );
      return false;
    }
  };

  /**
   * Refresca la fila con lo que devolvió la API. Realtime avisa del cambio de
   * estado, pero `total_reembolsado` se calcula en la API y no viaja en el
   * evento de Postgres, así que ese dato solo llega por aquí.
   */
  const handleReembolsado = (r: ResultadoReembolso) => {
    setPedidos((prev) =>
      prev.map((p) =>
        p.id === r.pedido_id
          ? { ...p, estado: r.estado, total_reembolsado: r.total_reembolsado }
          : p,
      ),
    );
  };

  return (
    <div className="p-6 space-y-4">
      <PageHeader
        icon={ShoppingCart}
        title="Panel de Pedidos"
        description="Seguimiento de pedidos de la tienda"
      >
        <span className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs text-muted-foreground">En tiempo real</span>
        </span>
      </PageHeader>

      <PedidoTabla
        pedidos={pedidos}
        isLoading={isLoading}
        rol={rol}
        onEstadoChange={handleEstadoChange}
        // Devolver dinero es cosa de admin: la API rechaza al asesor con un 403,
        // así que tampoco se le ofrece el botón.
        onReembolsar={rol === "admin" ? setReembolsando : undefined}
      />

      {reembolsando && (
        <ReembolsoModal
          pedido={reembolsando}
          onClose={() => setReembolsando(null)}
          onReembolsado={handleReembolsado}
        />
      )}
    </div>
  );
}
