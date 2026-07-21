import {
  Injectable,
  BadRequestException,
  ServiceUnavailableException,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export interface PaypalOrderResult {
  order_id: string;
}

@Injectable()
export class PaypalService {
  private readonly logger = new Logger(PaypalService.name);
  // Credenciales opcionales: si faltan, la API arranca igual y solo los
  // endpoints de PayPal responden 503. Stripe sigue funcionando.
  private readonly clientId: string | undefined;
  private readonly clientSecret: string | undefined;
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.clientId = config.get("PAYPAL_CLIENT_ID");
    this.clientSecret = config.get("PAYPAL_CLIENT_SECRET");
    const env = config.get("PAYPAL_ENVIRONMENT") ?? "sandbox";
    this.baseUrl =
      env === "production"
        ? "https://api-m.paypal.com"
        : "https://api-m.sandbox.paypal.com";

    if (!this.clientId || !this.clientSecret) {
      this.logger.warn(
        "PayPal no está configurado (faltan PAYPAL_CLIENT_ID/PAYPAL_CLIENT_SECRET); sus endpoints devolverán 503.",
      );
    }
  }

  /** Está PayPal disponible (credenciales presentes) */
  get configurado(): boolean {
    return Boolean(this.clientId && this.clientSecret);
  }

  private async getAccessToken(): Promise<string> {
    if (!this.clientId || !this.clientSecret) {
      throw new ServiceUnavailableException("PayPal no está configurado en este entorno");
    }
    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");
    const res = await fetch(`${this.baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });

    if (!res.ok) throw new BadRequestException("No se pudo obtener el token de PayPal");
    const data = (await res.json()) as { access_token: string };
    return data.access_token;
  }

  async createOrder(amountEur: number, customId: string): Promise<PaypalOrderResult> {
    const token = await this.getAccessToken();

    const res = await fetch(`${this.baseUrl}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            amount: {
              currency_code: "EUR",
              value: amountEur.toFixed(2),
            },
            custom_id: customId,
            description: "Compra en Valatino",
          },
        ],
      }),
    });

    if (!res.ok) throw new BadRequestException("No se pudo crear la orden de PayPal");
    const order = (await res.json()) as { id: string };
    return { order_id: order.id };
  }

  /**
   * Captura una orden aprobada por el comprador. Sin este paso el pago
   * nunca se completa (y el webhook PAYMENT.CAPTURE.COMPLETED nunca llega).
   */
  async captureOrder(orderId: string): Promise<{ status: string; capture_id: string | null }> {
    const token = await this.getAccessToken();

    const res = await fetch(`${this.baseUrl}/v2/checkout/orders/${orderId}/capture`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) throw new BadRequestException("No se pudo capturar el pago de PayPal");

    const result = (await res.json()) as {
      status: string;
      purchase_units?: Array<{
        payments?: { captures?: Array<{ id: string; status: string }> };
      }>;
    };

    const captureId =
      result.purchase_units?.[0]?.payments?.captures?.[0]?.id ?? null;

    return { status: result.status, capture_id: captureId };
  }

  async verifyWebhook(
    rawBody: string,
    headers: Record<string, string>,
  ): Promise<boolean> {
    const webhookId = this.config.get("PAYPAL_WEBHOOK_ID");
    if (!webhookId) return false;

    const token = await this.getAccessToken();
    const res = await fetch(`${this.baseUrl}/v1/notifications/verify-webhook-signature`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        auth_algo: headers["paypal-auth-algo"],
        cert_url: headers["paypal-cert-url"],
        transmission_id: headers["paypal-transmission-id"],
        transmission_sig: headers["paypal-transmission-sig"],
        transmission_time: headers["paypal-transmission-time"],
        webhook_id: webhookId,
        webhook_event: JSON.parse(rawBody),
      }),
    });

    if (!res.ok) return false;
    const result = (await res.json()) as { verification_status: string };
    return result.verification_status === "SUCCESS";
  }
}
