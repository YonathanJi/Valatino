import { Injectable, BadRequestException } from "@nestjs/common";
import Stripe from "stripe";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class StripeService {
  private readonly stripe: Stripe;
  readonly webhookSecret: string;

  constructor(private readonly config: ConfigService) {
    this.stripe = new Stripe(config.getOrThrow("STRIPE_SECRET_KEY"), {
      apiVersion: "2024-06-20",
    });
    this.webhookSecret = config.getOrThrow("STRIPE_WEBHOOK_SECRET");
  }

  async createPaymentIntent(amountEur: number, metadata: Record<string, string>) {
    const amountCents = Math.round(amountEur * 100);

    const intent = await this.stripe.paymentIntents.create({
      amount: amountCents,
      currency: "eur",
      automatic_payment_methods: { enabled: true },
      metadata,
    });

    return {
      client_secret: intent.client_secret,
      importe: amountEur,
      moneda: "eur",
      payment_intent_id: intent.id,
    };
  }

  /**
   * Devuelve dinero de un pago ya cobrado.
   *
   * `idempotencyKey` es la protección real contra el doble reembolso: Stripe
   * responde con el reembolso ya creado en lugar de crear otro si la clave
   * repite. Debe incluir el importe y lo ya devuelto, de forma que un doble clic
   * (mismo estado, mismo importe) reutilice el reembolso, pero dos devoluciones
   * deliberadas de 10 € seguidas sí se cobren las dos.
   */
  async crearReembolso(params: {
    paymentIntentId: string;
    importeCents: number;
    idempotencyKey: string;
    metadata?: Record<string, string>;
  }): Promise<Stripe.Refund> {
    try {
      return await this.stripe.refunds.create(
        {
          payment_intent: params.paymentIntentId,
          amount: params.importeCents,
          reason: "requested_by_customer",
          metadata: params.metadata ?? {},
        },
        { idempotencyKey: params.idempotencyKey },
      );
    } catch (err) {
      // Errores de negocio de Stripe (ya reembolsado, cargo no capturado,
      // importe superior al cobrado…) se traducen a 400 con su mensaje: son
      // accionables por quien está delante del panel.
      if (err instanceof Stripe.errors.StripeError) {
        throw new BadRequestException(`Stripe rechazó el reembolso: ${err.message}`);
      }
      throw err;
    }
  }

  constructEvent(rawBody: Buffer, signature: string): Stripe.Event {
    try {
      return this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    } catch {
      throw new BadRequestException("Firma de webhook inválida");
    }
  }
}
