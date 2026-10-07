import { Injectable, BadRequestException, Logger } from "@nestjs/common";
import Stripe from "stripe";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
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
   * Con qué pagó de verdad el cliente: `card`, `bizum`, `link`…
   *
   * El PaymentIntent no lo trae —solo dice qué métodos se le ofrecieron—, así
   * que hay que mirar el cargo. Hace falta desde que la cuenta acepta Bizum:
   * hasta entonces «Stripe» y «tarjeta» eran lo mismo y el correo podía dar por
   * hecho lo segundo.
   *
   * Devuelve null si no se puede averiguar. Nunca lanza: esto es una etiqueta
   * para el correo, y un pedido cobrado no puede fallar por no saber ponerle
   * nombre a la forma de pago.
   */
  async tipoDePago(paymentIntentId: string): Promise<string | null> {
    try {
      const intent = await this.stripe.paymentIntents.retrieve(paymentIntentId, {
        expand: ["latest_charge"],
      });
      const cargo = intent.latest_charge as Stripe.Charge | null;
      return cargo?.payment_method_details?.type ?? null;
    } catch (err) {
      this.logger.warn(
        `No se pudo averiguar la forma de pago de ${paymentIntentId}: ${(err as Error).message}`,
      );
      return null;
    }
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

  /**
   * El id de la devolución que disparó un `charge.refunded`: `re_…` con tarjeta,
   * `pyr_…` con Bizum. Es la llave con la que el panel apunta la suya, y el
   * webhook necesita la MISMA para que la unicidad de `evento_id` decida quién
   * avisa al cliente.
   *
   * ⚠️⚠️ EL EVENTO NO LA TRAE. El cargo dejó de incluir `refunds` en la API
   * 2022-11-15: medido el 2026-10-07, 0 de los 14 `charge.refunded` guardados en
   * `transacciones_pago` lo llevaban, y pidiendo el cargo con 2024-06-20 y con
   * 2026-06-24.dahlia (la de los webhooks de esta cuenta) tampoco viene.
   *
   * Devuelve null si no se puede averiguar. Nunca lanza: el webhook cae entonces
   * al id del evento, que es peor llave pero apunta la devolución igual.
   */
  async refundQueLoDisparo(cargoId: string, acumuladoCents: number): Promise<string | null> {
    try {
      const lista = await this.stripe.refunds.list({ charge: cargoId, limit: 100 });
      return refundQueCompletaElAcumulado(lista.data, acumuladoCents);
    } catch (err) {
      this.logger.warn(
        `No se pudo averiguar qué devolución disparó el aviso de ${cargoId}: ${(err as Error).message}`,
      );
      return null;
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

/**
 * De las devoluciones de un cargo, la que deja lo devuelto en `acumuladoCents`.
 *
 * `amount_refunded` del evento es el acumulado EN ESE INSTANTE, así que la que
 * lo disparó es aquella en la que, sumando de la más vieja a la más nueva, la
 * suma llega justo a ese número. No vale coger la más reciente: si el aviso se
 * procesa tarde, puede haber otra posterior.
 *
 * Las fallidas y canceladas no cuentan porque Stripe las descuenta de
 * `amount_refunded`. Si una falla DESPUÉS del evento, la suma ya no cuadra y se
 * devuelve null: mejor no saberlo que apuntar la llave de otra devolución.
 *
 * Validado el 2026-10-07 contra las devoluciones reales del sandbox: 14 de 14
 * dan la misma llave que apuntó el panel, incluidas las 4 de Bizum.
 *
 * @param refunds del más nuevo al más viejo, que es como los lista Stripe.
 */
export function refundQueCompletaElAcumulado(
  refunds: ReadonlyArray<Pick<Stripe.Refund, "id" | "amount" | "status">>,
  acumuladoCents: number,
): string | null {
  let suma = 0;
  for (const refund of [...refunds].reverse()) {
    if (refund.status === "failed" || refund.status === "canceled") continue;
    suma += refund.amount;
    if (suma === acumuladoCents) return refund.id;
    if (suma > acumuladoCents) return null;
  }
  return null;
}
