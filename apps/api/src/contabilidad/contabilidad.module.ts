import { Module } from "@nestjs/common";
import { ContabilidadController } from "./contabilidad.controller";
import { ContabilidadService } from "./contabilidad.service";
import { FacturaPdfService } from "./factura-pdf.service";
import { AuthModule } from "../auth/auth.module";
import { EmailModule } from "../email/email.module";

@Module({
  // `EmailModule` porque la factura se le manda al cliente con el PDF adjunto.
  //
  // ⚠️ NO importa `EventosModule` aunque emitir una factura sí quede ahora en la
  // línea de tiempo del pedido (084): eso lo escribe un disparador sobre
  // `facturas_emitidas`, porque este servicio es solo uno de los cuatro caminos
  // por los que nace una factura. Ver el comentario en `emitirFacturaCompleta`.
  imports: [AuthModule, EmailModule],
  controllers: [ContabilidadController],
  // Se exporta porque `ComprasController` lo usa para corregir la fecha de
  // expedición de una factura ya registrada: es una acción de Compras (se hace
  // desde su ficha, con su permiso) sobre un dato que existe para la
  // contabilidad. Duplicar la llamada a la RPC en los dos servicios dejaría dos
  // sitios donde validar lo mismo.
  // `FacturaPdfService` NO se exporta: el PDF se pide siempre a través de
  // `ContabilidadService`, que es quien sabe leer la factura y comprobar que se
  // puede mandar. Exponer el generador suelto invitaría a maquetar un documento
  // fiscal desde cualquier módulo sin pasar por esas comprobaciones.
  providers: [ContabilidadService, FacturaPdfService],
  exports: [ContabilidadService],
})
export class ContabilidadModule {}
