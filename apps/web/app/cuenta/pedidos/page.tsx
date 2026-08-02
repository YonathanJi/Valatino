"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, RotateCcw } from "lucide-react";
import { createSupabaseBrowserClient } from "@lib/supabase/client";
import { apiFetch } from "@lib/api/client";
import { formatEUR } from "@lib/utils";
import Link from "next/link";
import { PedidoClienteModal } from "@components/storefront/PedidoClienteModal";
import { EstadoPedido } from "@components/storefront/EstadoPedido";
import type { PedidoDeCliente, PaginatedResponse } from "@valatino/types";

/**
 * Los artículos en una línea, sin desplegar la lista entera.
 *
 * Antes cada tarjeta pintaba todos sus artículos uno debajo de otro y la página
 * crecía sin control: con cuatro pedidos había que bajar un buen rato para no
 * ver más que nombres sueltos. El detalle vive ahora en la ficha del pedido.
 */
function resumirArticulos(items: { nombre_producto: string; cantidad: number }[]): string {
  const primero = items[0];
  if (!primero) return "";
  const resto = items.length - 1;
  if (resto === 0) {
    return primero.cantidad > 1
      ? `${primero.nombre_producto} × ${primero.cantidad}`
      : primero.nombre_producto;
  }
  return `${primero.nombre_producto} y ${resto} ${resto === 1 ? "artículo más" : "artículos más"}`;
}

export default function MisPedidosPage() {
  const supabase = createSupabaseBrowserClient();
  const router = useRouter();
  const [pedidos, setPedidos] = useState<PedidoDeCliente[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [abierto, setAbierto] = useState<string | null>(null);

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
      <h1 className="text-3xl font-bold mb-2">Mis pedidos</h1>
      {pedidos.length > 0 && (
        <p className="mb-8 text-sm text-muted-foreground">
          Pincha en cualquiera para ver qué ha pasado con él.
        </p>
      )}

      {pedidos.length === 0 ? (
        <div className="text-center py-16 space-y-4">
          <p className="text-muted-foreground">Aún no tienes pedidos</p>
          <Link href="/" className="text-primary hover:underline">
            Ir al catálogo
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {pedidos.map((pedido) => {
            // `?? 0` y `?? []`: durante una ventana de despliegue la API puede
            // ser todavía la de antes y no mandar estos campos.
            const devuelto = Number(pedido.total_reembolsado ?? 0);
            const total = Number(pedido.total);
            const items = pedido.pedido_items ?? [];

            return (
              <button
                key={pedido.id}
                type="button"
                onClick={() => setAbierto(pedido.id)}
                aria-label={`Ver el pedido ${pedido.numero_pedido ?? ""}`}
                className="group flex w-full items-center gap-4 rounded-xl border bg-card p-5 text-left transition-all hover:border-neutral-300 hover:shadow-sm"
              >
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="font-mono text-xs text-muted-foreground">
                      #{pedido.numero_pedido ?? pedido.id.slice(0, 8).toUpperCase()}
                    </span>
                    <EstadoPedido estado={pedido.estado} />
                  </div>

                  <p className="truncate text-sm text-muted-foreground">
                    {resumirArticulos(items)}
                  </p>

                  {/* La devolución se anuncia ya en la lista: es lo que el
                      cliente viene a mirar, y esconderla tras un clic le
                      obligaría a abrir pedido por pedido para encontrarla. */}
                  {devuelto > 0 && (
                    <p className="flex items-center gap-1.5 text-xs font-medium text-orange-700 dark:text-orange-400">
                      <RotateCcw className="h-3 w-3 shrink-0" />
                      Te devolvimos {formatEUR(devuelto)}
                    </p>
                  )}
                </div>

                <div className="shrink-0 text-right">
                  <p className="font-bold tabular-nums text-primary">
                    {formatEUR(devuelto > 0 ? Math.max(total - devuelto, 0) : total)}
                  </p>
                  {devuelto > 0 && (
                    <p className="text-xs tabular-nums text-muted-foreground line-through">
                      {formatEUR(total)}
                    </p>
                  )}
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {new Date(pedido.created_at).toLocaleDateString("es-ES")}
                  </p>
                </div>

                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </button>
            );
          })}
        </div>
      )}

      {abierto && <PedidoClienteModal pedidoId={abierto} onClose={() => setAbierto(null)} />}
    </main>
  );
}
