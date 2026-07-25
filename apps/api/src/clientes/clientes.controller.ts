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
import { Modulo } from "../auth/decorators/modulo.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { ActualizarClienteDto } from "./dto/actualizar-cliente.dto";
import type { JwtPayload } from "@valatino/types";

/** Clientes de la tienda — admin siempre; asesores solo con el módulo otorgado. */
@Controller("admin/clientes")
@UseGuards(JwtGuard, RolesGuard, ModulosGuard)
@Roles("admin", "asesor")
@Modulo("clientes")
export class ClientesController {
  constructor(private readonly service: ClientesService) {}

  /** Para la UI: si el usuario actual puede eliminar cuentas. */
  @Get("permisos")
  permisos(@CurrentUser() user: JwtPayload) {
    return { esAdmin: user.role === "admin" };
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(":id")
  findOne(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string) {
    return this.service.findOne(id);
  }

  @Patch(":id")
  actualizar(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() dto: ActualizarClienteDto,
  ) {
    return this.service.actualizar(id, dto);
  }

  /**
   * Borrar la cuenta de un cliente es irreversible, así que queda reservado a
   * admin — igual que eliminar un asesor o una ficha de empleado.
   */
  @Delete(":id")
  @Roles("admin")
  eliminar(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string) {
    return this.service.eliminar(id);
  }
}
