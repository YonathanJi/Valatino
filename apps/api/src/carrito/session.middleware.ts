import { Injectable, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";

export const SESSION_COOKIE = "valatino-session";

@Injectable()
export class SessionMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    let sessionId = req.cookies?.[SESSION_COOKIE] as string | undefined;

    if (!sessionId) {
      sessionId = uuidv4();
      // La web (Vercel) y la API (Render) viven en dominios distintos → la
      // cookie de sesión es cross-site. El navegador solo la envía en fetch/XHR
      // si es `SameSite=None; Secure`; con `lax` no viaja y cada petición del
      // invitado abriría una sesión nueva (carrito siempre vacío).
      // Se detecta HTTPS desde la propia petición (Render/Vercel ponen
      // `X-Forwarded-Proto: https`) en vez de depender de NODE_ENV, que no es
      // fiable en la instancia. En local (http) → `lax` sin secure.
      const forwardedProto = req.headers["x-forwarded-proto"];
      const protoHeader = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
      const esHttps = req.secure || protoHeader?.split(",")[0].trim() === "https";
      res.cookie(SESSION_COOKIE, sessionId, {
        httpOnly: true,
        secure: esHttps,
        sameSite: esHttps ? "none" : "lax",
        maxAge: 1000 * 60 * 60 * 24 * 30, // 30 días
        path: "/",
      });
    }

    // Adjuntar al request para uso posterior en servicios
    (req as Request & { sessionId: string }).sessionId = sessionId;
    next();
  }
}
