import { Module } from "@nestjs/common";
import { PedidosService } from "./pedidos.service";
import { PedidosController } from "./pedidos.controller";
import { AdminPedidosController } from "./admin-pedidos.controller";

@Module({
  controllers: [PedidosController, AdminPedidosController],
  providers: [PedidosService],
  exports: [PedidosService],
})
export class PedidosModule {}
