import { Module } from "@nestjs/common";
import { ContabilidadController } from "./contabilidad.controller";
import { ContabilidadService } from "./contabilidad.service";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  controllers: [ContabilidadController],
  // Se exporta porque `ComprasController` lo usa para corregir la fecha de
  // expedición de una factura ya registrada: es una acción de Compras (se hace
  // desde su ficha, con su permiso) sobre un dato que existe para la
  // contabilidad. Duplicar la llamada a la RPC en los dos servicios dejaría dos
  // sitios donde validar lo mismo.
  providers: [ContabilidadService],
  exports: [ContabilidadService],
})
export class ContabilidadModule {}
