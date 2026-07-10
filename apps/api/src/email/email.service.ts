import { Injectable, Logger } from "@nestjs/common";
import { createTransport, type Transporter } from "nodemailer";
import { renderConfirmacionPedido, type DatosEmailPedido } from "./templates/confirmacion-pedido";

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: Transporter | null = null;
  private readonly fromEmail: string;

  constructor() {
    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const port = Number(process.env.SMTP_PORT ?? 465);
    this.fromEmail = process.env.EMAIL_FROM ?? "Valatino <noreply@valatino.es>";

    if (host && user && pass) {
      this.transporter = createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });
    } else {
      this.logger.warn(
        "SMTP no configurado (SMTP_HOST/SMTP_USER/SMTP_PASS) — los emails se omitirán en este entorno",
      );
    }
  }

  async enviarConfirmacionPedido(datos: DatosEmailPedido): Promise<void> {
    const html = renderConfirmacionPedido(datos);
    await this.enviar({
      to: datos.email,
      subject: `Confirmación de tu pedido #${datos.pedidoId.slice(0, 8).toUpperCase()}`,
      html,
    });
  }

  async enviarReembolso(datos: DatosEmailPedido): Promise<void> {
    const html = renderConfirmacionPedido({ ...datos, esReembolso: true });
    await this.enviar({
      to: datos.email,
      subject: `Reembolso procesado — Pedido #${datos.pedidoId.slice(0, 8).toUpperCase()}`,
      html,
    });
  }

  private async enviar(params: { to: string; subject: string; html: string }): Promise<void> {
    if (!this.transporter) {
      this.logger.debug(`[Email omitido — sin SMTP] Para: ${params.to} | Asunto: ${params.subject}`);
      return;
    }

    try {
      await this.transporter.sendMail({
        from: this.fromEmail,
        to: params.to,
        subject: params.subject,
        html: params.html,
      });

      this.logger.log(`Email enviado a ${params.to}: ${params.subject}`);
    } catch (err) {
      this.logger.error(`Error SMTP enviando email a ${params.to}: ${(err as Error).message}`);
    }
  }
}
