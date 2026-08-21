import { Module } from "@nestjs/common";
import { CargosController } from "./cargos.controller";
import { CargosService } from "./cargos.service";
import { AuthModule } from "../auth/auth.module";
import { AjustesController } from "./ajustes.controller";
import { MantenimientoService } from "./mantenimiento.service";
import { EnvioService } from "./envio.service";
import { PedidosModule } from "../pedidos/pedidos.module";
import { ContabilidadModule } from "../contabilidad/contabilidad.module";

@Module({
  // PedidosModule por TransferenciaService: la cuenta de cobro se edita aquí
  // pero la usa el checkout, así que el servicio vive donde se usa.
  //
  // ContabilidadModule por ContabilidadService: los datos fiscales del emisor se
  // editan en esta pantalla y los usa la facturación. Mismo reparto.
  imports: [AuthModule, PedidosModule, ContabilidadModule],
  controllers: [CargosController, AjustesController],
  providers: [CargosService, MantenimientoService, EnvioService],
})
export class TiModule {}
