import { Module } from "@nestjs/common";
import {
  CalificacionesAdminController,
  CalificacionesPublicController,
} from "./calificaciones.controller";
import { CalificacionesService } from "./calificaciones.service";
import { AuthModule } from "../auth/auth.module";

/**
 * El servicio se exporta porque `PedidosModule` lo necesita para adjuntar la
 * opinión a la ficha del pedido. Módulo propio y no dentro de pedidos para no
 * crear la dependencia al revés: la calificación conoce el pedido, no viceversa.
 */
@Module({
  imports: [AuthModule],
  controllers: [CalificacionesPublicController, CalificacionesAdminController],
  providers: [CalificacionesService],
  exports: [CalificacionesService],
})
export class CalificacionesModule {}
