import { Module } from "@nestjs/common";
import { StripeService } from "./stripe.service";
import { PaypalService } from "./paypal.service";
import { PagosController } from "./webhooks.controller";
import { InventarioModule } from "../inventario/inventario.module";
import { CarritoModule } from "../carrito/carrito.module";
import { PedidosModule } from "../pedidos/pedidos.module";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [InventarioModule, CarritoModule, PedidosModule, AuthModule],
  controllers: [PagosController],
  providers: [StripeService, PaypalService],
  exports: [StripeService, PaypalService],
})
export class PagosModule {}
