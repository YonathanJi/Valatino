import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
  NotFoundException,
} from "@nestjs/common";
import { PedidosService } from "./pedidos.service";
import { JwtGuard } from "../auth/guards/jwt.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { JwtPayload } from "@valatino/types";

@Controller("pedidos")
@UseGuards(JwtGuard)
export class PedidosController {
  constructor(private readonly pedidosService: PedidosService) {}

  @Get()
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.pedidosService.findByUser(user.sub, page, limit);
  }

  @Get(":id")
  findOne(@Param("id") id: string, @CurrentUser() user: JwtPayload) {
    return this.pedidosService.findOneByUser(id, user.sub);
  }

  @Post("vincular")
  vincular(@CurrentUser() user: JwtPayload) {
    return this.pedidosService.vincularPorEmail(user.sub);
  }
}

/**
 * Consulta pública del número de pedido tras el pago. Sin JWT: la referencia
 * de pago (payment_intent de Stripe / capture_id de PayPal) solo la conoce
 * quien pagó, y la respuesta se limita a número de pedido y estado.
 */
@Controller("pedidos")
export class PedidosPublicController {
  constructor(private readonly pedidosService: PedidosService) {}

  @Get("por-referencia/:referencia")
  async porReferencia(@Param("referencia") referencia: string) {
    const resumen = await this.pedidosService.findResumenPorReferencia(referencia);
    if (!resumen) throw new NotFoundException("Pedido no encontrado");
    return resumen;
  }
}
