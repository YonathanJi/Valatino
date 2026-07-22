import { Controller, Get, Query } from "@nestjs/common";
import { createTransport } from "nodemailer";

/** Endpoint público de salud para el health check del proveedor de hosting */
@Controller("health")
export class HealthController {
  @Get()
  check() {
    return { status: "ok" };
  }

  /**
   * DIAGNÓSTICO TEMPORAL — prueba la salida SMTP desde el propio Render por
   * varios puertos, para verificar si el proveedor bloquea/ralentiza el envío.
   * No expone secretos ni envía email. Eliminar tras diagnosticar.
   */
  @Get("smtp")
  async smtp(@Query("k") k: string, @Query("send") send?: string) {
    if (k !== "valatino-diag-2026") return { error: "no autorizado" };

    const host = process.env.SMTP_HOST ?? "";
    const user = process.env.SMTP_USER ?? "";
    const pass = process.env.SMTP_PASS ?? "";
    const port = Number(process.env.SMTP_PORT ?? 465);
    const from = process.env.EMAIL_FROM ?? "";
    const configurado = Boolean(host && user && pass);

    // Envío REAL desde Render con la misma config que EmailService, para
    // reproducir exactamente el email de pedido. ?send=correo@dominio
    let envio: unknown = "omitido (usa ?send=correo@dominio)";
    if (send) {
      const inicio = Date.now();
      try {
        const t = createTransport({ host, port, secure: port === 465, auth: { user, pass } });
        const info = await t.sendMail({
          from,
          to: send,
          subject: `Prueba envío desde Render ${new Date().toISOString()}`,
          html: "<p>Prueba de envío del email de pedido <strong>desde Render</strong> (mismo camino que EmailService). Si llega, el envío en producción funciona.</p>",
        });
        envio = { ok: true, ms: Date.now() - inicio, port, from, response: info.response, accepted: info.accepted, rejected: info.rejected };
      } catch (e) {
        envio = { ok: false, ms: Date.now() - inicio, port, from, error: (e as Error).message };
      }
    }

    return { host, user, port, from, configurado, envio };
  }
}
