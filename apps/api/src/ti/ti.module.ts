import { Module } from "@nestjs/common";
import { CargosController } from "./cargos.controller";
import { CargosService } from "./cargos.service";
import { AuthModule } from "../auth/auth.module";
import { AjustesController } from "./ajustes.controller";
import { MantenimientoService } from "./mantenimiento.service";
import { EnvioService } from "./envio.service";
import { CodigosController } from "./codigos.controller";
import { CodigosService } from "./codigos.service";
import { PedidosModule } from "../pedidos/pedidos.module";
import { ContabilidadModule } from "../contabilidad/contabilidad.module";
import { TiendaModule } from "../tienda/tienda.module";

@Module({
  // PedidosModule por TransferenciaService: la cuenta de cobro se edita aquí
  // pero la usa el checkout, así que el servicio vive donde se usa.
  //
  // ContabilidadModule por ContabilidadService: los datos fiscales del emisor se
  // editan en esta pantalla y los usa la facturación. Mismo reparto.
  //
  // TiendaModule por IdentidadService: los canales de contacto se editan en esta
  // pantalla y los publica el pie de la tienda. Mismo reparto que los dos de
  // arriba.
  imports: [AuthModule, PedidosModule, ContabilidadModule, TiendaModule],
  // ⚠️ Los códigos de descuento (083) NO traen módulo propio: cuelgan de `ti` como
  // el IBAN y la tarifa. `StaffModulo` es una unión cerrada Y un CHECK que ya se ha
  // reescrito cuatro veces; inventar «marketing» para una pantalla no lo vale.
  controllers: [CargosController, AjustesController, CodigosController],
  providers: [CargosService, MantenimientoService, EnvioService, CodigosService],
})
export class TiModule {}
