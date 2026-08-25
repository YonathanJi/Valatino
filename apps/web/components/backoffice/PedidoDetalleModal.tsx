"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { FilePlus2, FileText, Send } from "lucide-react";
import { apiFetch, apiFetchBlob, ApiError } from "@lib/api/client";
import { resumenDeLaVenta } from "@lib/contabilidad/facturas-venta";
import { formatEUR } from "@lib/utils";
import { Button } from "@components/ui/button";
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
                    {/*
                      El descuento del código (migración 083, pintado en la 084).

                      ⚠️⚠️ MISMO RAZONAMIENTO QUE EL ENVÍO DE AQUÍ ABAJO, y por eso
                      va justo encima: está DENTRO del total y FUERA de las líneas.
                      Sin esta fila las líneas sumaban MÁS que el total y quien
                      mirara la ficha pensaría que el pedido se cobró de menos. Con
                      el envío el descuadre sobraba dinero; con el descuento
                      faltaba, que se lee peor.

                      ⚠️ Va DEBAJO del desglose de IVA a propósito: esas bases ya
                      vienen minoradas por el descuento (la 083 lo aplica antes de
                      congelar `pedido_iva`), así que la resta que el ojo tiene que
                      seguir es líneas → descuento → envío → total.

                      Se pinta en positivo con el signo delante, como «Devuelto al
                      cliente»: en esta tabla un número sin signo es un cargo.

                      `?? 0` cubre la ventana de despliegue —Vercel llega antes que
                      Render— y los pedidos anteriores a la 083.
                    */}
                    {Number(p.descuento ?? 0) > 0 && (
                      <tr className="text-xs text-emerald-700">
                        <td colSpan={4} className="px-3 pt-3 text-right">
                          Descuento
                          {p.descuento_codigo ? (
                            <span className="ml-1 font-mono uppercase">
                              {p.descuento_codigo}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 pt-3 text-right font-mono font-medium">
                          −{formatEUR(Number(p.descuento))}
                        </td>
                      </tr>
                    )}
                    {/*
                      Los gastos de envío (migración 080). Van fuera de las
                      líneas y DENTRO del total, así que sin esta fila la ficha
                      no cuadra: las líneas sumarían menos que el total y quien
                      la mire pensará que falta un artículo.

                      Solo se pinta si se cobró. Los pedidos de antes de la 080
                      —y los que caen bajo el umbral de gratuidad— no traen nada
                      que enseñar.
                    */}
                    {Number(p.coste_envio ?? 0) > 0 && (
                      <tr className="text-xs text-muted-foreground">
                        <td colSpan={4} className="px-3 pt-3 text-right">
                          Gastos de envío
                        </td>
                        <td className="px-3 pt-3 text-right font-mono">
                          {formatEUR(Number(p.coste_envio))}
                        </td>
                      </tr>
                    )}
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
  const resumen = resumenDeLaVenta(facturas);

  // Una venta sin devengar no tiene hecho económico que facturar, así que aquí no
  // hay nada que decir todavía — ni un vacío que parezca un fallo.
  if (!devengado) return null;

  return (
    <section className="rounded-lg border p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Facturas de esta venta</h3>
        {puedeEmitir && !yaTieneCompleta && (
          <Button asChild variant="outline" size="sm">
            <Link href={`/backoffice/contabilidad/facturas?pedido=${pedidoId}`}>
              <FilePlus2 className="mr-1.5 h-3.5 w-3.5" />
              Emitir completa
            </Link>
          </Button>
        )}
      </div>

      {facturas.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Todavía no tiene ninguna. Cada venta emite su factura simplificada sola, así que esto
          solo pasa con las anteriores a configurar los datos fiscales del negocio.
        </p>
      ) : (
        <>
          <ul className="space-y-2">
            {facturas.map((f) => (
              <FilaFactura key={f.id} factura={f} puedeEnviar={puedeEmitir} />
            ))}
          </ul>

          {/**
           * ⚠️⚠️ EL NETO, Y POR QUÉ NO BASTABA CON LA LISTA. La pregunta que se
           * hace quien mira esto es «¿cuál es la factura final?», y la respuesta
           * es que no existe: una factura emitida no se modifica jamás, así que
           * una devolución no reescribe la completa, emite una rectificativa en
           * negativo. El estado fiscal de la venta es la SUMA de los documentos
           * — y la suma es justo la parte que una persona hace mal de cabeza.
           *
           * Por eso el bloque explica además la regla: sin ella, ver la completa
           * intacta por 3,02 € después de haber devuelto los 3,02 € parece un
           * fallo del programa.
           */}
          {resumen.hayQueResumir && (
            <div className="mt-3 rounded-md bg-muted/40 px-3 py-2">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="text-xs text-muted-foreground">
                  Facturado {formatEUR(resumen.facturado)}
                  {resumen.rectificado !== 0 && (
                    <> · rectificado {formatEUR(resumen.rectificado)}</>
                  )}
                </span>
                <span className="text-xs font-medium">
                  Neto <span className="ml-1 font-mono text-sm">{formatEUR(resumen.neto)}</span>
                </span>
              </div>
              {resumen.rectificado !== 0 && (
                <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
                  Una factura emitida no se modifica: la devolución se documenta con una
                  rectificativa en negativo, y lo que la venta sostiene hoy es el neto.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

/**
 * Una factura: se pincha y se ve el PDF, y se le manda al cliente.
 *
 * ⚠️ El PDF **se abre en una pestaña nueva y no se descarga**. La API lo sirve
 * `inline`, y quien quiera guardarlo lo hace desde el visor — que es donde va a
 * buscar el botón. Forzar la descarga deja el fichero en una carpeta que nadie
 * mira y obliga a abrirlo a mano para comprobar que es el correcto.
 */
function FilaFactura({ factura, puedeEnviar }: { factura: FacturaDeLaVenta; puedeEnviar: boolean }) {
  const [abriendo, setAbriendo] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const verPdf = async () => {
    if (abriendo) return;
    setAbriendo(true);
    try {
      const blob = await apiFetchBlob(`/admin/contabilidad/facturas/${factura.id}/pdf`);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener");
      /**
       * ⚠️ La URL se revoca con retraso y NO justo después de `open`: revocarla
       * de inmediato deja a la pestaña nueva sin nada que cargar en algunos
       * navegadores. Y hay que revocarla, o cada factura consultada se queda en
       * memoria hasta recargar la página.
       */
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo abrir el PDF");
    } finally {
      setAbriendo(false);
    }
  };

  const enviar = async () => {
    if (enviando) return;
    setEnviando(true);
    try {
      const r = await apiFetch<{ numero: string; email: string }>(
        `/admin/contabilidad/facturas/${factura.id}/enviar`,
        { method: "POST" },
      );
      // Se dice A QUIÉN se mandó, no solo «enviada»: el correo sale del pedido y
      // quien pulsa no lo tiene delante. Si se fue a la dirección equivocada,
      // este aviso es el único momento en que se puede notar.
      toast.success(`Factura ${r.numero} enviada a ${r.email}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo enviar la factura");
    } finally {
      setEnviando(false);
    }
  };

  /**
   * ⚠️ La rectificativa va SANGRADA, no en la misma columna que las demás. Las
   * facturas llegan por `orden`, o sea que una rectificativa siempre viene
   * detrás de la que corrige; el sangrado convierte esa adyacencia en algo que
   * se ve. Suelta en la lista, un documento en negativo no dice qué se devolvió:
   * dice que hay un papel raro.
   */
  const esRectificativa = factura.tipo === "rectificativa";

  return (
    <li
      className={
        (factura.vigente
          ? "rounded-lg border bg-card p-3"
          : // La sustituida se apaga pero NO se esconde ni se tacha: existe, se
            // emitió y está en el libro. Lo que cambia es que ya no cuenta.
            "rounded-lg border border-dashed bg-muted/30 p-3") +
        (esRectificativa ? " ml-4 border-l-2 border-l-muted-foreground/30" : "")
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {/* El número es TEXTO, no un control: se copia para buscarlo o
                dictarlo por teléfono, y un botón no se selecciona bien. La acción
                vive en el botón de al lado. */}
            <span className="font-mono text-sm font-semibold">{factura.numero}</span>
            <span
              className={
                factura.vigente
                  ? "rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
                  : "rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
              }
            >
              {FACTURA_TIPO_LABELS[factura.tipo]}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {fechaCorta(factura.fecha_expedicion)} · {formatEUR(Number(factura.total))}
            {!factura.vigente && factura.sustituida_por && (
              <>
                {" · sustituida por "}
                <span className="font-mono">{factura.sustituida_por}</span>
              </>
            )}
            {/* A qué documento corrige. El RD 1619/2012 art. 15 lo exige en el
                papel (lo imprime el PDF), y aquí hace la misma falta: es lo que
                convierte «−2,40 €» en «−2,40 € de aquella venta». */}
            {esRectificativa && factura.rectifica_a_numero && (
              <>
                {" · rectifica a "}
                <span className="font-mono">{factura.rectifica_a_numero}</span>
              </>
            )}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void verPdf()} disabled={abriendo}>
            <FileText className="mr-1.5 h-3.5 w-3.5" />
            {abriendo ? "Abriendo…" : "PDF"}
          </Button>

          {/**
           * ⚠️⚠️ ENVIAR SOLO SI ES VIGENTE. Una simplificada canjeada sigue
           * existiendo, pero el documento válido de esa venta es la completa;
           * mandar la sustituida le pone al cliente en la mano un papel que el
           * libro ya no cuenta, y él no tiene forma de saberlo. El servidor lo
           * rechaza también —ocultar el botón no cierra la ruta—, y aquí se dice
           * por qué al pasar el ratón en vez de dejar un hueco sin explicar.
           */}
          {puedeEnviar &&
            (factura.vigente ? (
              <Button variant="outline" size="sm" onClick={() => void enviar()} disabled={enviando}>
                <Send className="mr-1.5 h-3.5 w-3.5" />
                {enviando ? "Enviando…" : "Enviar"}
              </Button>
            ) : (
              <span
                className="text-[11px] text-muted-foreground"
                title={`No se envía: la que cuenta es ${factura.sustituida_por ?? "la que la sustituyó"}.`}
              >
                No se envía
              </span>
            ))}
        </div>
      </div>
    </li>
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
