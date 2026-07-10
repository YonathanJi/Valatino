import { Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

/**
 * Guard JWT opcional: si hay un Bearer token válido, popula `req.user`;
 * si no hay token (o es inválido), la request continúa como anónima.
 *
 * Necesario en carrito/checkout/pagos, donde el flujo funciona tanto para
 * invitados (cookie de sesión) como para usuarios autenticados.
 */
@Injectable()
export class OptionalJwtGuard extends AuthGuard("jwt") {
  override handleRequest<TUser = unknown>(_err: unknown, user: TUser): TUser {
    return (user || undefined) as TUser;
  }
}
