import { Controller, Post, Req, HttpCode, HttpStatus, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { Throttle } from "@nestjs/throttler";
import { CheckoutService } from "./checkout.service";
import { OptionalJwtGuard } from "../auth/guards/optional-jwt.guard";
import { LIMITE_CARRITO } from "../common/limites-peticiones";

// `reservar` bloquea filas de productos para mover stock: es de lo más caro que
// se puede pedir sin estar autenticado, así que va con su propio techo.
@Controller("checkout")
@Throttle(LIMITE_CARRITO)
@UseGuards(OptionalJwtGuard)
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  @Post("reservar")
  @HttpCode(HttpStatus.CREATED)
  reservar(
    @Req() req: Request & { sessionId?: string; user?: { sub: string } },
  ) {
    return this.checkoutService.reservar(
      req.sessionId ?? "",
      req.user?.sub,
    );
  }
}
