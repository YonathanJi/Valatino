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
  async smtp(@Query("k") k: string) {
    if (k !== "valatino-diag-2026") return { error: "no autorizado" };

    const host = process.env.SMTP_HOST ?? "";
    const user = process.env.SMTP_USER ?? "";
    const pass = process.env.SMTP_PASS ?? "";
    const configurado = Boolean(host && user && pass);

    const puertos: Array<{ port: number; secure: boolean }> = [
      { port: 465, secure: true },
      { port: 587, secure: false },
      { port: 2525, secure: false },
    ];

    const resultados = await Promise.all(
      puertos.map(async ({ port, secure }) => {
        const inicio = Date.now();
        try {
          const t = createTransport({
            host,
            port,
            secure,
            auth: { user, pass },
            connectionTimeout: 8000,
            greetingTimeout: 8000,
          });
          await t.verify();
          return { port, secure, ok: true, ms: Date.now() - inicio };
        } catch (e) {
          return { port, secure, ok: false, ms: Date.now() - inicio, error: (e as Error).message };
        }
      }),
    );

    return { host, user, configurado, resultados };
  }
}
