import { Module } from "@nestjs/common";
import { PaypalService } from "./paypal.service";
import { PagosController } from "./webhooks.controller";
import { StripeModule } from "./stripe.module";
import { InventarioModule } from "../inventario/inventario.module";
import { CarritoModule } from "../carrito/carrito.module";
import { PedidosModule } from "../pedidos/pedidos.module";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [StripeModule, InventarioModule, CarritoModule, PedidosModule, AuthModule],
  controllers: [PagosController],
  providers: [PaypalService],
  // Se re-exporta StripeModule para no romper a quien importaba PagosModule
  // esperando encontrar aquí StripeService.
  exports: [StripeModule, PaypalService],
})
export class PagosModule {}
