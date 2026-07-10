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

  constructEvent(rawBody: Buffer, signature: string): Stripe.Event {
    try {
      return this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    } catch {
      throw new BadRequestException("Firma de webhook inválida");
    }
  }
}
