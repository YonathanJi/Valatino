import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from "@nestjs/common";
import { PedidosService } from "./pedidos.service";
import { ReembolsosService } from "./reembolsos.service";
import { JwtGuard } from "../auth/guards/jwt.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { ModulosGuard } from "../auth/guards/modulos.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { Modulo } from "../auth/decorators/modulo.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { UpdateEstadoDto } from "./dto/update-estado.dto";
import { CrearReembolsoDto } from "./dto/crear-reembolso.dto";
import type { JwtPayload, ResultadoReembolso } from "@valatino/types";

@Controller("admin/pedidos")
@UseGuards(JwtGuard, RolesGuard, ModulosGuard)
@Roles("admin", "asesor")
@Modulo("pedidos")
export class AdminPedidosController {
  constructor(
    private readonly pedidosService: PedidosService,
    private readonly reembolsosService: ReembolsosService,
  ) {}

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

  /**
   * Devuelve dinero de un pedido, total o parcialmente. Solo admin: mover
   * dinero fuera no es una tarea de asesor, igual que cancelar.
   *
   * No es un cambio de estado más — cobra el reembolso en Stripe — por eso vive
   * en su propia ruta y no en PATCH :id/estado.
   */
  @Post(":id/reembolso")
  @Roles("admin")
  reembolsar(
    @Param("id") id: string,
    @Body() dto: CrearReembolsoDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<ResultadoReembolso> {
    return this.reembolsosService.reembolsar(id, dto, user.email);
  }
}
