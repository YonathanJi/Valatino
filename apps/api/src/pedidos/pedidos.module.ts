import { Module } from "@nestjs/common";
import { PedidosService } from "./pedidos.service";
import { PedidosController, PedidosPublicController } from "./pedidos.controller";
import { AdminPedidosController } from "./admin-pedidos.controller";

@Module({
  controllers: [PedidosController, PedidosPublicController, AdminPedidosController],
  providers: [PedidosService],
  exports: [PedidosService],
})
export class PedidosModule {}
