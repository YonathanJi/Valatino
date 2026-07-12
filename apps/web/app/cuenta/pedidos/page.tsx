"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@lib/supabase/client";
import { apiFetch } from "@lib/api/client";
import { formatEUR } from "@lib/utils";
import Link from "next/link";
import type { Pedido, PaginatedResponse } from "@valatino/types";

const ESTADO_LABELS: Record<string, string> = {
  PENDIENTE_PAGO: "Pendiente de pago",
  PROCESANDO: "Procesando",
  ENVIADO: "Enviado",
  ENTREGADO: "Entregado",
  CANCELADO: "Cancelado",
};

const ESTADO_COLORS: Record<string, string> = {
  PENDIENTE_PAGO: "bg-yellow-100 text-yellow-800",
  PROCESANDO: "bg-blue-100 text-blue-800",
  ENVIADO: "bg-purple-100 text-purple-800",
  ENTREGADO: "bg-green-100 text-green-800",
  CANCELADO: "bg-red-100 text-red-800",
};

export default function MisPedidosPage() {
  const supabase = createSupabaseBrowserClient();
  const router = useRouter();
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login?redirectTo=/cuenta/pedidos");
        return;
      }

      try {
        const json = await apiFetch<PaginatedResponse<Pedido>>("/pedidos?limit=50");
        setPedidos(json.data ?? []);
      } catch {
        // Mostrar lista vacía
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [supabase, router]);

  if (isLoading) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold mb-8">Mis pedidos</h1>
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-8">Mis pedidos</h1>

      {pedidos.length === 0 ? (
        <div className="text-center py-16 space-y-4">
          <p className="text-muted-foreground">Aún no tienes pedidos</p>
          <Link href="/" className="text-primary hover:underline">
            Ir al catálogo
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {pedidos.map((pedido) => (
            <article key={pedido.id} className="rounded-xl border bg-card p-5 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-xs text-muted-foreground font-mono">
                  #{pedido.numero_pedido ?? pedido.id.slice(0, 8).toUpperCase()}
                </p>
                <span
                  className={`text-xs font-semibold px-2 py-1 rounded-full ${
                    ESTADO_COLORS[pedido.estado] ?? "bg-muted text-muted-foreground"
                  }`}
                >
                  {ESTADO_LABELS[pedido.estado] ?? pedido.estado}
                </span>
              </div>

              <div className="space-y-1">
                {(pedido.pedido_items ?? []).map((item, i) => (
                  <p key={i} className="text-sm text-muted-foreground">
                    {item.nombre_producto} × {item.cantidad}
                  </p>
                ))}
              </div>

              <div className="flex items-center justify-between">
                <p className="font-bold text-primary">{formatEUR(Number(pedido.total))}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(pedido.created_at).toLocaleDateString("es-ES")}
                </p>
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
