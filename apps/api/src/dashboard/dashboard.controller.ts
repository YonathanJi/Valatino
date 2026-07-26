import { Controller, Get, UseGuards } from "@nestjs/common";
import { DashboardService } from "./dashboard.service";
import { JwtGuard } from "../auth/guards/jwt.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { ModulosGuard } from "../auth/guards/modulos.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { Modulo, Nivel } from "../auth/decorators/modulo.decorator";

// Métricas gerenciales — admin siempre; asesores según su nivel.
//
// El módulo solo tiene esta ruta, así que `edicion` y `total` no habilitan hoy
// nada por encima de `lectura`. Se deja el nivel visible igualmente en el
// selector de TI para no inventar una excepción por un único caso; si mañana el
// dashboard gana una acción (exportar, fijar objetivos), ya tiene dónde colgarse.
@Controller("admin/dashboard")
@UseGuards(JwtGuard, RolesGuard, ModulosGuard)
@Roles("admin", "asesor")
@Modulo("dashboard")
@Nivel("lectura")
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  getDashboard() {
    return this.dashboardService.getDashboard();
  }
}
