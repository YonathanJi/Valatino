import { Module } from "@nestjs/common";
import { CarritoService } from "./carrito.service";
import { CarritoController } from "./carrito.controller";
import { CheckoutService } from "./checkout.service";
import { CheckoutController } from "./checkout.controller";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  controllers: [CarritoController, CheckoutController],
  providers: [CarritoService, CheckoutService],
  exports: [CarritoService, CheckoutService],
})
export class CarritoModule {}