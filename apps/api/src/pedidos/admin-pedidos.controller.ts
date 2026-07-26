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
  ParseUUIDPipe,
  DefaultValuePipe,
} from "@nestjs/common";
import { PedidosService } from "./pedidos.service";
import { ReembolsosService } from "./reembolsos.service";
import { JwtGuard } from "../auth/guards/jwt.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { ModulosGuard } from "../auth/guards/modulos.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { Modulo, Nivel } from "../auth/decorators/modulo.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { nivelEfectivo } from "../auth/nivel-efectivo";
import { UpdateEstadoDto } from "./dto/update-estado.dto";
import { CrearReembolsoDto } from "./dto/crear-reembolso.dto";
import type { JwtPayload, ResultadoReembolso } from "@valatino/types";

@Controller("admin/pedidos")
@UseGuards(JwtGuard, RolesGuard, ModulosGuard)
@Roles("admin", "asesor")
@Modulo("pedidos")
@Nivel("lectura")
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

  /**
   * Ficha completa: líneas del pedido, datos de envío e historial de todo lo
   * que le ha pasado. Basta con lectura: que el equipo entero pueda ver quién
   * tocó un pedido es justamente el objetivo.
   */
  @Get(":id")
  findOne(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string) {
    return this.pedidosService.findOneDetalle(id);
  }

  /**
   * El guard solo comprueba el permiso grueso (`edicion` en pedidos); qué
   * transiciones concretas caben depende además del nivel, y eso lo decide
   * transicionesPermitidas: cancelar exige `total`.
   */
  @Patch(":id/estado")
  @Nivel("edicion")
  updateEstado(
    @Param("id") id: string,
    @Body() dto: UpdateEstadoDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.pedidosService.updateEstado(
      id,
      dto.estado,
      nivelEfectivo(user, "pedidos") ?? "lectura",
      user.sub,
    );
  }

  /**
   * Devuelve dinero de un pedido, total o parcialmente. Exige `total` en
   * pedidos: mover dinero fuera es irreversible, igual que cancelar.
   *
   * Antes era @Roles("admin"). Dejarlo así vaciaría de contenido el nivel
   * `total`, que es justo el que se le da a un Director Comercial para que
   * pueda resolver una devolución sin tener acceso a TI.
   *
   * No es un cambio de estado más — cobra el reembolso en Stripe — por eso vive
   * en su propia ruta y no en PATCH :id/estado.
   */
  @Post(":id/reembolso")
  @Nivel("total")
  reembolsar(
    @Param("id") id: string,
    @Body() dto: CrearReembolsoDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<ResultadoReembolso> {
    return this.reembolsosService.reembolsar(id, dto, user.email, user.sub);
  }
}
