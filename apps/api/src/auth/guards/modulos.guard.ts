import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { JwtPayload, StaffModulo } from "@valatino/types";
import { MODULO_KEY } from "../decorators/modulo.decorator";

@Injectable()
export class ModulosGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const modulo = this.reflector.getAllAndOverride<StaffModulo | undefined>(MODULO_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!modulo) return true;

    const request = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const user = request.user;

    if (user?.role === "admin") return true;
    if (user?.role === "asesor" && user.modulos?.includes(modulo)) return true;

    throw new ForbiddenException(`No tienes acceso al módulo de ${modulo}`);
  }
}
