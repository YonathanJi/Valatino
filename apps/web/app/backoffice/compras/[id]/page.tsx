"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@lib/api/client";
import { Button } from "@components/ui/button";
import { formatEUR } from "@lib/utils";
import { ShoppingBag, FileText, CalendarDays } from "lucide-react";
import { PageHeader } from "@components/backoffice/PageHeader";
import { usePuede } from "@components/backoffice/PermisosProvider";
import type { FacturaCompra } from "@valatino/types";

/** Costo unitario con hasta 4 decimales (los importes totales siguen a 2) */
const formatCosto = (v: number) =>
  new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(v);

/**
 * Una fecha `YYYY-MM-DD` a `DD/MM/AAAA`, partiendo la cadena.
 *
 * ⚠️ Sin pasar por `Date`: `new Date("2026-08-01")` se interpreta como UTC
 * medianoche y en España se imprimiría como el 31 de julio. Es un día menos en
 * un dato que va a un libro oficial.
 */
function formatearFechaISO(iso: string): string {
  const [anio, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${anio}`;
}

/** Hoy en España, para topar el selector. Ver el mismo helper en /compras/nueva. */
function hoyEnEspana(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default function CompraDetallePage() {
  const { id } = useParams<{ id: string }>();
  const puedeEditar = usePuede("compras", "edicion");

  const [compra, setCompra] = useState<FacturaCompra | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [abriendoPdf, setAbriendoPdf] = useState(false);
  const [editandoFecha, setEditandoFecha] = useState(false);
  const [fechaBorrador, setFechaBorrador] = useState("");
  const [guardandoFecha, setGuardandoFecha] = useState(false);

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

  const guardarFecha = async () => {
    if (!fechaBorrador) return;
    setGuardandoFecha(true);
    try {
      await apiFetch<void>(`/admin/compras/${id}/fecha-factura`, {
        method: "PATCH",
        body: JSON.stringify({ fechaFactura: fechaBorrador }),
      });
      // Se refresca desde la API en vez de parchear el estado a mano: así lo que
      // se ve es lo que quedó guardado, no lo que se envió.
      setCompra(await apiFetch<FacturaCompra>(`/admin/compras/${id}`));
      setEditandoFecha(false);
      toast.success("Fecha de la factura guardada");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo guardar la fecha");
    }
    setGuardandoFecha(false);
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

      {/* La fecha de expedición va en su propia tarjeta y no en la rejilla de
          abajo: es lo ÚNICO editable de una factura registrada (el número es
          único, el total sale de las líneas y las líneas movieron stock), y
          mezclarla con los datos de solo lectura no lo diría. */}
      <div className="rounded-xl border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" />
              Fecha de la factura
            </p>
            {compra.fecha_factura ? (
              <p className="mt-1 font-medium">{formatearFechaISO(compra.fecha_factura)}</p>
            ) : (
              <p className="mt-1 text-sm font-medium text-amber-700">
                Sin fecha — cógela del PDF
              </p>
            )}
            <p className="mt-1.5 max-w-prose text-xs text-muted-foreground">
              La que puso el proveedor. Es un dato obligatorio del libro de facturas recibidas y{" "}
              <strong>no</strong> decide en qué trimestre se deduce el IVA: eso lo hace la fecha de
              registro.
            </p>
          </div>

          {/* Lo que no se puede hacer, no se pinta. */}
          {puedeEditar &&
            (editandoFecha ? (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={fechaBorrador}
                  onChange={(e) => setFechaBorrador(e.target.value)}
                  max={hoyEnEspana()}
                  className="h-9 rounded-lg border bg-background px-3 text-sm"
                  aria-label="Fecha de la factura"
                />
                <Button
                  onClick={() => void guardarFecha()}
                  disabled={!fechaBorrador || guardandoFecha}
                  size="sm"
                >
                  {guardandoFecha ? "Guardando…" : "Guardar"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditandoFecha(false)}
                  disabled={guardandoFecha}
                >
                  Cancelar
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setFechaBorrador(compra.fecha_factura ?? "");
                  setEditandoFecha(true);
                }}
              >
                {compra.fecha_factura ? "Corregir" : "Poner fecha"}
              </Button>
            ))}
        </div>
      </div>

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
