import { Module } from "@nestjs/common";
import { PedidosService } from "./pedidos.service";
import { ConfirmacionPedidoService } from "./confirmacion-pedido.service";
import { ReembolsosService } from "./reembolsos.service";
import { PedidosController, PedidosPublicController } from "./pedidos.controller";
import { AdminPedidosController } from "./admin-pedidos.controller";
import { InventarioModule } from "../inventario/inventario.module";
import { StripeModule } from "../pagos/stripe.module";

@Module({
  // StripeModule y no PagosModule: PagosModule importa este módulo, así que
  // importarlo aquí sería circular. Ver stripe.module.ts.
  imports: [InventarioModule, StripeModule],
  controllers: [PedidosController, PedidosPublicController, AdminPedidosController],
  providers: [PedidosService, ConfirmacionPedidoService, ReembolsosService],
  exports: [PedidosService, ConfirmacionPedidoService, ReembolsosService],
})
export class PedidosModule {}
