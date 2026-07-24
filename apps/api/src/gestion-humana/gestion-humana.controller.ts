import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { GestionHumanaService } from "./gestion-humana.service";
import { JwtGuard } from "../auth/guards/jwt.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { ModulosGuard } from "../auth/guards/modulos.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { Modulo } from "../auth/decorators/modulo.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { CrearEmpleadoDto } from "./dto/crear-empleado.dto";
import { ActualizarEmpleadoDto } from "./dto/actualizar-empleado.dto";
import { GenerarHistorialDto } from "./dto/generar-historial.dto";
import type { JwtPayload } from "@valatino/types";

/** Gestión Humana — admin siempre; asesores solo con el módulo otorgado. */
@Controller("admin/gestion-humana")
@UseGuards(JwtGuard, RolesGuard, ModulosGuard)
@Roles("admin", "asesor")
@Modulo("gestion_humana")
export class GestionHumanaController {
  constructor(private readonly service: GestionHumanaService) {}

  @Get("cargos")
  listarCargos() {
    return this.service.listarCargos();
  }

  /** Para la UI: si el usuario actual es admin (puede eliminar fichas). */
  @Get("permisos")
  permisos(@CurrentUser() user: JwtPayload) {
    return { esAdmin: user.role === "admin" };
  }

  @Get("empleados")
  listarEmpleados() {
    return this.service.listarEmpleados();
  }

  @Get("empleados/:id")
  obtenerEmpleado(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string) {
    return this.service.obtenerEmpleado(id);
  }

  @Post("empleados")
  crear(@Body() dto: CrearEmpleadoDto) {
    return this.service.crear(dto);
  }

  @Patch("empleados/:id")
  actualizar(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() dto: ActualizarEmpleadoDto,
  ) {
    return this.service.actualizar(id, dto);
  }

  @Delete("empleados/:id")
  @Roles("admin")
  eliminar(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string) {
    return this.service.eliminarEmpleado(id);
  }

  @Post("historial/generar")
  generarHistorial(@Body() dto: GenerarHistorialDto) {
    return this.service.generarHistorial(dto.anio, dto.mes);
  }

  @Get("historial")
  listarHistorial(
    @Query("anio", ParseIntPipe) anio: number,
    @Query("mes", ParseIntPipe) mes: number,
  ) {
    return this.service.listarHistorial(anio, mes);
  }
}
