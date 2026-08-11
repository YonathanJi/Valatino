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

      // ⚠️ ESTO ERA `none`, y el motivo ya no existe.
      //
      // Cuando la web vivía en `*.vercel.app` y la API en `*.onrender.com`, el
      // navegador los tenía por sitios DISTINTOS (los dos dominios están en la
      // Public Suffix List), así que la cookie tenía que viajar como de tercera
      // parte o el carrito del invitado se vaciaba en cada petición.
      //
      // Hoy no es así, y se comprobó contra producción antes de cambiarlo: el
      // navegador habla con el proxy `/api` de la propia web, la cookie vuelve
      // por ahí y se guarda en **valatino.es**, de primera parte.
      //
      // Y `none` no era solo innecesario: es lo que abría el CSRF. Con ella,
      // una web ajena podía lanzar un POST a valatino.es/api/... y el navegador
      // adjuntaba la cookie. CORS no lo impide — impide LEER la respuesta, no
      // enviar la petición, y para cambiar un carrito no hace falta leerla.
      //
      // `lax` no rompe nada porque todas las llamadas con credenciales son del
      // mismo origen (`apiFetch` siempre usa `/api`); las dos que van directas
      // a `api.valatino.es` no mandan cookie.
      //
      // El HTTPS se sigue detectando de la propia petición (Render y Vercel
      // ponen `X-Forwarded-Proto`) y NO de NODE_ENV, que en Render está mal.
      const forwardedProto = req.headers["x-forwarded-proto"];
      const protoHeader = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
      const esHttps = req.secure || protoHeader?.split(",")[0].trim() === "https";
      res.cookie(SESSION_COOKIE, sessionId, {
        httpOnly: true,
        secure: esHttps,
        sameSite: "lax",
        maxAge: 1000 * 60 * 60 * 24 * 30, // 30 días
        path: "/",
      });
    }

    // Adjuntar al request para uso posterior en servicios
    (req as Request & { sessionId: string }).sessionId = sessionId;
    next();
  }
}
