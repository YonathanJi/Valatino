import { ForbiddenException, Injectable, Logger, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import { construirOrigenesPermitidos } from "./origenes-permitidos";

/** Métodos que cambian algo. Los de lectura no necesitan esta puerta. */
const METODOS_QUE_ESCRIBEN = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Frena el CSRF comprobando de dónde dice venir la petición.
 *
 * ⚠️ CORS NO es protección contra CSRF, y es la confusión que deja el agujero.
 * CORS impide que una web ajena LEA la respuesta; no impide que el navegador
 * ENVÍE la petición. Para vaciar un carrito o crear un pedido no hace falta
 * leer nada: basta con que salga.
 *
 * La cookie ya viaja como `SameSite=Lax`, que es la defensa de verdad. Esto es
 * la segunda capa, para el día que alguien tenga que volver a tocar el
 * `sameSite` por lo que sea: entonces esta comprobación sigue en pie.
 *
 * Se eligió comprobar Origin en vez de un token sincronizado porque el token
 * exige un endpoint que lo emita, guardarlo en el cliente y mandarlo en cada
 * escritura — tres piezas más que mantener para cubrir lo mismo en una API que
 * ya solo habla con su propia web.
 *
 * LA REGLA, y el matiz que la hace correcta:
 *
 * - `Origin` presente y NO permitido -> 403. Un POST cross-site desde un
 *   formulario ajeno lleva Origin, así que este es el caso que importa.
 * - `Origin` ausente -> pasa. NO es un hueco: los navegadores ponen Origin en
 *   toda petición que escribe. Sin él es que no hay navegador — Stripe
 *   llamando al webhook, un health check, curl. Rechazarlos rompería las
 *   integraciones sin frenar ningún ataque.
 * - Si no hay Origin pero sí `Referer`, se comprueba su origen: algún proxy
 *   corporativo recorta Origin y deja Referer.
 */
@Injectable()
export class OrigenCsrfMiddleware implements NestMiddleware {
  private readonly logger = new Logger(OrigenCsrfMiddleware.name);
  private readonly origenes = construirOrigenesPermitidos(process.env);

  use(req: Request, _res: Response, next: NextFunction): void {
    if (!METODOS_QUE_ESCRIBEN.has(req.method)) return next();

    const declarado = this.origenDeclarado(req);
    if (declarado === null) return next();

    if (!this.origenes.permite(declarado)) {
      this.logger.warn(`CSRF: ${req.method} ${req.originalUrl} rechazado desde ${declarado}`);
      // Mensaje sin la lista de orígenes válidos: no hace falta publicarla.
      throw new ForbiddenException("Origen no permitido para esta operación");
    }

    next();
  }

  /** El origen que dice tener la petición, o null si no lo dice. */
  private origenDeclarado(req: Request): string | null {
    const origin = req.headers.origin;
    if (typeof origin === "string" && origin && origin !== "null") return origin;

    const referer = req.headers.referer;
    if (typeof referer === "string" && referer) {
      try {
        return new URL(referer).origin;
      } catch {
        // Referer ilegible: se trata como si no viniera, que es lo que es.
        return null;
      }
    }

    return null;
  }
}
