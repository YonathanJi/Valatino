import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ContabilidadService } from "./contabilidad.service";
import { JwtGuard } from "../auth/guards/jwt.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { ModulosGuard } from "../auth/guards/modulos.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { Modulo, Nivel } from "../auth/decorators/modulo.decorator";
import { LiquidacionIvaQueryDto } from "./dto/liquidacion.dto";

/**
 * Contabilidad — la liquidación del IVA (modelo 303).
 *
 * Módulo propio y no una página de Compras ni del Dashboard, y el motivo es de
 * negocio: el 303 cruza ventas Y compras, así que ninguno de los dos es su
 * dueño, y quien lo presenta no es necesariamente quien registra facturas de
 * proveedor ni quien mira métricas. Es además donde vivirán las facturas a
 * clientes cuando existan (Capa 2).
 *
 * Todo lo que hay hoy es de LECTURA: el informe no escribe nada, se calcula
 * desde los libros que ya existen. `edicion` y `total` no habilitan nada por
 * encima de `lectura` todavía; se deja el nivel visible en el selector de TI
 * para no inventar una excepción, igual que el Dashboard, porque emitir
 * facturas sí querrá su nivel.
 */
@Controller("admin/contabilidad")
@UseGuards(JwtGuard, RolesGuard, ModulosGuard)
@Roles("admin", "asesor")
@Modulo("contabilidad")
@Nivel("lectura")
export class ContabilidadController {
  constructor(private readonly contabilidadService: ContabilidadService) {}

  @Get("iva")
  liquidacionIva(@Query() query: LiquidacionIvaQueryDto) {
    return this.contabilidadService.liquidacionIva(query.desde, query.hasta);
  }
}
