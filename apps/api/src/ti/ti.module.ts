import { Module } from "@nestjs/common";
import { CargosController } from "./cargos.controller";
import { CargosService } from "./cargos.service";
import { AuthModule } from "../auth/auth.module";
import { AjustesController } from "./ajustes.controller";
import { MantenimientoService } from "./mantenimiento.service";
import { PedidosModule } from "../pedidos/pedidos.module";

@Module({
  // PedidosModule por TransferenciaService: la cuenta de cobro se edita aquí
  // pero la usa el checkout, así que el servicio vive donde se usa.
  imports: [AuthModule, PedidosModule],
  controllers: [CargosController, AjustesController],
  providers: [CargosService, MantenimientoService],
})
export class TiModule {}
