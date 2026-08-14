import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { createTransport, type Transporter } from "nodemailer";
import { renderConfirmacionPedido, type DatosEmailPedido } from "./templates/confirmacion-pedido";
import {
  renderInstruccionesTransferencia,
  type DatosEmailTransferencia,
} from "./templates/instrucciones-transferencia";
import { renderCambioEstado, type DatosEmailEstado } from "./templates/estado-pedido";
import { renderFacturaEmitida, type DatosEmailFactura } from "./templates/factura-emitida";
import { EventosPedidoService } from "../eventos/eventos-pedido.service";

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: Transporter | null = null;
  private readonly fromEmail: string;
  /**
   * Buzón al que van las RESPUESTAS del cliente, si es distinto del remitente.
   *
   * El remitente tiene que ser del dominio propio para que SendGrid pueda
   * firmarlo con DKIM y el correo pase la alineación DMARC. Pero un dominio
   * recién configurado **no tiene MX**, así que ese buzón no recibe nada: quien
   * responda a la confirmación de su pedido se lleva un rebote. Con `Reply-To`
   * el correo sale autenticado y la respuesta llega a un buzón que alguien lee.
   *
   * Se quita cuando `valatino.es` tenga buzón propio: entonces From y Reply-To
   * coinciden y esta variable deja de hacer falta.
   */
  private readonly replyTo: string | undefined;

  constructor(private readonly eventos: EventosPedidoService) {
    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    // 2525 por defecto: Render (plan free) bloquea la salida por 465 y 587, así
    // que un puerto "estándar" deja los correos colgados hasta el timeout.
    const port = Number(process.env.SMTP_PORT ?? 2525);
    this.fromEmail = process.env.EMAIL_FROM ?? "Valatino <noreply@valatino.es>";
    // Vacía no se manda: nodemailer con `replyTo: ""` escribe una cabecera
    // inválida en vez de omitirla.
    this.replyTo = process.env.EMAIL_REPLY_TO?.trim() || undefined;

    if (host && user && pass) {
      this.transporter = createTransport({
        host,
        port,
        // TLS implícito solo en 465. En 2525/587 la conexión abre en claro y se
        // eleva con STARTTLS: `requireTLS` aborta si el servidor no lo ofrece,
        // en lugar de enviar las credenciales sin cifrar.
        secure: port === 465,
        requireTLS: port !== 465,
        auth: { user, pass },
        // Fallar rápido si el proveedor estrangula la salida SMTP (Render free
        // cuelga 465/587; usar 2525). Sin esto, un envío colgado bloquea el
        // webhook ~2 min y provoca reintentos de Stripe.
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 20000,
      });
    } else {
      this.logger.warn(
        "SMTP no configurado (SMTP_HOST/SMTP_USER/SMTP_PASS) — los emails se omitirán en este entorno",
      );
    }
  }

  async enviarConfirmacionPedido(datos: DatosEmailPedido): Promise<void> {
    const html = renderConfirmacionPedido(datos);
    const asunto = `Confirmación de tu pedido #${this.numeroVisible(datos)}`;

    if (await this.enviar({ to: datos.email, subject: asunto, html })) {
      await this.anotar(datos.pedidoId, asunto);
    }
  }

  async enviarReembolso(datos: DatosEmailPedido): Promise<void> {
    const html = renderConfirmacionPedido({ ...datos, esReembolso: true });
    const devuelto = datos.importeReembolsado ?? datos.total;
    const esParcial = Math.round(devuelto * 100) < Math.round(datos.total * 100);

    const asunto = esParcial
      ? `Devolución de ${this.importeVisible(devuelto)} — Pedido #${this.numeroVisible(datos)}`
      : `Reembolso procesado — Pedido #${this.numeroVisible(datos)}`;

    if (await this.enviar({ to: datos.email, subject: asunto, html })) {
      await this.anotar(datos.pedidoId, asunto);
    }
  }

  /**
   * Cómo hacer la transferencia. Es el único correo que el cliente necesita
   * **para actuar**: quien cierra la pestaña del checkout se queda sin el IBAN
   * y sin el concepto, y sin esto no tiene forma de pagar lo que acaba de
   * reservar.
   */
  async enviarInstruccionesTransferencia(datos: DatosEmailTransferencia): Promise<void> {
    const html = renderInstruccionesTransferencia(datos);
    const asunto = `Cómo pagar tu pedido #${datos.numeroPedido} por transferencia`;

    if (await this.enviar({ to: datos.email, subject: asunto, html })) {
      await this.anotar(datos.pedidoId, asunto);
    }
  }

  /**
   * Aviso de cambio de estado (en preparación, en camino, entregado…).
   * Los estados sin texto definido no generan correo: ver COPIAS_ESTADO.
   */
  async enviarCambioEstado(datos: DatosEmailEstado): Promise<void> {
    const render = renderCambioEstado(datos);
    if (!render) {
      this.logger.debug(`Estado ${datos.estado} sin aviso al cliente definido; no se envía email`);
      return;
    }

    if (await this.enviar({ to: datos.email, subject: render.asunto, html: render.html })) {
      await this.anotar(datos.pedidoId, render.asunto);
    }
  }

  /**
   * La factura al cliente, con el PDF adjunto.
   *
   * ⚠️⚠️ ES EL ÚNICO CORREO DE LA TIENDA QUE **LANZA** SI FALLA, y la diferencia
   * es deliberada. Todos los demás salen solos detrás de algo que ya ocurrió —un
   * cobro, un cambio de estado— y ahí tragarse el fallo es lo correcto: un SMTP
   * caído no puede tumbar una venta (`enviar()` devuelve `false` y sigue).
   *
   * Este lo dispara una persona pulsando «Enviar al cliente» y esperando la
   * respuesta. Devolver `false` en silencio pintaría un «enviada» sobre un correo
   * que no salió, y nadie volvería a intentarlo — que es exactamente el fallo que
   * la 044 dejó documentado con el reembolso que se anunciaba sin cobrarse.
   */
  async enviarFactura(datos: DatosEmailFactura): Promise<void> {
    const { asunto, html } = renderFacturaEmitida(datos);


    if (!this.transporter) {
      throw new ServiceUnavailableException(
        "El correo no está configurado en este entorno, así que la factura no se ha enviado.",
      );
    }

    try {
      await this.transporter.sendMail({
        from: this.fromEmail,
        ...(this.replyTo ? { replyTo: this.replyTo } : {}),
        to: datos.email,
        subject: asunto,
        html,
        // ⚠️ `contentType` explícito: sin él, algunos clientes se guían por la
        // extensión y un adjunto sin tipo acaba como `application/octet-stream`,
        // que el móvil ofrece «descargar» en vez de abrir.
        attachments: [
          { filename: datos.nombreArchivo, content: datos.pdf, contentType: "application/pdf" },
        ],
      });
    } catch (err) {
      this.logger.error(
        `Error SMTP enviando la factura ${datos.numero} a ${datos.email}: ${(err as Error).message}`,
      );
      throw new ServiceUnavailableException(
        `No se pudo enviar la factura ${datos.numero}: el correo no salió. Vuelve a intentarlo.`,
      );
    }

    this.logger.log(`Factura ${datos.numero} enviada a ${datos.email}`);

    // ⚠️ Y a la LÍNEA DE TIEMPO DEL PEDIDO, no solo al registro de la factura.
    // Son dos apuntes que responden a preguntas distintas y los dos hacen falta:
    // `factura_eventos` es el rastro del DOCUMENTO (lo que pide Verifactu), y el
    // historial del pedido es donde alguien mira «¿qué le hemos mandado a este
    // cliente?». Sin esto, el envío existía en la base y no se veía en ningún
    // sitio donde alguien fuera a buscarlo.
    await this.anotar(datos.pedidoId, `Factura ${datos.numero}`, datos.actorId);
  }

  /**
   * Deja el correo en la línea de tiempo del pedido. Solo se llama cuando el
   * envío ha salido bien: anunciar en el historial un correo que nunca llegó
   * sería peor que no anotarlo, porque nadie iría a comprobarlo.
   *
   * ⚠️ `actorId` es opcional porque casi todos estos correos los manda el
   * sistema detrás de un cobro o un cambio de estado. El de la factura lo pulsa
   * una persona, y entonces el historial tiene que decir **quién** — es lo que
   * distingue «se mandó» de «alguien decidió mandarlo». `registrar` pone el
   * origen `panel` en cuanto hay actor, así que aquí no hay que repetirlo.
   */
  private async anotar(pedidoId: string, asunto: string, actorId?: string): Promise<void> {
    await this.eventos.registrar({
      pedidoId,
      tipo: "email",
      detalle: asunto,
      ...(actorId ? { actorId } : { origen: "sistema" }),
    });
  }

  private importeVisible(n: number): string {
    return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n);
  }

  private numeroVisible(datos: DatosEmailPedido): string {
    return datos.numeroPedido ?? datos.pedidoId.slice(0, 8).toUpperCase();
  }

  /** Devuelve si el correo salió de verdad; los fallos se registran y no se propagan. */
  private async enviar(params: { to: string; subject: string; html: string }): Promise<boolean> {
    if (!this.transporter) {
      this.logger.debug(`[Email omitido — sin SMTP] Para: ${params.to} | Asunto: ${params.subject}`);
      return false;
    }

    try {
      await this.transporter.sendMail({
        from: this.fromEmail,
        ...(this.replyTo ? { replyTo: this.replyTo } : {}),
        to: params.to,
        subject: params.subject,
        html: params.html,
      });

      this.logger.log(`Email enviado a ${params.to}: ${params.subject}`);
      return true;
    } catch (err) {
      this.logger.error(`Error SMTP enviando email a ${params.to}: ${(err as Error).message}`);
      return false;
    }
  }
}
