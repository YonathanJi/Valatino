"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@lib/api/client";
import { Button } from "@components/ui/button";
import { formatEUR } from "@lib/utils";
import type { FacturaCompra, PaginatedResponse } from "@valatino/types";

export default function BackofficeComprasPage() {
  const [compras, setCompras] = useState<FacturaCompra[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const json = await apiFetch<PaginatedResponse<FacturaCompra>>(
          "/admin/compras?limit=100",
        );
        setCompras(json.data ?? []);
        setTotal(json.total ?? 0);
      } catch {
        // el layout ya protege la ruta
      }
      setIsLoading(false);
    };
    void load();
  }, []);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Compras de mercancía</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Histórico de entradas de mercancía documentadas ({total})
          </p>
        </div>
        <Button asChild>
          <Link href="/backoffice/compras/nueva">＋ Registrar compra</Link>
        </Button>
      </div>

      <div className="rounded-xl border bg-card">
        {isLoading ? (
          <div className="p-8 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-10 bg-muted rounded animate-pulse" />
            ))}
          </div>
        ) : compras.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Todavía no hay compras registradas.
            <br />
            Registra la primera con «Registrar compra».
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-3 font-medium">Fecha</th>
                  <th className="text-left px-4 py-3 font-medium">Nº factura</th>
                  <th className="text-left px-4 py-3 font-medium">Proveedor</th>
                  <th className="text-right px-4 py-3 font-medium">Unidades</th>
                  <th className="text-right px-4 py-3 font-medium">Base (sin IVA)</th>
                  <th className="text-right px-4 py-3 font-medium">Total (con IVA)</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {compras.map((c) => (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                      {new Date(c.created_at).toLocaleDateString("es-ES", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {c.numero_factura ?? <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {c.proveedor ?? <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{c.total_unidades}</td>
                    <td className="px-4 py-3 text-right font-mono">
                      {c.total !== null ? formatEUR(Number(c.total)) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {c.total_con_iva !== null ? formatEUR(Number(c.total_con_iva)) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <Link
                        href={`/backoffice/compras/${c.id}`}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        Ver detalle
                      </Link>
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
