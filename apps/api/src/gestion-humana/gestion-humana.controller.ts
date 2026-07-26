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
import { Modulo, Nivel } from "../auth/decorators/modulo.decorator";
import { CrearEmpleadoDto } from "./dto/crear-empleado.dto";
import { ActualizarEmpleadoDto } from "./dto/actualizar-empleado.dto";
import { GenerarHistorialDto } from "./dto/generar-historial.dto";
import { ActualizarCargoDto, CrearCargoDto } from "./dto/cargo.dto";

/** Gestión Humana — admin siempre; asesores según su nivel en el módulo. */
@Controller("admin/gestion-humana")
@UseGuards(JwtGuard, RolesGuard, ModulosGuard)
@Roles("admin", "asesor")
@Modulo("gestion_humana")
@Nivel("lectura")
export class GestionHumanaController {
  constructor(private readonly service: GestionHumanaService) {}

  @Get("cargos")
  listarCargos() {
    return this.service.listarCargos();
  }

  @Post("cargos")
  @Nivel("edicion")
  crearCargo(@Body() dto: CrearCargoDto) {
    return this.service.crearCargo(dto);
  }

  /**
   * Renombrar o desactivar. Desactivar es lo más parecido a borrar que ofrece
   * el módulo: `empleados.cargo_id` es NOT NULL con clave ajena, así que un
   * borrado de verdad rompería fichas y el histórico mensual.
   */
  @Patch("cargos/:id")
  @Nivel("edicion")
  actualizarCargo(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() dto: ActualizarCargoDto,
  ) {
    return this.service.actualizarCargo(id, dto);
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
  @Nivel("edicion")
  crear(@Body() dto: CrearEmpleadoDto) {
    return this.service.crear(dto);
  }

  @Patch("empleados/:id")
  @Nivel("edicion")
  actualizar(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() dto: ActualizarEmpleadoDto,
  ) {
    return this.service.actualizar(id, dto);
  }

  @Delete("empleados/:id")
  @Nivel("total")
  eliminar(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string) {
    return this.service.eliminarEmpleado(id);
  }

  /**
   * Exige `total` aunque la RPC sea idempotente: regenerar un mes ya cerrado
   * reescribe el snapshot con los datos de hoy y el valor anterior se pierde.
   * Es la única operación de RRHH que altera datos pasados sin deshacer.
   */
  @Post("historial/generar")
  @Nivel("total")
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
