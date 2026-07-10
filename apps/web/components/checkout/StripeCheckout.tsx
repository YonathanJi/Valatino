"use client";

import { useState } from "react";
import {
  useStripe,
  useElements,
  PaymentElement,
  Elements,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { toast } from "sonner";
import { Button } from "@components/ui/button";
import { apiFetch, ApiError } from "@lib/api/client";
import type { CheckoutPayload } from "./types";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

interface StripeCheckoutFormProps {
  total: number;
  payload: CheckoutPayload;
  documentoRegistrado: boolean;
  /** Deshabilita el inicio de pago hasta que email/dirección estén completos */
  disabled?: boolean;
}

export function StripeCheckoutForm({ total, payload, documentoRegistrado, disabled }: StripeCheckoutFormProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  const initializePayment = async () => {
    setIsProcessing(true);
    try {
      const data = await apiFetch<{ client_secret: string }>(
        "/pagos/stripe/create-payment-intent",
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      );
      setClientSecret(data.client_secret);
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.message : "No se pudo inicializar el pago. Intenta de nuevo.",
      );
    } finally {
      setIsProcessing(false);
    }
  };

  if (!clientSecret) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Haz clic en "Continuar" para inicializar el pago de forma segura con Stripe.
        </p>
        <Button
          onClick={() => void initializePayment()}
          disabled={isProcessing || disabled}
          className="w-full"
          size="lg"
        >
          {isProcessing ? "Preparando pago..." : "Continuar con tarjeta"}
        </Button>
        {disabled && (
          <p className="text-xs text-center text-muted-foreground">
            Completa tu email y la dirección de envío para continuar.
          </p>
        )}
      </div>
    );
  }

  return (
    <Elements stripe={stripePromise} options={{ clientSecret }}>
      <StripePaymentForm
        total={total}
        email={payload.email}
        documento={payload.documento ?? ""}
        documentoRegistrado={documentoRegistrado}
      />
    </Elements>
  );
}

function StripePaymentForm({
  total,
  email,
  documento,
  documentoRegistrado,
}: {
  total: number;
  email: string;
  documento: string;
  documentoRegistrado: boolean;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setIsProcessing(true);

    const params = new URLSearchParams();
    params.set("email", email);
    params.set("documento", documento);
    params.set("registrado", documentoRegistrado ? "true" : "false");
    params.set("metodo", "stripe");

    // Stripe añade redirect_status y payment_intent al return_url;
    // la página de confirmación los valida antes de mostrar éxito.
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/checkout/confirmacion?${params.toString()}`,
      },
    });

    if (error) {
      toast.error(error.message ?? "Error al procesar el pago");
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement />
      <Button type="submit" disabled={!stripe || isProcessing} className="w-full" size="lg">
        {isProcessing ? "Procesando..." : `Pagar ${total.toFixed(2)} EUR`}
      </Button>
      <p className="text-xs text-center text-muted-foreground">
        🔒 Pago seguro procesado por Stripe. No almacenamos datos de tu tarjeta.
      </p>
    </form>
  );
}
