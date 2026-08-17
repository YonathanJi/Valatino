import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { JwtGuard } from "../auth/guards/jwt.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { decidirIpDeLaCuota } from "./throttler-ip-real.guard";

/**
 * Qué ve la API de quien la llama.
 *
 * Existe porque el problema que arregla `throttler-ip-real.guard.ts` **no se
 * puede comprobar desde fuera**: se intentó deducirlo leyendo las cabeceras
 * `X-RateLimit-*` de `/health`, y no sirve — a esa ruta llegan también los
 * health checks del hosting y cualquier monitor, así que los contadores se
 * mueven solos y no hay forma de separar los cubos.
 *
 * Y sobre todo porque la avería es MUDA: si el secreto falta en un lado, o si
 * los nombres de las cabeceras divergen, todo sigue funcionando exactamente
 * igual — solo que agrupando de nuevo a la tienda entera bajo la IP de Vercel.
 * Sin esto, la única forma de enterarse sería que alguien se quejara de un 429
 * raro un día de mucha venta.
 *
 * ⚠️ NO devuelve el secreto, ni siquiera un trozo: solo si coincide o no.
 */
@Controller("diagnostico")
@UseGuards(JwtGuard, RolesGuard)
@Roles("admin")
export class DiagnosticoController {
  @Get("red")
  red(@Req() req: Request) {
    const decision = decidirIpDeLaCuota(
      req as unknown as Record<string, unknown>,
      process.env.PROXY_API_SECRETO,
    );

    return {
      /** La clave con la que se cuenta la cuota. Es la que importa. */
      ipQueUsaLaCuota: decision.ip,
      /** A quién se le atribuye la conexión según `trust proxy`. */
      ipDeLaConexion: req.ip,
      /** La cadena entera, para ver cuántos saltos hay de verdad. */
      cadenaXForwardedFor: req.headers["x-forwarded-for"] ?? null,
      /** `true` solo si el proxy trajo el secreto y coincide. */
      proxyIdentificado: decision.proxyIdentificado,
      motivo: decision.motivo,
      secretoConfigurado: Boolean(process.env.PROXY_API_SECRETO),
      saltosDeProxy: process.env.TRUST_PROXY_HOPS ?? "(sin definir)",
    };
  }
}
