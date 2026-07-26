import { Injectable, Logger } from "@nestjs/common";
import { createTransport, type Transporter } from "nodemailer";
import { renderConfirmacionPedido, type DatosEmailPedido } from "./templates/confirmacion-pedido";
import { renderCambioEstado, type DatosEmailEstado } from "./templates/estado-pedido";
import { EventosPedidoService } from "../eventos/eventos-pedido.service";

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: Transporter | null = null;
  private readonly fromEmail: string;

  constructor(private readonly eventos: EventosPedidoService) {
    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    // 2525 por defecto: Render (plan free) bloquea la salida por 465 y 587, así
    // que un puerto "estándar" deja los correos colgados hasta el timeout.
    const port = Number(process.env.SMTP_PORT ?? 2525);
    this.fromEmail = process.env.EMAIL_FROM ?? "Valatino <noreply@valatino.es>";

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
   * Deja el correo en la línea de tiempo del pedido. Solo se llama cuando el
   * envío ha salido bien: anunciar en el historial un correo que nunca llegó
   * sería peor que no anotarlo, porque nadie iría a comprobarlo.
   */
  private async anotar(pedidoId: string, asunto: string): Promise<void> {
    await this.eventos.registrar({ pedidoId, tipo: "email", detalle: asunto, origen: "sistema" });
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
