import { Controller, Post, Req, HttpCode, HttpStatus, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { CheckoutService } from "./checkout.service";
import { OptionalJwtGuard } from "../auth/guards/optional-jwt.guard";

@Controller("checkout")
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
