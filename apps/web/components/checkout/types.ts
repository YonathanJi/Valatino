import type { DireccionSnapshot } from "@valatino/types";

/** Cuerpo enviado a /pagos/stripe/create-payment-intent y /pagos/paypal/create-order */
export interface CheckoutPayload {
  direccion_envio_id?: string;
  email: string;
  documento?: string;
  direccion?: DireccionSnapshot;
}
