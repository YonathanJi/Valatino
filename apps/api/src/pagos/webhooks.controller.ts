import {
  Controller,
  Post,
  Req,
  Body,
  RawBodyRequest,
  Headers,
  HttpCode,
  HttpStatus,
  BadRequestException,
  ForbiddenException,
  Inject,
  Logger,
  UseGuards,
} from "@nestjs/common";
import { Request } from "express";
import { StripeService } from "./stripe.service";
import { PaypalService } from "./paypal.service";
import { InventarioService } from "../inventario/inventario.service";
import { CarritoService } from "../carrito/carrito.service";
import { ConfirmacionPedidoService } from "../pedidos/confirmacion-pedido.service";
import { OptionalJwtGuard } from "../auth/guards/optional-jwt.guard";
import { CrearPagoDto } from "./dto/crear-pago.dto";
import { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_CLIENT } from "../supabase/supabase.module";
import Stripe from "stripe";

type SessionRequest = RawBodyRequest<Request & { sessionId?: string; user?: { sub: string } }>;

/**
 * Endpoints de pago y webhooks. Los webhooks solo verifican la firma del
 * proveedor y traducen su evento; la creación del pedido, la transacción y
 * los emails viven en ConfirmacionPedidoService (flujo único para todos los
 * proveedores).
 */
@Controller("pagos")
export class PagosController {
  private readonly logger = new Logger(PagosController.name);

  constructor(
    private readonly stripeService: StripeService,
    private readonly paypalService: PaypalService,
    private readonly inventarioService: InventarioService,
    private readonly carritoService: CarritoService,
    private readonly confirmacionPedido: ConfirmacionPedidoService,
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  // ──────────────────────────────────────────────
  // Validación común de datos de checkout
  // ──────────────────────────────────────────────

  private async validarYGuardarCheckout(
    sessionId: string,
    userId: string | undefined,
    dto: CrearPagoDto,
  ): Promise<void> {
    if (userId && dto.direccion_envio_id) {
      // Usuario autenticado con dirección guardada: verificar propiedad
      const { data: direccion } = await this.supabase
        .from("direcciones_envio")
        .select("id")
        .eq("id", dto.direccion_envio_id)
        .eq("user_id", userId)
        .maybeSingle();

      if (!direccion) {
        throw new ForbiddenException("La dirección de envío no pertenece a tu cuenta");
      }
    } else if (!dto.direccion) {
      throw new BadRequestException(
        "Debes indicar una dirección de envío (direccion_envio_id o direccion)",
      );
    }

    if (!userId && !dto.email) {
      throw new BadRequestException("El email es obligatorio para comprar como invitado");
    }

    await this.inventarioService.guardarCheckoutDatos({
      sessionId,
      userId,
      email: dto.email,
      documento: dto.documento,
      direccionEnvioId: userId ? dto.direccion_envio_id : undefined,
      direccion: dto.direccion,
    });
  }

  // ──────────────────────────────────────────────
  // Stripe: crear intención de pago
  // ──────────────────────────────────────────────

  @Post("stripe/create-payment-intent")
  @UseGuards(OptionalJwtGuard)
  @HttpCode(HttpStatus.CREATED)
  async createPaymentIntent(@Req() req: SessionRequest, @Body() dto: CrearPagoDto) {
    const sessionId = req.sessionId ?? "";
    const userId = req.user?.sub;

    const carrito = await this.carritoService.getCarrito(sessionId, userId);
    if (carrito.items.length === 0) {
      throw new BadRequestException("El carrito está vacío");
    }

    await this.validarYGuardarCheckout(sessionId, userId, dto);

    return this.stripeService.createPaymentIntent(carrito.total, {
      session_id: sessionId,
      user_id: userId ?? "",
      email_cliente: dto.email?.toLowerCase() ?? "",
      documento_cliente: dto.documento ?? "",
    });
  }

  // ──────────────────────────────────────────────
  // PayPal: crear orden
  // ──────────────────────────────────────────────

  @Post("paypal/create-order")
  @UseGuards(OptionalJwtGuard)
  @HttpCode(HttpStatus.CREATED)
  async createPaypalOrder(@Req() req: SessionRequest, @Body() dto: CrearPagoDto) {
    const sessionId = req.sessionId ?? "";
    const userId = req.user?.sub;

    const carrito = await this.carritoService.getCarrito(sessionId, userId);
    if (carrito.items.length === 0) {
      throw new BadRequestException("El carrito está vacío");
    }

    await this.validarYGuardarCheckout(sessionId, userId, dto);

    // custom_id ≤127 chars en PayPal: solo session+user; el resto se lee de
    // checkout_datos en el webhook
    const customId = [sessionId, userId ?? ""].join("|");

    return this.paypalService.createOrder(carrito.total, customId);
  }

  // ──────────────────────────────────────────────
  // PayPal: capturar orden aprobada por el comprador
  // ──────────────────────────────────────────────

  @Post("paypal/capture-order")
  @HttpCode(HttpStatus.OK)
  async capturePaypalOrder(@Body("order_id") orderId: string) {
    if (!orderId || typeof orderId !== "string") {
      throw new BadRequestException("order_id es obligatorio");
    }
    return this.paypalService.captureOrder(orderId);
  }

  // ──────────────────────────────────────────────
  // Stripe: webhook (firma verificada)
  // ──────────────────────────────────────────────

  @Post("stripe/webhook")
  @HttpCode(HttpStatus.OK)
  async handleStripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers("stripe-signature") signature: string,
  ) {
    const rawBody = req.rawBody;
    if (!rawBody) throw new BadRequestException("No raw body");

    const event = this.stripeService.constructEvent(rawBody, signature);

    // Idempotencia: Stripe reintenta webhooks; no procesar dos veces
    if (await this.inventarioService.eventoYaProcesado(event.id)) {
      this.logger.warn(`Evento Stripe ${event.id} ya procesado; se ignora`);
      return { received: true };
    }

    if (event.type === "payment_intent.succeeded") {
      const intent = event.data.object as Stripe.PaymentIntent;

      await this.confirmacionPedido.confirmarPago({
        proveedor: "stripe",
        eventoId: event.id,
        tipoEvento: event.type,
        sessionId: intent.metadata["session_id"] ?? "",
        userId: intent.metadata["user_id"] || undefined,
        emailCliente: intent.metadata["email_cliente"] || undefined,
        documentoCliente: intent.metadata["documento_cliente"] || undefined,
        referenciaPago: intent.id,
        importe: intent.amount / 100,
        payloadRaw: event.data.object as object,
      });
    }

    if (
      event.type === "payment_intent.payment_failed" ||
      event.type === "payment_intent.canceled"
    ) {
      const intent = event.data.object as Stripe.PaymentIntent;
      const sessionId = intent.metadata["session_id"];
      const userId = intent.metadata["user_id"];

      if (sessionId || userId) {
        await this.inventarioService.liberarReservas(sessionId ?? "", userId || undefined);
      }
    }

    if (event.type === "charge.refunded") {
      const charge = event.data.object as Stripe.Charge;
      const paymentIntentId =
        typeof charge.payment_intent === "string"
          ? charge.payment_intent
          : charge.payment_intent?.id;

      if (paymentIntentId) {
        await this.confirmacionPedido.procesarReembolso({
          proveedor: "stripe",
          eventoId: event.id,
          tipoEvento: event.type,
          referenciaPago: paymentIntentId,
          importe: (charge.amount_refunded ?? 0) / 100,
          payloadRaw: event.data.object as object,
        });
      }
    }

    return { received: true };
  }

