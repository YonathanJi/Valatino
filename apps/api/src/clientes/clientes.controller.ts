import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from "@nestjs/common";
import { ClientesService } from "./clientes.service";
import { JwtGuard } from "../auth/guards/jwt.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { ModulosGuard } from "../auth/guards/modulos.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { Modulo, Nivel } from "../auth/decorators/modulo.decorator";
import { ActualizarClienteDto } from "./dto/actualizar-cliente.dto";

/** Clientes de la tienda — admin siempre; asesores según su nivel en el módulo. */
@Controller("admin/clientes")
@UseGuards(JwtGuard, RolesGuard, ModulosGuard)
@Roles("admin", "asesor")
@Modulo("clientes")
@Nivel("lectura")
export class ClientesController {
  constructor(private readonly service: ClientesService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(":id")
  findOne(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string) {
    return this.service.findOne(id);
  }

  @Patch(":id")
  @Nivel("edicion")
  actualizar(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() dto: ActualizarClienteDto,
  ) {
    return this.service.actualizar(id, dto);
  }

  /**
   * Borrar la cuenta de un cliente es irreversible, así que exige `total` en el
   * módulo — igual que eliminar una ficha de empleado.
   */
  @Delete(":id")
  @Nivel("total")
  eliminar(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string) {
    return this.service.eliminar(id);
  }
}
