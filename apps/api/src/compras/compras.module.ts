import { Module } from "@nestjs/common";
import { ComprasController } from "./compras.controller";
import { ComprasService } from "./compras.service";
import { ProveedoresController } from "./proveedores.controller";
import { ProveedoresService } from "./proveedores.service";
import { AuthModule } from "../auth/auth.module";
import { ContabilidadModule } from "../contabilidad/contabilidad.module";

@Module({
  // ContabilidadModule por la corrección de la fecha de expedición: la acción se
  // hace desde la ficha de la compra (con su permiso) pero el dato existe para
  // la contabilidad, y su validación vive con la RPC que lo escribe.
  imports: [AuthModule, ContabilidadModule],
  controllers: [ComprasController, ProveedoresController],
  providers: [ComprasService, ProveedoresService],
})
export class ComprasModule {}
