"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Landmark } from "lucide-react";
import { Button } from "@components/ui/button";
import { apiFetch, ApiError } from "@lib/api/client";
import { formatEUR } from "@lib/utils";
import type { InstruccionesTransferencia } from "@valatino/types";
import type { CheckoutPayload } from "./types";

interface Props {
  total: number;
  payload: CheckoutPayload;
  diasPlazo: number;
  disabled?: boolean;
}

/**
 * Donde se guarda la clave de idempotencia de este checkout. `sessionStorage`
 * y no `localStorage`: la clave debe durar lo que dura la pestaña, no para
 * siempre — una compra de mañana tiene que poder crear su propio pedido.
 */
const CLAVE_CHECKOUT = "valatino:checkout:transferencia";

/**
 * La clave de idempotencia de este checkout, estable mientras no cambie la
 * compra.
 *
 * Va atada al importe a propósito. Persistirla sin más resolvía el ir y venir
 * entre métodos de pago, pero creaba otro problema: quien comprase otra cosa en
 * la misma pestaña reutilizaría la clave y la API, que es idempotente, le
 * devolvería el pedido anterior con su importe y su concepto. Si el carrito
 * cambia, la compra es otra y merece su propia clave.
 *
 * Limitación conocida: dos compras seguidas por el mismo importe exacto en la
 * misma pestaña compartirían clave. Cerrar o recargar la pestaña lo resuelve, y
 * el caso es raro frente al que esto arregla.
 */
function claveDelCheckout(total: number): string {
  const nueva =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const huella = total.toFixed(2);

  try {
    const crudo = sessionStorage.getItem(CLAVE_CHECKOUT);
    if (crudo) {
      const guardado = JSON.parse(crudo) as { clave?: string; huella?: string };
      if (guardado.clave && guardado.huella === huella) return guardado.clave;
    }
    sessionStorage.setItem(CLAVE_CHECKOUT, JSON.stringify({ clave: nueva, huella }));
  } catch {
    // Navegación privada con el almacenamiento bloqueado, o un JSON corrupto:
    // se sigue con la clave en memoria. Se pierde la protección al cambiar de
    // método, no la posibilidad de pagar.
  }
  return nueva;
}

/** Copiar al portapapeles con confirmación donde se pulsa, no en un aviso lejos. */
function Copiable({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  const [copiado, setCopiado] = useState(false);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sin permiso de portapapeles (o http): el dato está a la vista y se
      // puede seleccionar a mano, así que no se molesta con un error.
    }
  };

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
        <dd className="break-all font-mono text-sm">{valor}</dd>
      </div>
      <button
        type="button"
        onClick={() => void copiar()}
        className="shrink-0 rounded-lg border p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label={`Copiar ${etiqueta}`}
      >
        {copiado ? (
          <Check className="h-3.5 w-3.5 text-emerald-600" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
}

export function TransferenciaCheckout({ total, payload, diasPlazo, disabled }: Props) {
  const [procesando, setProcesando] = useState(false);
  const [instrucciones, setInstrucciones] = useState<InstruccionesTransferencia | null>(null);

  /*
   * La clave que hace idempotente el alta del pedido: aquí no hay una pasarela
   * que devuelva un identificador con el que reconocer el intento, así que la
   * pone el navegador. Sin ella, pulsar dos veces —o reintentar tras perderse
   * la respuesta— crearía dos pedidos con el mismo carrito.
   *
   * ⚠️ Vive en `sessionStorage`, no en un `useRef`. Cambiar de método de pago
   * desmonta este componente, y con la clave en memoria volver a «Transferencia»
   * generaría una nueva y, con ella, un SEGUNDO pedido del mismo carrito
   * reteniendo stock por duplicado. Persistida, volver aquí recupera el pedido
   * que ya se había creado.
   */
  const clave = useRef<string>("");
  if (!clave.current) {
    clave.current = claveDelCheckout(total);
  }

  const iniciar = async () => {
    setProcesando(true);
    try {
      setInstrucciones(
        await apiFetch<InstruccionesTransferencia>("/pagos/transferencia/crear-pedido", {
          method: "POST",
          body: JSON.stringify({ ...payload, clave_idempotencia: clave.current }),
        }),
      );
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.message : "No se pudo preparar el pedido. Inténtalo de nuevo.",
      );
      setProcesando(false);
    }
  };

  if (!instrucciones) {
    return (
      <div className="space-y-4">
        <div className="flex gap-3 rounded-xl border bg-muted/40 p-4 text-sm">
          <Landmark className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="space-y-1">
            <p className="font-medium">Cómo funciona</p>
            <p className="text-muted-foreground">
              Reservamos tu pedido y te damos los datos para la transferencia. En cuanto veamos
              el ingreso, lo preparamos y te avisamos por correo. Tienes{" "}
              <strong>{diasPlazo} días laborables</strong> para hacerla.
            </p>
          </div>
        </div>
        <Button
          onClick={() => void iniciar()}
          disabled={procesando || disabled}
          className="w-full"
          size="lg"
        >
          {procesando ? "Reservando tu pedido..." : "Continuar con transferencia"}
        </Button>
        {disabled && (
          <p className="text-center text-xs text-muted-foreground">
            Completa tu email y la dirección de envío para continuar.
          </p>
        )}
      </div>
    );
  }

  const vence = instrucciones.vence_el
    ? new Date(instrucciones.vence_el).toLocaleDateString("es-ES", {
        weekday: "long",
        day: "numeric",
        month: "long",
      })
    : null;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        <p className="font-semibold">Pedido {instrucciones.numero_pedido} reservado</p>
        <p className="mt-0.5">
          Ya hemos apartado tus artículos. Solo falta que hagas la transferencia.
        </p>
      </div>

      <dl className="space-y-3 rounded-xl border p-4">
        <Copiable etiqueta="IBAN" valor={instrucciones.iban} />
        <div className="border-t pt-3">
          <dt className="text-xs text-muted-foreground">Titular</dt>
          <dd className="text-sm">{instrucciones.titular}</dd>
        </div>
        {instrucciones.banco && (
          <div>
            <dt className="text-xs text-muted-foreground">Banco</dt>
            <dd className="text-sm">{instrucciones.banco}</dd>
          </div>
        )}
        <div className="border-t pt-3">
          <Copiable etiqueta="Importe" valor={instrucciones.importe.toFixed(2)} />
        </div>
        {/* El concepto es lo único que permite casar el ingreso con el pedido:
            va destacado y copiable, no como un dato más de la lista. */}
        <div className="border-t pt-3">
          <Copiable etiqueta="Concepto (importante)" valor={instrucciones.concepto} />
          <p className="mt-1.5 text-xs text-muted-foreground">
            Escribe este número en el concepto. Es lo que nos permite reconocer tu pago.
          </p>
        </div>
      </dl>

      {vence && (
        <p className="rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">
          Guardamos tu pedido hasta el <strong>{vence}</strong>. Si para entonces no nos consta
          el ingreso, se cancelará solo y los artículos volverán a la tienda.
        </p>
      )}

      <p className="text-center text-sm text-muted-foreground">
        Te hemos guardado el pedido por {formatEUR(total)}. Puedes consultarlo cuando quieras en{" "}
        <a href="/cuenta/pedidos" className="text-primary hover:underline">
          Mis pedidos
        </a>
        .
      </p>
    </div>
  );
}
