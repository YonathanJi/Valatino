"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@lib/supabase/client";
import { apiFetch } from "@lib/api/client";
import { formatEUR } from "@lib/utils";
import Link from "next/link";
import {
  PEDIDO_ESTADO_LABELS,
  type PedidoDeCliente,
  type PaginatedResponse,
} from "@valatino/types";

// Escala de grises: cada estado se distingue por intensidad, no por tono
const ESTADO_COLORS: Record<string, string> = {
  PENDIENTE_PAGO: "bg-neutral-100 text-neutral-500",
  PROCESANDO: "bg-neutral-200 text-neutral-700",
  ENVIADO: "bg-neutral-300 text-neutral-800",
  ENTREGADO: "bg-neutral-900 text-neutral-50",
  CANCELADO: "bg-neutral-100 text-neutral-400",
  REEMBOLSADO: "bg-neutral-200 text-neutral-500",
};

export default function MisPedidosPage() {
  const supabase = createSupabaseBrowserClient();
  const router = useRouter();
  const [pedidos, setPedidos] = useState<PedidoDeCliente[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login?redirectTo=/cuenta/pedidos");
        return;
      }

      try {
        const json = await apiFetch<PaginatedResponse<PedidoDeCliente>>("/pedidos?limit=50");
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
      <Link
        href="/cuenta/perfil"
        className="inline-block text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
      >
        ← Volver a mi perfil
      </Link>
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
          {pedidos.map((pedido) => {
            // `?? 0` y `?? []`: durante una ventana de despliegue la API puede
            // ser todavía la de antes y no mandar estos campos.
            const devuelto = Number(pedido.total_reembolsado ?? 0);
            const articulos = pedido.articulos_devueltos ?? [];
            const total = Number(pedido.total);
            const esTotal = Math.round(devuelto * 100) >= Math.round(total * 100);

            return (
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
                    {PEDIDO_ESTADO_LABELS[pedido.estado] ?? pedido.estado}
                  </span>
                </div>

                <div className="space-y-1">
                  {(pedido.pedido_items ?? []).map((item, i) => (
                    <p key={i} className="text-sm text-muted-foreground">
                      {item.nombre_producto} × {item.cantidad}
                    </p>
                  ))}
                </div>

                {/* La devolución, si la hubo.
                    Se muestra aunque el pedido NO esté en estado Reembolsado:
                    una devolución parcial no cambia el estado —y es correcto que
                    no lo cambie, porque el resto del pedido sigue su curso—, así
                    que la etiqueta de arriba no puede ser el único sitio donde
                    esto se cuente. */}
                {devuelto > 0 && (
                  <section className="rounded-lg border bg-muted/40 p-4 space-y-2">
                    <div className="flex items-baseline justify-between gap-3 flex-wrap">
                      <h2 className="text-sm font-semibold">
                        {esTotal ? "Te hemos devuelto el pedido" : "Te hemos devuelto parte del pedido"}
                      </h2>
                      <p className="font-semibold tabular-nums">{formatEUR(devuelto)}</p>
                    </div>

                    {articulos.length > 0 ? (
                      <ul className="space-y-1">
                        {articulos.map((a, i) => (
                          <li
                            key={i}
                            className="flex items-baseline justify-between gap-3 text-sm text-muted-foreground"
                          >
                            <span>
                              {a.nombre_producto}
                              {a.cantidad > 1 && ` × ${a.cantidad}`}
                              <span className="ml-1.5 text-xs">
                                ·{" "}
                                {new Date(a.fecha).toLocaleDateString("es-ES", {
                                  day: "numeric",
                                  month: "long",
                                })}
                              </span>
                            </span>
                            <span className="tabular-nums">{formatEUR(Number(a.importe))}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      /* Hay dinero devuelto pero no consta de qué artículo: pasa
                         con las devoluciones por importe. Callar el importe por
                         no tener el detalle sería lo peor de las dos opciones. */
                      <p className="text-sm text-muted-foreground">
                        Este importe no corresponde a un artículo concreto del pedido.
                      </p>
                    )}

                    <p className="pt-1 text-xs text-muted-foreground">
                      El abono va al mismo método de pago con el que compraste y puede tardar
                      unos días en aparecer en tu banco.
                    </p>
                  </section>
                )}

                <div className="flex items-center justify-between">
                  <div>
                    <p
                      className={`font-bold ${devuelto > 0 ? "text-muted-foreground line-through" : "text-primary"}`}
                    >
                      {formatEUR(total)}
                    </p>
                    {devuelto > 0 && (
                      <p className="font-bold text-primary">
                        {formatEUR(Math.max(total - devuelto, 0))}
                        <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                          pagado finalmente
                        </span>
                      </p>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(pedido.created_at).toLocaleDateString("es-ES")}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
