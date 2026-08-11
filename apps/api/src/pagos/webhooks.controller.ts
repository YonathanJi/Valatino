import {
  Controller,
  Get,
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
import { Throttle, SkipThrottle } from "@nestjs/throttler";
import { LIMITE_CREAR_PAGO } from "../common/limites-peticiones";
import { StripeService } from "./stripe.service";
import { PaypalService } from "./paypal.service";
import { TransferenciaService } from "../pedidos/transferencia.service";
import {
  InventarioService,
  type DireccionSnapshotPedido,
} from "../inventario/inventario.service";
import { CarritoService } from "../carrito/carrito.service";
import { ConfirmacionPedidoService } from "../pedidos/confirmacion-pedido.service";
import { OptionalJwtGuard } from "../auth/guards/optional-jwt.guard";
import {
  CrearPagoDto,
  CrearTransferenciaDto,
  DireccionSnapshotDto,
} from "./dto/crear-pago.dto";
import { CapturarOrdenDto } from "./dto/capturar-orden.dto";
import { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_CLIENT } from "../supabase/supabase.module";
import { normalizarTelefono, provinciaPorCP } from "@valatino/types";
import { municipioCanonico } from "../common/datos/municipios";
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
    private readonly transferenciaService: TransferenciaService,
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

    // Este snapshot es el que acaba copiado en las columnas `envio_*` del
    // pedido y de ahí lo lee el listado de clientes, así que se guarda ya
    // canónico: el teléfono en 9 dígitos, el municipio con su nombre oficial del
    // INE y la provincia DERIVADA del CP (la que venga en el DTO se descarta).
    // Con la dirección guardada no hace falta, porque DireccionesService lo dejó
    // así al crearla.
    await this.inventarioService.guardarCheckoutDatos({
      sessionId,
      userId,
      email: dto.email,
      documento: dto.documento,
      direccionEnvioId: userId ? dto.direccion_envio_id : undefined,
      direccion: dto.direccion && this.normalizarDireccion(dto.direccion),
    });
  }

  private normalizarDireccion(direccion: DireccionSnapshotDto): DireccionSnapshotPedido {
    const provincia = provinciaPorCP(direccion.codigo_postal);
    const municipio = municipioCanonico(direccion.codigo_postal, direccion.ciudad);

    // El DTO ya valida las dos cosas; esto es el cinturón por si alguien añade
    // otra ruta que construya el snapshot sin pasar por el mismo DTO.
    if (!provincia || !municipio) {
      throw new BadRequestException(
        "La dirección de envío no es válida: revisa el código postal y la localidad",
      );
    }

    return {
      ...direccion,
      ciudad: municipio,
      provincia,
      codigo_postal: direccion.codigo_postal.trim(),
      telefono: direccion.telefono ? normalizarTelefono(direccion.telefono) || undefined : undefined,
    };
  }

  // ──────────────────────────────────────────────
  // Stripe: crear intención de pago
  // ──────────────────────────────────────────────

  @Post("stripe/create-payment-intent")
  @Throttle(LIMITE_CREAR_PAGO)
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
  // Transferencia bancaria: crear el pedido que espera el ingreso
  // ──────────────────────────────────────────────

  /**
   * Si la tienda acepta transferencias. Público y sin datos de la cuenta: el
   * checkout solo necesita saber si pintar la opción, y el IBAN se entrega al
   * crear el pedido, junto al concepto con el que hay que pagarlo.
   */
  @Get("transferencia/disponibilidad")
  disponibilidadTransferencia() {
    return this.transferenciaService.disponibilidad();
  }

  /**
   * A diferencia de tarjeta o Bizum, aquí el pedido se crea AHORA y sin dinero
   * cobrado: queda en PENDIENTE_PAGO reteniendo su stock hasta que alguien del
   * equipo confirme el ingreso, o hasta que venza el plazo y se cancele solo.
   */
  @Post("transferencia/crear-pedido")
  @Throttle(LIMITE_CREAR_PAGO)
  @UseGuards(OptionalJwtGuard)
  @HttpCode(HttpStatus.CREATED)
  async crearPedidoTransferencia(
    @Req() req: SessionRequest,
    @Body() dto: CrearTransferenciaDto,
  ) {
    const sessionId = req.sessionId ?? "";
    const userId = req.user?.sub;

    const carrito = await this.carritoService.getCarrito(sessionId, userId);
    if (carrito.items.length === 0) {
      throw new BadRequestException("El carrito está vacío");
    }

    // Misma validación de dirección y datos que los otros métodos: la provincia
    // se recalcula desde el CP y el municipio se comprueba contra ella.
    await this.validarYGuardarCheckout(sessionId, userId, dto);

    return this.transferenciaService.crearPedido({
      sessionId,
      usuarioAutenticado: userId,
      userId,
      claveIdempotencia: dto.clave_idempotencia,
      direccionEnvioId: dto.direccion_envio_id,
      email: dto.email?.toLowerCase(),
      documento: dto.documento,
      // Normalizada, no la del DTO: la provincia se deriva del CP y el
      // municipio se guarda con su nombre oficial del INE (041). Este snapshot
      // acaba en las columnas `envio_*` del pedido, que es de donde el módulo
      // Clientes deriva el nombre y el teléfono reales.
      envio: dto.direccion ? this.normalizarDireccion(dto.direccion) : null,
    });
  }

  // ──────────────────────────────────────────────
  // PayPal: crear orden
  // ──────────────────────────────────────────────

  @Post("paypal/create-order")
  @Throttle(LIMITE_CREAR_PAGO)
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

  /**
   * Solo se captura una orden creada por esta misma sesión de checkout: el
   * `custom_id` que se grabó al crearla (`session|user`) tiene que coincidir con
   * la sesión que llama. Antes el endpoint no tenía guard ni DTO y aceptaba
   * cualquier orderID de PayPal que se conociera.
   */
  @Post("paypal/capture-order")
  @Throttle(LIMITE_CREAR_PAGO)
  @UseGuards(OptionalJwtGuard)
  @HttpCode(HttpStatus.OK)
  async capturePaypalOrder(@Req() req: SessionRequest, @Body() dto: CapturarOrdenDto) {
    const sessionId = req.sessionId ?? "";
    const userId = req.user?.sub;

    const propietario = await this.paypalService.getOrderCustomId(dto.order_id);
    const esperado = [sessionId, userId ?? ""].join("|");

    if (propietario !== esperado) {
      this.logger.warn(
        `Intento de capturar la orden PayPal ${dto.order_id} desde otra sesión (esperado ${esperado}, orden ${propietario ?? "sin custom_id"})`,
      );
      throw new ForbiddenException("Esta orden de pago no pertenece a tu sesión");
    }

    return this.paypalService.captureOrder(dto.order_id);
  }

  // ──────────────────────────────────────────────
  // Stripe: webhook (firma verificada)
  // ──────────────────────────────────────────────

  // Exento del limite de peticiones a proposito, y es lo unico que se exime.
  // La firma se verifica antes de tocar nada, asi que un envio sin firma no
  // llega a hacer trabajo; y un 429 aqui es un pago cobrado cuyo pedido NO se
  // crea. Stripe reintenta, pero tras una caida llegan a rafagas y cualquier
  // techo razonable las cortaria.
  @Post("stripe/webhook")
  @SkipThrottle()
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

      // Con qué pagó: el intent solo dice qué se le ofreció, el tipo real está
      // en el cargo. Hace falta desde que la cuenta acepta Bizum — antes
      // «Stripe» y «tarjeta» eran lo mismo y el correo lo daba por hecho.
      const metodoDetalle = await this.stripeService.tipoDePago(intent.id);

      await this.confirmacionPedido.confirmarPago({
        metodoDetalle,
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

    /*
     * El reembolso se aceptó pero no llegó a completarse. Con tarjeta esto
     * prácticamente no pasa; con **Bizum sí**, porque sus devoluciones son
     * asíncronas y pueden fallar minutos después de darlas por buenas. Stripe
     * devuelve el importe a nuestro saldo y el cliente se queda sin su dinero,
     * con el pedido ya marcado como reembolsado. Tiene que quedar constancia.
     */
    /*
     * La documentación de Bizum habla de `refund.failed`, pero ese evento no
     * existe en la versión de API que usa esta cuenta (2024-06-20): aquí el
     * fallo llega como `refund.updated` con el estado ya en «failed». Se
     * escuchan los dos nombres del mismo aviso —`charge.refund.updated` es el
     * heredado— y se filtra por estado, que es lo que de verdad importa.
     */
    if (event.type === "refund.updated" || event.type === "charge.refund.updated") {
      const refund = event.data.object as Stripe.Refund;

      if (refund.status === "failed" || refund.status === "canceled") {
        const paymentIntentId =
          typeof refund.payment_intent === "string"
            ? refund.payment_intent
            : refund.payment_intent?.id;

        if (paymentIntentId) {
          await this.confirmacionPedido.procesarReembolsoFallido({
            referenciaPago: paymentIntentId,
            importe: (refund.amount ?? 0) / 100,
            motivo: refund.failure_reason ?? refund.status,
          });
        }
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

  // Exento del limite de peticiones a proposito, y es lo unico que se exime.
  // La firma se verifica antes de tocar nada, asi que un envio sin firma no
  // llega a hacer trabajo; y un 429 aqui es un pago cobrado cuyo pedido NO se
  // crea. Stripe reintenta, pero tras una caida llegan a rafagas y cualquier
  // techo razonable las cortaria.
  @Post("paypal/webhook")
  @SkipThrottle()
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
