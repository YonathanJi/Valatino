import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { NIVEL_LABELS, nivelAlcanza, nivelDe } from "@valatino/types";
import type { JwtPayload, NivelPermiso, StaffModulo } from "@valatino/types";
import { MODULO_KEY, NIVEL_KEY } from "../decorators/modulo.decorator";

@Injectable()
export class ModulosGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const modulos = this.reflector.getAllAndOverride<StaffModulo[] | undefined>(MODULO_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!modulos || modulos.length === 0) return true;

    // Sin @Nivel se exige el máximo. El porqué está en el decorador: un default
    // permisivo convierte cualquier olvido en un agujero silencioso.
    const requerido =
      this.reflector.getAllAndOverride<NivelPermiso | undefined>(NIVEL_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? "total";

    const request = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const user = request.user;

    // El admin no tiene filas en staff_modulos: es "total" en todo por serlo.
    if (user?.role === "admin") return true;

    if (
      user?.role === "asesor" &&
      modulos.some((modulo) => nivelAlcanza(nivelDe(user.modulos, modulo), requerido))
    ) {
      return true;
    }

    throw new ForbiddenException(`Necesitas «${NIVEL_LABELS[requerido]}» en ${modulos.join(" o ")}`);
  }
}