  // ──────────────────────────────────────────────
  // PayPal: webhook (firma verificada)
  // ──────────────────────────────────────────────

  @Post("paypal/webhook")
  @HttpCode(HttpStatus.OK)
  async handlePaypalWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers() headers: Record<string, string>,
  ) {
    const rawBody = req.rawBody?.toString() ?? "{}";
    const isValid = await this.paypalService.verifyWebhook(rawBody, headers);
    if (!isValid) throw new BadRequestException("Firma de webhook PayPal inválida");

    const event = JSON.parse(rawBody) as {
      event_type: string;
      id: string;
      resource: {
        custom_id?: string;
        purchase_units?: Array<{ custom_id?: string; amount?: { value?: string } }>;
        amount?: { value?: string };
        id?: string;
        links?: Array<{ href: string; rel: string }>;
      };
    };

    // Idempotencia: PayPal reintenta webhooks; no procesar dos veces
    if (await this.inventarioService.eventoYaProcesado(event.id)) {
      this.logger.warn(`Evento PayPal ${event.id} ya procesado; se ignora`);
      return { received: true };
    }

    if (event.event_type === "PAYMENT.CAPTURE.COMPLETED") {
      const customId = event.resource.purchase_units?.[0]?.custom_id ?? event.resource.custom_id ?? "";
      const [sessionId, userId] = customId.split("|");

      const importe = parseFloat(
        event.resource.purchase_units?.[0]?.amount?.value ??
          event.resource.amount?.value ??
          "0",
      );

      await this.confirmacionPedido.confirmarPago({
        proveedor: "paypal",
        eventoId: event.id,
        tipoEvento: event.event_type,
        sessionId: sessionId ?? "",
        userId: userId || undefined,
        referenciaPago: event.resource.id ?? event.id,
        importe,
        payloadRaw: event,
      });
    }

    if (event.event_type === "PAYMENT.CAPTURE.DENIED") {
      const customId = event.resource.purchase_units?.[0]?.custom_id ?? event.resource.custom_id ?? "";
      const [sessionId, userId] = customId.split("|");
      if (sessionId || userId) {
        await this.inventarioService.liberarReservas(sessionId ?? "", userId || undefined);
      }
    }

    if (event.event_type === "PAYMENT.CAPTURE.REFUNDED") {
      // El id de la captura original viene en el link "up" del refund
      const upLink = event.resource.links?.find((l) => l.rel === "up")?.href ?? "";
      const captureId = upLink.split("/captures/")[1] ?? "";

      if (captureId) {
        await this.confirmacionPedido.procesarReembolso({
          proveedor: "paypal",
          eventoId: event.id,
          tipoEvento: event.event_type,
          referenciaPago: captureId,
          importe: parseFloat(event.resource.amount?.value ?? "0"),
          payloadRaw: event,
        });
      } else {
        this.logger.warn(`Refund PayPal ${event.id} sin link a la captura original`);
      }
    }

    return { received: true };
  }
}
