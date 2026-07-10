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
  Logger,
  UseGuards,
} from "@nestjs/common";
import { Request } from "express";
import { StripeService } from "./stripe.service";
import { PaypalService } from "./paypal.service";
import { InventarioService } from "../inventario/inventario.service";
import { CarritoService } from "../carrito/carrito.service";
import { OptionalJwtGuard } from "../auth/guards/optional-jwt.guard";
import { CrearPagoDto } from "./dto/crear-pago.dto";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { ConfigService } from "@nestjs/config";
import { EmailService } from "../email/email.service";
import Stripe from "stripe";

type SessionRequest = RawBodyRequest<Request & { sessionId?: string; user?: { sub: string } }>;

@Controller("pagos")
export class PagosController {
  private readonly logger = new Logger(PagosController.name);
  private readonly supabase: SupabaseClient;

  constructor(
    private readonly stripeService: StripeService,
    private readonly paypalService: PaypalService,
    private readonly inventarioService: InventarioService,
    private readonly carritoService: CarritoService,
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
  ) {
    this.supabase = createClient(
      config.getOrThrow("SUPABASE_URL"),
      config.getOrThrow("SUPABASE_SERVICE_ROLE_KEY"),
    );
  }

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
      const sessionId = intent.metadata["session_id"] ?? "";
      const userId = intent.metadata["user_id"] ?? "";
      const emailMetadata = intent.metadata["email_cliente"] ?? "";
      const documentoMetadata = intent.metadata["documento_cliente"] ?? "";

      // Datos completos del checkout (dirección incluida) desde staging
      const checkoutDatos = sessionId
        ? await this.inventarioService.getCheckoutDatos(sessionId)
        : null;

      const emailCliente = (checkoutDatos?.email ?? emailMetadata).toLowerCase();
      const documentoCliente = checkoutDatos?.documento ?? documentoMetadata;

      let finalUserId = userId || checkoutDatos?.user_id || undefined;

      if (!finalUserId && emailCliente) {
        const { data: profile } = await this.supabase
          .from("profiles")
          .select("id")
          .eq("email", emailCliente)
          .maybeSingle();

        if (profile) {
          finalUserId = (profile as { id: string }).id;
        }
      }

      const pedidoId = await this.inventarioService.confirmarVentaYCrearPedido({
        userId: finalUserId || undefined,
        sessionId,
        metodoPago: "stripe",
        referenciaPago: intent.id,
        direccionEnvioId: checkoutDatos?.direccion_envio_id ?? undefined,
        direccionSnapshot: checkoutDatos?.direccion ?? undefined,
        emailCliente: emailCliente || undefined,
        documentoCliente: documentoCliente || undefined,
      });

      await this.inventarioService.registrarTransaccion(
        pedidoId,
        "stripe",
        event.id,
        event.type,
        "exitoso",
        intent.amount / 100,
        event.data.object as object,
      );

