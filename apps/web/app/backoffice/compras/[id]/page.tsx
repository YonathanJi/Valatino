"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@lib/api/client";
import { Button } from "@components/ui/button";
import { formatEUR } from "@lib/utils";
import { ShoppingBag, FileText } from "lucide-react";
import { PageHeader } from "@components/backoffice/PageHeader";
import type { FacturaCompra } from "@valatino/types";

/** Costo unitario con hasta 4 decimales (los importes totales siguen a 2) */
const formatCosto = (v: number) =>
  new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(v);

export default function CompraDetallePage() {
  const { id } = useParams<{ id: string }>();
  const [compra, setCompra] = useState<FacturaCompra | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [abriendoPdf, setAbriendoPdf] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        setCompra(await apiFetch<FacturaCompra>(`/admin/compras/${id}`));
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Error al cargar la compra");
      }
      setIsLoading(false);
    };
    void load();
  }, [id]);

  const verPdf = async () => {
    setAbriendoPdf(true);
    try {
      const { url } = await apiFetch<{ url: string }>(`/admin/compras/${id}/pdf`);
      window.open(url, "_blank", "noopener");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo abrir el PDF");
    }
    setAbriendoPdf(false);
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-3 max-w-3xl">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (!compra) {
    return (
      <div className="p-10 text-center text-sm text-muted-foreground">
        Compra no encontrada.{" "}
        <Link href="/backoffice/compras" className="text-primary hover:underline">
          Volver al histórico
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4 max-w-3xl">
      <PageHeader
        icon={ShoppingBag}
        back={{ href: "/backoffice/compras", label: "Compras" }}
        title={
          compra.numero_factura
            ? `Compra — Factura ${compra.numero_factura}`
            : "Compra de mercancía"
        }
        description={`Registrada el ${new Date(compra.created_at).toLocaleDateString("es-ES", {
          day: "numeric",
          month: "long",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}`}
      >
        <Button onClick={() => void verPdf()} disabled={abriendoPdf} variant="outline">
          <FileText className="mr-1.5 h-4 w-4" />
          {abriendoPdf ? "Abriendo…" : "Ver factura"}
        </Button>
      </PageHeader>

      <div className="rounded-xl border bg-card p-6 grid gap-4 sm:grid-cols-4 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Proveedor</p>
          <p className="font-medium mt-0.5">{compra.proveedor ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Unidades ingresadas</p>
          <p className="font-medium font-mono mt-0.5">{compra.total_unidades}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Líneas</p>
          <p className="font-medium font-mono mt-0.5">{compra.items?.length ?? 0}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">
            {compra.total_con_iva !== null ? "Total (con IVA)" : "Total (sin IVA)"}
          </p>
          <p className="font-medium font-mono mt-0.5">
            {compra.total_con_iva !== null
              ? formatEUR(Number(compra.total_con_iva))
              : compra.total !== null
                ? formatEUR(Number(compra.total))
                : "—"}
          </p>
        </div>
        {compra.notas && (
          <div className="sm:col-span-3">
            <p className="text-xs text-muted-foreground">Notas</p>
            <p className="mt-0.5 whitespace-pre-wrap">{compra.notas}</p>
          </div>
        )}
      </div>

      <div className="rounded-xl border bg-card">
        <div className="p-4 border-b">
          <h2 className="font-semibold">Contenido</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-3 font-medium">Producto</th>
                <th className="text-right px-4 py-3 font-medium">Cantidad</th>
                <th className="text-right px-4 py-3 font-medium">Costo unidad (sin IVA)</th>
                <th className="text-right px-4 py-3 font-medium">IVA</th>
                <th className="text-right px-4 py-3 font-medium">Subtotal (sin IVA)</th>
              </tr>
            </thead>
            <tbody>
              {(compra.items ?? []).map((item) => (
                <tr key={item.id} className="border-b last:border-0">
                  <td className="px-4 py-3">{item.nombre_producto}</td>
                  <td className="px-4 py-3 text-right font-mono">{item.cantidad}</td>
                  <td className="px-4 py-3 text-right font-mono">
                    {item.costo_unitario !== null ? formatCosto(Number(item.costo_unitario)) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {item.iva_pct !== null ? `${Number(item.iva_pct)}%` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {item.costo_unitario !== null
                      ? formatEUR(item.cantidad * Number(item.costo_unitario))
                      : "—"}
                  </td>
                </tr>
              ))}
              {compra.total !== null && (
                <tr className="bg-muted/20">
                  <td className="px-4 py-2.5 text-sm" colSpan={4}>
                    Base imponible (sin IVA)
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono">
                    {formatEUR(Number(compra.total))}
                  </td>
                </tr>
              )}
              {compra.total_iva !== null && (
                <tr className="bg-muted/20">
                  <td className="px-4 py-2.5 text-sm" colSpan={4}>
                    IVA
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono">
                    {formatEUR(Number(compra.total_iva))}
                  </td>
                </tr>
              )}
              {compra.total_con_iva !== null && (
                <tr className="bg-muted/30">
                  <td className="px-4 py-3 font-semibold" colSpan={4}>
                    Total (con IVA)
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold">
                    {formatEUR(Number(compra.total_con_iva))}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
