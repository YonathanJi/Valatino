import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from "@nestjs/common";
import { PedidosService } from "./pedidos.service";
import { JwtGuard } from "../auth/guards/jwt.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { ModulosGuard } from "../auth/guards/modulos.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { Modulo } from "../auth/decorators/modulo.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { UpdateEstadoDto } from "./dto/update-estado.dto";
import type { JwtPayload } from "@valatino/types";

@Controller("admin/pedidos")
@UseGuards(JwtGuard, RolesGuard, ModulosGuard)
@Roles("admin", "asesor")
@Modulo("pedidos")
export class AdminPedidosController {
  constructor(private readonly pedidosService: PedidosService) {}

  @Get()
  findAll(
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query("estado") estado?: string,
    @Query("desde") desde?: string,
    @Query("hasta") hasta?: string,
  ) {
    return this.pedidosService.findAll(page, limit, estado, desde, hasta);
  }

  @Patch(":id/estado")
  updateEstado(
    @Param("id") id: string,
    @Body() dto: UpdateEstadoDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.pedidosService.updateEstado(id, dto.estado, user.role as "admin" | "asesor");
  }
}
