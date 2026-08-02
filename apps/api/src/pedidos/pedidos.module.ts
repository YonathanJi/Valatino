import { Module } from "@nestjs/common";
import { PedidosService } from "./pedidos.service";
import { ConfirmacionPedidoService } from "./confirmacion-pedido.service";
import { ReembolsosService } from "./reembolsos.service";
import { TransferenciaService } from "./transferencia.service";
import { PedidosController, PedidosPublicController } from "./pedidos.controller";
import { AdminPedidosController } from "./admin-pedidos.controller";
import { InventarioModule } from "../inventario/inventario.module";
import { StripeModule } from "../pagos/stripe.module";
import { CalificacionesModule } from "../calificaciones/calificaciones.module";

@Module({
  // StripeModule y no PagosModule: PagosModule importa este módulo, así que
  // importarlo aquí sería circular. Ver stripe.module.ts.
  //
  // CalificacionesModule va en este sentido y no al revés: la ficha del pedido
  // adjunta la opinión, pero la calificación no necesita saber nada de pedidos
  // más allá de su id.
  imports: [InventarioModule, StripeModule, CalificacionesModule],
  controllers: [PedidosController, PedidosPublicController, AdminPedidosController],
  providers: [PedidosService, ConfirmacionPedidoService, ReembolsosService, TransferenciaService],
  // TransferenciaService se exporta porque lo usa PagosController: el pedido
  // por transferencia se inicia desde /pagos, igual que ConfirmacionPedidoService.
  exports: [PedidosService, ConfirmacionPedidoService, ReembolsosService, TransferenciaService],
})
export class PedidosModule {}
