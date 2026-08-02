"use client";

import { useEffect, useState } from "react";
import {
  Check,
  CreditCard,
  MapPin,
  Package,
  RotateCcw,
  Truck,
  X,
  XCircle,
} from "lucide-react";
import { apiFetch } from "@lib/api/client";
import { formatEUR } from "@lib/utils";
import { HITO_COLOR } from "@lib/estados-pedido";
import { EstadoPedido } from "@components/storefront/EstadoPedido";
import type { PedidoClienteDetalle, TipoHito } from "@valatino/types";

interface Props {
  pedidoId: string;
  onClose: () => void;
}

/** Un icono por clase de hito: el seguimiento se lee de un vistazo, sin leerlo. */
const ICONO_HITO: Record<TipoHito, typeof Package> = {
  pedido: Package,
  preparacion: CreditCard,
  envio: Truck,
  entrega: Check,
  devolucion: RotateCcw,
  cancelacion: XCircle,
};

const fechaLarga = (iso: string) =>
  new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });

const horaCorta = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

export function PedidoClienteModal({ pedidoId, onClose }: Props) {
  const [pedido, setPedido] = useState<PedidoClienteDetalle | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const d = await apiFetch<PedidoClienteDetalle>(`/pedidos/${pedidoId}`);
        if (vivo) setPedido(d);
      } catch {
        if (vivo) setError(true);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [pedidoId]);

  // Escape cierra, y el fondo deja de desplazarse: si no, al cerrar apareces en
  // otro punto de la lista y parece que has perdido el sitio.
  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", alPulsar);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", alPulsar);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  const devuelto = Number(pedido?.total_reembolsado ?? 0);
  const total = Number(pedido?.total ?? 0);
  const items = pedido?.pedido_items ?? [];
  // `?? []`: Vercel despliega antes que Render, así que durante esa ventana la
  // API puede ser todavía la de antes y no mandar el seguimiento. Sin esto, la
  // ficha se caería entera en vez de mostrar lo demás.
  const seguimiento = pedido?.seguimiento ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pedido-cliente-titulo"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-card shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera pegada arriba: en un pedido largo, el número y la salida
            siguen a mano sin tener que volver al principio. */}
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b bg-card/95 p-5 backdrop-blur">
          <div className="min-w-0">
            <h2 id="pedido-cliente-titulo" className="text-lg font-semibold">
              Pedido #{pedido?.numero_pedido ?? pedidoId.slice(0, 8).toUpperCase()}
            </h2>
            {pedido && (
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <EstadoPedido estado={pedido.estado} />
                <span className="text-sm text-muted-foreground">
                  {fechaLarga(pedido.created_at)}
                </span>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="-mr-1 -mt-1 rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {error ? (
          <div className="space-y-3 p-8 text-center">
            <p className="text-sm text-muted-foreground">
              No hemos podido cargar este pedido ahora mismo.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-primary hover:underline"
            >
              Volver a mis pedidos
            </button>
          </div>
        ) : !pedido ? (
          <div className="space-y-3 p-5">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : (
          <div className="space-y-7 p-5">
            {/* Cómo pagar, cuando el pedido espera una transferencia.
                Va lo PRIMERO y por delante del seguimiento: quien entra aquí con
                un pedido sin pagar viene justo a por el IBAN y el concepto, y el
                que cerró la pestaña del checkout no los tiene en ningún otro
                sitio. */}
            {pedido.instrucciones_pago && (
              <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
                <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                  Falta tu transferencia
                </h3>
                <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-300/90">
                  Tenemos tus artículos apartados. En cuanto veamos el ingreso preparamos el
                  pedido.
                </p>
                <dl className="mt-3 space-y-2 rounded-lg bg-card/80 p-3 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">IBAN</dt>
                    <dd className="break-all font-mono">{pedido.instrucciones_pago.iban}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Titular</dt>
                    <dd>{pedido.instrucciones_pago.titular}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Importe</dt>
                    <dd className="font-mono">
                      {formatEUR(pedido.instrucciones_pago.importe)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Concepto</dt>
                    <dd className="font-mono font-semibold">
                      {pedido.instrucciones_pago.concepto}
                    </dd>
                  </div>
                </dl>
                {pedido.instrucciones_pago.vence_el && (
                  <p className="mt-2.5 text-xs text-amber-800 dark:text-amber-300/90">
                    Guardamos el pedido hasta el{" "}
                    <strong>{fechaLarga(pedido.instrucciones_pago.vence_el)}</strong>.
                  </p>
                )}
              </section>
            )}

            {/* Seguimiento — lo primero, porque es a lo que se entra.
                Si viniera vacío no se pinta el titular: una sección con un
                encabezado y nada debajo parece rota, y durante una ventana de
                despliegue la API puede no mandar todavía este campo. */}
            {seguimiento.length > 0 && (
            <section>
              <h3 className="mb-4 text-sm font-semibold">Qué ha pasado con tu pedido</h3>
              <ol className="space-y-0">
                {seguimiento.map((hito, i) => {
                  const Icono = ICONO_HITO[hito.tipo] ?? Package;
                  const ultimo = i === seguimiento.length - 1;

                  return (
                    <li key={`${hito.fecha}-${i}`} className="flex gap-3.5">
                      {/* Punto + línea: la línea no se pinta bajo el último
                          hito, o parecería que falta un paso por llegar.
                          Cada paso lleva el color de lo que es —azul preparar,
                          violeta camino, verde entregado, naranja devolución—,
                          los mismos que la etiqueta de estado de arriba. El
                          último va con anillo para señalar dónde está el pedido
                          ahora sin recurrir solo al color. */}
                      <div className="flex flex-col items-center">
                        <span
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                            HITO_COLOR[hito.tipo]
                          } ${ultimo ? "ring-2 ring-current ring-offset-2 ring-offset-background" : ""}`}
                        >
                          <Icono className="h-4 w-4" />
                        </span>
                        {!ultimo && <span className="w-px flex-1 bg-border" />}
                      </div>

                      <div className={`min-w-0 flex-1 ${ultimo ? "pb-0" : "pb-6"}`}>
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="text-sm font-medium">{hito.titulo}</p>
                          {hito.importe !== null && (
                            <p className="shrink-0 text-sm font-semibold tabular-nums text-orange-700 dark:text-orange-400">
                              +{formatEUR(hito.importe)}
                            </p>
                          )}
                        </div>
                        {hito.detalle && (
                          <p className="mt-0.5 text-sm text-muted-foreground">{hito.detalle}</p>
                        )}
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {fechaLarga(hito.fecha)} · {horaCorta(hito.fecha)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>

              {devuelto > 0 && (
                <p className="mt-4 rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">
                  El abono va al mismo método de pago con el que compraste y puede tardar unos
                  días en aparecer en tu banco.
                </p>
              )}
            </section>
            )}

            {/* Artículos */}
            <section>
              <h3 className="mb-3 text-sm font-semibold">
                {items.length === 1 ? "1 artículo" : `${items.length} artículos`}
              </h3>
              <ul className="space-y-2.5">
                {items.map((item, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0">
                      {item.nombre_producto}
                      {item.cantidad > 1 && (
                        <span className="text-muted-foreground"> × {item.cantidad}</span>
                      )}
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {formatEUR(Number(item.precio_unitario) * item.cantidad)}
                    </span>
                  </li>
                ))}
              </ul>

              <dl className="mt-4 space-y-1.5 border-t pt-4 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Total del pedido</dt>
                  <dd className="tabular-nums">{formatEUR(total)}</dd>
                </div>
                {devuelto > 0 && (
                  <>
                    <div className="flex justify-between text-orange-700 dark:text-orange-400">
                      <dt>Devuelto</dt>
                      <dd className="tabular-nums">−{formatEUR(devuelto)}</dd>
                    </div>
                    <div className="flex justify-between border-t pt-1.5 font-semibold">
                      <dt>Has pagado</dt>
                      <dd className="tabular-nums">
                        {formatEUR(Math.max(total - devuelto, 0))}
                      </dd>
                    </div>
                  </>
                )}
              </dl>
            </section>

            {/* Envío */}
            {pedido.envio_linea1 && (
              <section>
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                  <MapPin className="h-3.5 w-3.5" />
                  Enviado a
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {pedido.envio_nombre && (
                    <>
                      {pedido.envio_nombre}
                      <br />
                    </>
                  )}
                  {pedido.envio_linea1}
                  {pedido.envio_linea2 && `, ${pedido.envio_linea2}`}
                  <br />
                  {[pedido.envio_codigo_postal, pedido.envio_ciudad].filter(Boolean).join(" ")}
                  {pedido.envio_provincia && `, ${pedido.envio_provincia}`}
                </p>
              </section>
            )}

            <p className="border-t pt-4 text-center text-xs text-muted-foreground">
              ¿Algo no cuadra? Escríbenos indicando el número de pedido.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
