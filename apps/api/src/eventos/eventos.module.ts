import { Module } from "@nestjs/common";
import { EventosPedidoService } from "./eventos-pedido.service";

/**
 * Módulo mínimo para que el registro de eventos sea inyectable desde los dos
 * lados que lo necesitan (pedidos y email) sin crear una dependencia circular.
 */
@Module({
  providers: [EventosPedidoService],
  exports: [EventosPedidoService],
})
export class EventosModule {}
