import { Module } from "@nestjs/common";
import { TiendaController } from "./tienda.controller";
import { IdentidadService } from "./identidad.service";

/**
 * La cara pública de la tienda: quién vende y cómo se le pregunta.
 *
 * Exporta `IdentidadService` porque los canales de contacto se EDITAN desde TI →
 * Ajustes, junto al IBAN y a los datos fiscales. Mismo reparto que
 * `TransferenciaService` y `ContabilidadService`: el servicio vive en su dominio
 * y el controlador de edición, donde se edita.
 */
@Module({
  controllers: [TiendaController],
  providers: [IdentidadService],
  exports: [IdentidadService],
})
export class TiendaModule {}