      // Email de confirmación de pedido (no bloqueante)
      await this.enviarEmailConfirmacion(pedidoId);
    }

    if (
      event.type === "payment_intent.payment_failed" ||
      event.type === "payment_intent.canceled"
    ) {
      const intent = event.data.object as Stripe.PaymentIntent;
      const sessionId = intent.metadata["session_id"];
      const userId = intent.metadata["user_id"];

      if (sessionId || userId) {
        await this.liberarReservasBySession(sessionId ?? "", userId || undefined);
      }
    }

    if (event.type === "charge.refunded") {
      const charge = event.data.object as Stripe.Charge;
      const paymentIntentId =
        typeof charge.payment_intent === "string"
          ? charge.payment_intent
          : charge.payment_intent?.id;

      if (paymentIntentId) {
        const pedidoId = await this.inventarioService.actualizarEstadoPorReferencia(
          paymentIntentId,
          "REEMBOLSADO",
        );

        if (pedidoId) {
          await this.inventarioService.registrarTransaccion(
            pedidoId,
            "stripe",
            event.id,
            event.type,
            "reembolsado",
            (charge.amount_refunded ?? 0) / 100,
            event.data.object as object,
          );

          // Email de reembolso (no bloqueante)
          await this.enviarEmailReembolso(pedidoId);
        }
      }
    }

    return { received: true };
  }

  private async liberarReservasBySession(sessionId: string, userId?: string): Promise<void> {
    const filter = userId
      ? this.supabase.from("stock_reservas").select("id, producto_id, cantidad").eq("user_id", userId)
      : this.supabase.from("stock_reservas").select("id, producto_id, cantidad").eq("session_id", sessionId);

    const { data: reservas } = await filter;

    for (const r of (reservas as Array<{ id: string; producto_id: string; cantidad: number }>) ?? []) {
      await this.supabase.rpc("liberar_reserva", {
        p_producto_id: r.producto_id,
        p_cantidad: r.cantidad,
      });
      await this.supabase.from("stock_reservas").delete().eq("id", r.id);
    }
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

      const checkoutDatos = sessionId
        ? await this.inventarioService.getCheckoutDatos(sessionId)
        : null;

      const emailCliente = checkoutDatos?.email?.toLowerCase() ?? "";
      const documentoCliente = checkoutDatos?.documento ?? "";

      let finalUserId = userId || checkoutDatos?.user_id || undefined;

      if (!finalUserId && emailCliente) {
        const { data: profile } = await this.supabase
          .from("profiles")
          .select("id")
          .eq("email", emailCliente)
          .maybeSingle();

        if (profile) {
          finalUserId = (profile as { id: string }).id;
        }
      }

      const pedidoId = await this.inventarioService.confirmarVentaYCrearPedido({
        userId: finalUserId || undefined,
        sessionId: sessionId ?? "",
        metodoPago: "paypal",
        referenciaPago: event.resource.id ?? event.id,
        direccionEnvioId: checkoutDatos?.direccion_envio_id ?? undefined,
        direccionSnapshot: checkoutDatos?.direccion ?? undefined,
        emailCliente: emailCliente || undefined,
        documentoCliente: documentoCliente || undefined,
      });

      await this.inventarioService.registrarTransaccion(
        pedidoId,
        "paypal",
        event.id,
        event.event_type,
        "exitoso",
        importe,
        event,
      );

      // Email de confirmación de pedido (no bloqueante)
      await this.enviarEmailConfirmacion(pedidoId);
    }

    if (event.event_type === "PAYMENT.CAPTURE.DENIED") {
      const customId = event.resource.purchase_units?.[0]?.custom_id ?? event.resource.custom_id ?? "";
      const [sessionId, userId] = customId.split("|");
      if (sessionId || userId) {
        await this.liberarReservasBySession(sessionId ?? "", userId || undefined);
      }
    }

    if (event.event_type === "PAYMENT.CAPTURE.REFUNDED") {
      // El id de la captura original viene en el link "up" del refund
      const upLink = event.resource.links?.find((l) => l.rel === "up")?.href ?? "";
      const captureId = upLink.split("/captures/")[1] ?? "";

      if (captureId) {
        const pedidoId = await this.inventarioService.actualizarEstadoPorReferencia(
          captureId,
          "REEMBOLSADO",
        );

        if (pedidoId) {
          await this.inventarioService.registrarTransaccion(
            pedidoId,
            "paypal",
            event.id,
            event.event_type,
            "reembolsado",
            parseFloat(event.resource.amount?.value ?? "0"),
            event,
          );

          // Email de reembolso (no bloqueante)
          await this.enviarEmailReembolso(pedidoId);
        }
      } else {
        this.logger.warn(`Refund PayPal ${event.id} sin link a la captura original`);
      }
    }

    return { received: true };
  }

  // ──────────────────────────────────────────────
  // Helpers: envío de emails transaccionales
  // ──────────────────────────────────────────────

  private async enviarEmailConfirmacion(pedidoId: string): Promise<void> {
    try {
      const pedido = await this.inventarioService.getPedidoConItems(pedidoId);
      if (!pedido || !pedido.email_cliente || pedido.items.length === 0) return;

      await this.emailService.enviarConfirmacionPedido({
        pedidoId: pedido.id,
        email: pedido.email_cliente,
        items: pedido.items,
        total: Number(pedido.total),
        metodoPago: pedido.metodo_pago,
        direccionEnvio: pedido.envio_nombre
          ? {
              nombre_destinatario: pedido.envio_nombre,
              linea1: pedido.envio_linea1 ?? "",
              linea2: pedido.envio_linea2,
              ciudad: pedido.envio_ciudad ?? "",
              codigo_postal: pedido.envio_codigo_postal ?? "",
              provincia: pedido.envio_provincia ?? "",
              pais: pedido.envio_pais ?? undefined,
            }
          : null,
        estado: pedido.estado,
        fecha: new Date(pedido.created_at).toLocaleDateString("es-ES", {
          day: "numeric",
          month: "long",
          year: "numeric",
        }),
      });
    } catch (err) {
      this.logger.warn(`No se pudo enviar email de confirmación (pedido ${pedidoId}): ${(err as Error).message}`);
    }
  }

  private async enviarEmailReembolso(pedidoId: string): Promise<void> {
    try {
      const pedido = await this.inventarioService.getPedidoConItems(pedidoId);
      if (!pedido || !pedido.email_cliente || pedido.items.length === 0) return;

      await this.emailService.enviarReembolso({
        pedidoId: pedido.id,
        email: pedido.email_cliente,
        items: pedido.items,
        total: Number(pedido.total),
        metodoPago: pedido.metodo_pago,
        direccionEnvio: pedido.envio_nombre
          ? {
              nombre_destinatario: pedido.envio_nombre,
              linea1: pedido.envio_linea1 ?? "",
              linea2: pedido.envio_linea2,
              ciudad: pedido.envio_ciudad ?? "",
              codigo_postal: pedido.envio_codigo_postal ?? "",
              provincia: pedido.envio_provincia ?? "",
              pais: pedido.envio_pais ?? undefined,
            }
          : null,
        estado: pedido.estado,
        fecha: new Date(pedido.created_at).toLocaleDateString("es-ES", {
          day: "numeric",
          month: "long",
          year: "numeric",
        }),
        esReembolso: true,
      });
    } catch (err) {
      this.logger.warn(`No se pudo enviar email de reembolso (pedido ${pedidoId}): ${(err as Error).message}`);
    }
  }
}
