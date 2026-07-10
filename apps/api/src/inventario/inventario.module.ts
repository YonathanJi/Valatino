import { Module } from "@nestjs/common";
import { InventarioService } from "./inventario.service";

@Module({
  providers: [InventarioService],
  exports: [InventarioService],
})
export class InventarioModule {}
