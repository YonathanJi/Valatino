"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@lib/api/client";
import { formatEUR } from "@lib/utils";
import { EstadoBadge } from "@components/backoffice/EstadoBadge";
import { HistorialPedido } from "@components/backoffice/HistorialPedido";
import { usePuede } from "@components/backoffice/PermisosProvider";
import {
  ESFUERZO_LABELS,
  FACTURA_TIPO_LABELS,
  SATISFACCION_LABELS,
  formatearTelefono,
  type SatisfaccionCompra,
} from "@valatino/types";
import type { FacturaDeLaVenta, PedidoDetalle } from "@valatino/types";

const CARAS_SATISFACCION: Record<SatisfaccionCompra, string> = {
  1: "😞",
  2: "🙁",
  3: "😐",
  4: "🙂",
  5: "😄",
};

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
                {/* Antes esta fila decía «Teléfono / referencia de pago» y
                    mostraba la referencia: llamaba teléfono a un dato que no lo
                    era, y el de verdad no se pedía en ninguna parte. */}
                <Campo etiqueta="Teléfono" valor={formatearTelefono(p.envio_telefono) || null} />
                <Campo etiqueta="Referencia de pago" valor={p.referencia_pago} />
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

            {/* La opinión del cliente, si la dejó. Aquí tiene contexto: al lado
                de quién tocó el pedido y de cuánto tardó. La mayoría de los
                pedidos no la tendrán — es opcional a propósito. */}
            {detalle.calificacion && (
              <section className="rounded-lg border p-4">
                <h3 className="mb-3 text-sm font-medium">Opinión del cliente</h3>
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span
                    className="text-2xl"
                    title={SATISFACCION_LABELS[detalle.calificacion.satisfaccion]}
                    aria-label={SATISFACCION_LABELS[detalle.calificacion.satisfaccion]}
                  >
                    {CARAS_SATISFACCION[detalle.calificacion.satisfaccion]}
                  </span>
                  <span className="text-muted-foreground">
                    {SATISFACCION_LABELS[detalle.calificacion.satisfaccion]} ·{" "}
                    {detalle.calificacion.satisfaccion}/5
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      detalle.calificacion.esfuerzo === 3
                        ? "bg-amber-100 text-amber-800"
                        : detalle.calificacion.esfuerzo === 2
                          ? "bg-muted text-muted-foreground"
                          : "bg-green-100 text-green-700"
                    }`}
                  >
                    {ESFUERZO_LABELS[detalle.calificacion.esfuerzo]}
                  </span>
                </div>
                {detalle.calificacion.comentario && (
                  <p className="mt-3 rounded-lg bg-muted/50 p-3 text-sm">
                    {detalle.calificacion.comentario}
                  </p>
                )}
              </section>
            )}

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
                      <th className="p-3 text-right font-medium">IVA</th>
                      <th className="p-3 text-right font-medium">Precio</th>
                      <th className="p-3 text-right font-medium">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {detalle.items.map((it) => {
                      // Qué se ha devuelto de esta línea. Sin esto, un pedido
                      // con reembolso parcial solo dice cuánto dinero volvió,
                      // y averiguar de qué artículo era obligaba a mirar Stripe.
                      // `?? []`: Vercel despliega antes que Render, así que
                      // durante la ventana la API puede no mandar el campo.
                      const lineasDevueltas = detalle.reembolso_lineas ?? [];
                      const devueltas = lineasDevueltas
                        .filter((l) => l.pedido_item_id === it.id)
                        .reduce((s, l) => s + l.cantidad, 0);
                      const sinReponer = lineasDevueltas.some(
                        (l) => l.pedido_item_id === it.id && !l.repuesto_al_stock,
                      );

                      return (
                        <tr key={it.id}>
                          <td className="p-3">
                            {it.nombre_producto}
                            {devueltas > 0 && (
                              <span className="ml-2 whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                                {devueltas === it.cantidad
                                  ? "Devuelto"
                                  : `${devueltas} de ${it.cantidad} devueltas`}
                                {sinReponer && " · no repuesto"}
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-right">{it.cantidad}</td>
                          <td className="p-3 text-right text-muted-foreground">
                            {it.iva_pct != null ? `${it.iva_pct} %` : "—"}
                          </td>
                          <td className="p-3 text-right text-muted-foreground">
                            {formatEUR(Number(it.precio_unitario))}
                          </td>
                          <td className="p-3 text-right font-medium">
                            {formatEUR(Number(it.precio_unitario) * it.cantidad)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="border-t">
                    {/*
                      El desglose que se declara en el modelo 303, tal como lo
                      congeló la base de datos al vender (migración 062).

                      ⚠️ NO se recalcula aquí. Los precios llevan el IVA
                      incluido, así que la base se obtiene dividiendo, y hacerlo
                      en pantalla acabaría enseñando una base distinta de la que
                      se declara: agrupar por tipo antes de dividir da un
                      resultado y hacerlo línea a línea da otro.

                      `?? []` cubre la ventana de despliegue —Vercel llega antes
                      que Render—, y se puede quitar en la siguiente release.
                    */}
                    {(detalle.desglose_iva ?? []).map((d) => (
                      <tr key={d.iva_pct} className="text-xs text-muted-foreground">
                        <td colSpan={4} className="px-3 pt-3 text-right">
                          Base al {d.iva_pct} % · IVA {formatEUR(Number(d.cuota))}
                        </td>
                        <td className="px-3 pt-3 text-right font-mono">
                          {formatEUR(Number(d.base))}
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={4} className="p-3 text-right text-muted-foreground">
                        Total
                      </td>
                      <td className="p-3 text-right font-semibold">
                        {formatEUR(Number(p.total))}
                      </td>
                    </tr>
                    {devuelto > 0 && (
                      <tr>
                        <td colSpan={4} className="px-3 pb-3 text-right text-xs text-amber-700">
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

            <FacturasDeLaVenta
              facturas={detalle.facturas ?? []}
              pedidoId={detalle.pedido.id}
              devengado={!!detalle.pedido.devengado_el}
            />

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

/**
 * Las facturas de esta venta, aquí y de consulta.
 *
 * ⚠️⚠️ NO HAY FORMULARIO FISCAL EN ESTA PANTALLA, Y ES DELIBERADO. El botón lleva
 * a Contabilidad → Facturas con la venta ya elegida, en vez de repetir aquí los
 * cinco campos del receptor. Duplicar ese formulario significaría duplicar el
 * aviso del emisor, la validación del NIF y el desplegable de población acotado
 * por CP — y esta misma sesión (2026-08-14) costó dos migraciones justamente
 * porque la misma regla vivía en varios sitios y uno se quedó atrás.
 *
 * Sigue siendo un atajo: un clic desde el pedido y el formulario ya sabe de qué
 * venta hablas.
 *
 * ⚠️ Y lo que se muestra es número, tipo, fecha e importe. **No el receptor**: son
 * los datos fiscales del cliente y esta ficha la ve todo el equipo con
 * `pedidos:lectura`. La API tampoco los manda (ver `FacturaDeLaVenta`).
 */
function FacturasDeLaVenta({
  facturas,
  pedidoId,
  devengado,
}: {
  facturas: FacturaDeLaVenta[];
  pedidoId: string;
  devengado: boolean;
}) {
  // Emitir es de contabilidad, NO del permiso de pedidos: quien mueve estados no
  // tiene por qué poder emitir un documento fiscal.
  const puedeEmitir = usePuede("contabilidad", "edicion");
  const yaTieneCompleta = facturas.some((f) => f.tipo === "completa");

  // Una venta sin devengar no tiene hecho económico que facturar, así que aquí no
  // hay nada que decir todavía — ni un vacío que parezca un fallo.
  if (!devengado) return null;

  return (
    <section className="rounded-lg border p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Facturas de esta venta</h3>
        {puedeEmitir && !yaTieneCompleta && (
          <Link
            href={`/backoffice/contabilidad/facturas?pedido=${pedidoId}`}
            className="text-xs font-medium underline underline-offset-2 hover:no-underline"
          >
            Emitir factura completa →
          </Link>
        )}
      </div>

      {facturas.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Todavía no tiene ninguna. Cada venta emite su factura simplificada sola, así que esto
          solo pasa con las anteriores a configurar los datos fiscales del negocio.
        </p>
      ) : (
        <ul className="space-y-2">
          {facturas.map((f) => (
            <li
              key={f.id}
              className={
                f.vigente
                  ? "flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm"
                  : "flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm text-muted-foreground"
              }
            >
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-mono font-medium">{f.numero}</span>
                <span className="text-xs">{FACTURA_TIPO_LABELS[f.tipo]}</span>
                {/* Una sustituida no se tacha: sigue existiendo y no se anula
                    jamás. Se dice qué la sustituyó, que es el dato útil. */}
                {!f.vigente && f.sustituida_por && (
                  <span className="text-xs">
                    · sustituida por{" "}
                    <span className="font-mono">{f.sustituida_por}</span>
                  </span>
                )}
              </span>
              <span className="text-xs">
                {fechaCorta(f.fecha_expedicion)} · {formatEUR(Number(f.total))}
              </span>
            </li>
          ))}
        </ul>
      )}

      {facturas.length > 0 && puedeEmitir && (
        <Link
          href="/backoffice/contabilidad/facturas"
          className="mt-3 inline-block text-xs text-muted-foreground underline underline-offset-2 hover:no-underline"
        >
          Ver el libro de facturas emitidas
        </Link>
      )}
    </section>
  );
}

/**
 * `2026-08-14` → `14/08/2026`, partiendo la cadena.
 *
 * ⚠️ NO con `new Date(iso)`: un `YYYY-MM-DD` se lee como medianoche UTC y en
 * España eso cae el día anterior por la noche. La ficha de compras ya tropezó con
 * esto —una factura del 1 de agosto se imprimía como 31 de julio— y la pantalla
 * de facturas lleva la misma nota.
 */
function fechaCorta(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}
