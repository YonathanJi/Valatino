"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@lib/api/client";
import { formatEUR } from "@lib/utils";
import { EstadoBadge } from "@components/backoffice/EstadoBadge";
import { HistorialPedido } from "@components/backoffice/HistorialPedido";
import type { PedidoDetalle } from "@valatino/types";

interface PedidoDetalleModalProps {
  pedidoId: string;
  onClose: () => void;
  /** Se llama cuando el historial se recarga tras un cambio hecho fuera. */
  recargarToken?: number;
}

function Campo({ etiqueta, valor }: { etiqueta: string; valor: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className="truncate text-sm">{valor?.trim() ? valor : "—"}</dd>
    </div>
  );
}

export function PedidoDetalleModal({ pedidoId, onClose, recargarToken }: PedidoDetalleModalProps) {
  const [detalle, setDetalle] = useState<PedidoDetalle | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    try {
      setDetalle(await apiFetch<PedidoDetalle>(`/admin/pedidos/${pedidoId}`));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo cargar el pedido");
      onClose();
    } finally {
      setCargando(false);
    }
  }, [pedidoId, onClose]);

  useEffect(() => {
    void cargar();
  }, [cargar, recargarToken]);

  // Cerrar con Escape: la ficha se abre pinchando una fila y se cierra mucho.
  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [onClose]);

  const p = detalle?.pedido;
  const devuelto = Number(p?.total_reembolsado ?? 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pedido-detalle-titulo"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl space-y-5 overflow-y-auto rounded-xl border bg-card p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id="pedido-detalle-titulo" className="font-mono text-lg font-semibold">
              {p?.numero_pedido ?? pedidoId.slice(0, 8).toUpperCase()}
            </h2>
            {p && (
              <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <EstadoBadge estado={p.estado} />
                <span>
                  {new Date(p.created_at).toLocaleString("es-ES", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span aria-hidden>·</span>
                <span className="capitalize">{p.metodo_pago}</span>
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>

        {cargando || !detalle || !p ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : (
          <>
            <section className="rounded-lg border p-4">
              <h3 className="mb-3 text-sm font-medium">Cliente y envío</h3>
              <dl className="grid gap-3 sm:grid-cols-2">
                <Campo etiqueta="Nombre" valor={p.envio_nombre} />
                <Campo etiqueta="Correo" valor={p.email_cliente} />
                <Campo etiqueta="Documento" valor={p.documento_cliente} />
                <Campo etiqueta="Teléfono / referencia de pago" valor={p.referencia_pago} />
                <div className="sm:col-span-2">
                  <dt className="text-xs text-muted-foreground">Dirección</dt>
                  <dd className="text-sm">
                    {[
                      p.envio_linea1,
                      p.envio_linea2,
                      [p.envio_codigo_postal, p.envio_ciudad].filter(Boolean).join(" "),
                      p.envio_provincia,
                      p.envio_pais,
                    ]
                      .filter((x) => x && String(x).trim())
                      .join(" · ") || "—"}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="rounded-lg border">
              <h3 className="border-b p-4 text-sm font-medium">
                Artículos ({detalle.items.length})
              </h3>
              {detalle.items.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  Este pedido no tiene líneas registradas.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
                      <th className="p-3 text-left font-medium">Producto</th>
                      <th className="p-3 text-right font-medium">Cant.</th>
                      <th className="p-3 text-right font-medium">Precio</th>
                      <th className="p-3 text-right font-medium">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {detalle.items.map((it) => (
                      <tr key={it.id}>
                        <td className="p-3">{it.nombre_producto}</td>
                        <td className="p-3 text-right">{it.cantidad}</td>
                        <td className="p-3 text-right text-muted-foreground">
                          {formatEUR(Number(it.precio_unitario))}
                        </td>
                        <td className="p-3 text-right font-medium">
                          {formatEUR(Number(it.precio_unitario) * it.cantidad)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t">
                    <tr>
                      <td colSpan={3} className="p-3 text-right text-muted-foreground">
                        Total
                      </td>
                      <td className="p-3 text-right font-semibold">
                        {formatEUR(Number(p.total))}
                      </td>
                    </tr>
                    {devuelto > 0 && (
                      <tr>
                        <td colSpan={3} className="px-3 pb-3 text-right text-xs text-amber-700">
                          Devuelto al cliente
                        </td>
                        <td className="px-3 pb-3 text-right text-xs font-medium text-amber-700">
                          −{formatEUR(devuelto)}
                        </td>
                      </tr>
                    )}
                  </tfoot>
                </table>
              )}
            </section>

            <section className="rounded-lg border p-4">
              <h3 className="mb-1 text-sm font-medium">Historial</h3>
              <p className="mb-4 text-xs text-muted-foreground">
                Todo lo que le ha pasado a este pedido y quién lo hizo.
              </p>
              <HistorialPedido eventos={detalle.eventos} />
            </section>
          </>
        )}
      </div>
    </div>
  );
}
