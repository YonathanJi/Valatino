import { Module } from "@nestjs/common";
import { PedidosService } from "./pedidos.service";
import { ConfirmacionPedidoService } from "./confirmacion-pedido.service";
import { PedidosController, PedidosPublicController } from "./pedidos.controller";
import { AdminPedidosController } from "./admin-pedidos.controller";
import { InventarioModule } from "../inventario/inventario.module";

@Module({
  imports: [InventarioModule],
  controllers: [PedidosController, PedidosPublicController, AdminPedidosController],
  providers: [PedidosService, ConfirmacionPedidoService],
  exports: [PedidosService, ConfirmacionPedidoService],
})
export class PedidosModule {}
