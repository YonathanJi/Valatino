"use client";

import { useEffect, useState } from "react";
import type { DashboardGerencial } from "@valatino/types";
import { apiFetch, ApiError } from "@lib/api/client";
import { formatEUR } from "@lib/utils";
import { LayoutDashboard } from "lucide-react";
import { PageHeader } from "@components/backoffice/PageHeader";
import { EstadoBadge } from "@components/backoffice/EstadoBadge";
import {
  StatTile,
  GraficoIngresos,
  GraficoTopProductos,
  TablaVentasPorDia,
} from "@components/backoffice/DashboardCharts";
import { Skeleton } from "@components/ui/Skeleton";

export default function DashboardPage() {
  const [data, setData] = useState<DashboardGerencial | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<DashboardGerencial>("/admin/dashboard")
      .then(setData)
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : "No se pudo cargar el dashboard"),
      );
  }, []);

  if (error) {
    return (
      <div className="p-8">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8 space-y-6">
        <Skeleton className="h-8 w-64 rounded-lg" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  const estadosConPedidos = data.pedidosPorEstado.filter((e) => e.cantidad > 0);
  const totalPedidos = data.pedidosPorEstado.reduce((acc, e) => acc + e.cantidad, 0);

  return (
    <div className="p-8 space-y-6">
      <PageHeader
        icon={LayoutDashboard}
        title="Dashboard gerencial"
        description="Ventas de los últimos 30 días y estado actual de la operación"
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Ingresos (30 días)" value={formatEUR(data.ingresos30d)} hint="Pedidos pagados" />
        <StatTile label="Pedidos (30 días)" value={String(data.pedidos30d)} hint="Pagados o entregados" />
        <StatTile label="Ticket medio" value={formatEUR(data.ticketMedio30d)} hint="Últimos 30 días" />
        <StatTile label="Clientes registrados" value={String(data.clientesTotal)} hint="Total histórico" />
      </div>

      {/* Ingresos por día */}
      <section className="rounded-xl border bg-card p-5">
        <h2 className="mb-4 text-sm font-semibold">Ingresos por día</h2>
        <GraficoIngresos dias={data.ventasPorDia} />
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
            Ver tabla
          </summary>
          <div className="mt-2 max-h-48 overflow-y-auto">
            <TablaVentasPorDia dias={data.ventasPorDia} />
          </div>
        </details>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Top productos */}
        <section className="rounded-xl border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold">Productos más vendidos (30 días)</h2>
          <GraficoTopProductos productos={data.topProductos} />
        </section>

        {/* Pedidos por estado */}
        <section className="rounded-xl border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold">
            Pedidos por estado{" "}
            <span className="font-normal text-muted-foreground">({totalPedidos} en total)</span>
          </h2>
          {estadosConPedidos.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Todavía no hay pedidos</p>
          ) : (
            <ul className="space-y-2">
              {estadosConPedidos.map((e) => (
                <li key={e.estado} className="flex items-center justify-between border-b pb-2 last:border-b-0">
                  <EstadoBadge estado={e.estado} />
                  <span className="text-sm font-medium" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {e.cantidad}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Alertas de stock */}
      <section className="rounded-xl border bg-card p-5">
        <h2 className="mb-4 text-sm font-semibold">Alertas de stock (≤ 5 unidades)</h2>
        {data.stockBajo.length === 0 ? (
          <p className="text-sm text-muted-foreground">✓ Ningún producto con stock bajo</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="pb-2 font-medium">Producto</th>
                <th className="pb-2 text-right font-medium">Disponible</th>
                <th className="pb-2 text-right font-medium">Reservado</th>
                <th className="pb-2 text-right font-medium">Situación</th>
              </tr>
            </thead>
            <tbody style={{ fontVariantNumeric: "tabular-nums" }}>
              {data.stockBajo.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="py-2">{p.nombre}</td>
                  <td className="py-2 text-right">{p.stock_disponible}</td>
                  <td className="py-2 text-right">{p.stock_reservado}</td>
                  <td className="py-2 text-right">
                    {p.stock_disponible === 0 ? (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
                        ⚠ Agotado
                      </span>
                    ) : (
                      <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-800">
                        ▲ Bajo
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
