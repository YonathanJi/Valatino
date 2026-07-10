"use client";

import { PayPalButtons, usePayPalScriptReducer } from "@paypal/react-paypal-js";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Skeleton } from "@components/ui/Skeleton";
import { apiFetch, ApiError } from "@lib/api/client";
import type { CheckoutPayload } from "./types";

interface PaypalCheckoutButtonProps {
  payload: CheckoutPayload;
  documentoRegistrado: boolean;
  /** Deshabilita el pago hasta que email/dirección estén completos */
  disabled?: boolean;
}

export function PaypalCheckoutButton({ payload, documentoRegistrado, disabled }: PaypalCheckoutButtonProps) {
  const [{ isPending }] = usePayPalScriptReducer();
  const router = useRouter();

  if (isPending) return <Skeleton className="h-14 rounded-lg" />;

  if (disabled) {
    return (
      <p className="rounded-lg border border-dashed p-4 text-sm text-center text-muted-foreground">
        Completa tu email y la dirección de envío para pagar con PayPal.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <PayPalButtons
        style={{ layout: "vertical", color: "gold", shape: "rect", height: 48 }}
        createOrder={async () => {
          try {
            const data = await apiFetch<{ order_id: string }>("/pagos/paypal/create-order", {
              method: "POST",
              body: JSON.stringify(payload),
            });
            return data.order_id;
          } catch (e) {
            toast.error(e instanceof ApiError ? e.message : "No se pudo iniciar el pago con PayPal");
            throw e;
          }
        }}
        onApprove={async (data) => {
          // Capturar el pago en el servidor: sin este paso PayPal nunca
          // completa la transacción ni dispara el webhook.
          try {
            const capture = await apiFetch<{ status: string; capture_id: string | null }>(
              "/pagos/paypal/capture-order",
              {
                method: "POST",
                body: JSON.stringify({ order_id: data.orderID }),
              },
            );

            const params = new URLSearchParams();
            params.set("email", payload.email);
            params.set("documento", payload.documento ?? "");
            params.set("registrado", documentoRegistrado ? "true" : "false");
            params.set("metodo", "paypal");
            params.set(
              "redirect_status",
              capture.status === "COMPLETED" ? "succeeded" : "failed",
            );
            if (capture.capture_id) params.set("referencia", capture.capture_id);

            router.push(`/checkout/confirmacion?${params.toString()}`);
          } catch (e) {
            toast.error(
              e instanceof ApiError ? e.message : "No se pudo completar el pago con PayPal",
            );
          }
        }}
        onError={() => {
          toast.error("Error al procesar el pago con PayPal. Intenta de nuevo.");
        }}
      />
      <p className="text-xs text-center text-muted-foreground">
        🔒 Pago seguro procesado por PayPal.
      </p>
    </div>
  );
}
