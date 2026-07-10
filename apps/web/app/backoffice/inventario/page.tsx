"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@lib/supabase/client";
import { StockAjusteModal } from "@components/backoffice/StockAjusteModal";
import type { Producto } from "@valatino/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function BackofficeInventarioPage() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createSupabaseBrowserClient();

  const loadProductos = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const res = await fetch(`${API_URL}/productos?limit=100&soloActivos=false`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (res.ok) {
      const json = (await res.json()) as { data: Producto[] };
      setProductos(json.data);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    void loadProductos();
  }, []);

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Inventario</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Stock en tiempo real y entrada manual de mercancía
        </p>
      </div>

      <div className="rounded-xl border bg-card">
        {isLoading ? (
          <div className="p-8 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-10 bg-muted rounded animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-3 font-medium">Producto</th>
                  <th className="text-right px-4 py-3 font-medium">Disponible</th>
                  <th className="text-right px-4 py-3 font-medium">Reservado</th>
                  <th className="text-left px-4 py-3 font-medium">Estado</th>
                  <th className="text-left px-4 py-3 font-medium">Entrada</th>
                </tr>
              </thead>
              <tbody>
                {productos.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium">{p.nombre}</p>
                      <p className="text-xs text-muted-foreground">{p.categoria}</p>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      <span className={p.stock_disponible === 0 ? "text-red-600 font-semibold" : ""}>
                        {p.stock_disponible}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                      {p.stock_reservado}
                    </td>
                    <td className="px-4 py-3">
                      {p.stock_disponible === 0 ? (
                        <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
                          Agotado
                        </span>
                      ) : p.stock_disponible <= 5 ? (
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                          Bajo
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                          OK
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StockAjusteModal
                        productoId={p.id}
                        nombreProducto={p.nombre}
                        onAjustado={loadProductos}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
