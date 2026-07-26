import { Module } from "@nestjs/common";
import { InventarioService } from "./inventario.service";
import { EventosModule } from "../eventos/eventos.module";

@Module({
  imports: [EventosModule],
  providers: [InventarioService],
  exports: [InventarioService],
})
export class InventarioModule {}
