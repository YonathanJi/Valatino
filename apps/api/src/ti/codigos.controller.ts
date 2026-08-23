import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { CodigosService } from "./codigos.service";
import { JwtGuard } from "../auth/guards/jwt.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { ModulosGuard } from "../auth/guards/modulos.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { Modulo, Nivel } from "../auth/decorators/modulo.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { CrearCodigoDescuentoDto, EditarCodigoDescuentoDto } from "./dto/codigo-descuento.dto";
import type { JwtPayload } from "@valatino/types";

/**
 * Los códigos de descuento (083).
 *
 * ⚠️ Cuelga del módulo `ti` y no de uno propio, y es deliberado: `StaffModulo` es
 * una unión cerrada en `@valatino/types` Y un CHECK en `staff_modulos.modulo` y
 * `cargo_modulos.modulo`, y ese CHECK ya se ha tenido que reescribir cuatro veces
 * (023, 030, 032, 036). Inventar un módulo «marketing» para una pantalla obliga a
 * migración + la unión + `NAV_ITEMS` + `NAV_ICONOS`. Los códigos son configuración
 * del negocio, como el IBAN y la tarifa de envío, así que ya tienen su sitio.
 */
@Controller("admin/ti/codigos")
@UseGuards(JwtGuard, RolesGuard, ModulosGuard)
@Roles("admin", "asesor")
@Modulo("ti")
@Nivel("lectura")
export class CodigosController {
  constructor(private readonly codigos: CodigosService) {}

  @Get()
  listar() {
    return this.codigos.listar();
  }

  /**
   * ⚠️⚠️ EXIGE `total`, igual que el IBAN y la tarifa de envío, y por la misma razón:
   * crear un código cambia lo que paga el cliente. No es una etiqueta ni una nota
   * interna — es dinero que la tienda deja de cobrar en cada venta que lo lleve.
   */
  @Post()
  @Nivel("total")
  crear(@Body() dto: CrearCodigoDescuentoDto, @CurrentUser() user: JwtPayload) {
    return this.codigos.crear(dto, user.sub);
  }

  /**
   * ⚠️ Solo se edita lo que NO reescribe la historia: apagarlo, mover las fechas,
   * subir el tope o corregir el texto que se publica. El código, el tipo y el
   * porcentaje son inmutables — ver la cabecera de `EditarCodigoDescuentoDto`.
   */
  @Patch(":id")
  @Nivel("total")
  editar(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: EditarCodigoDescuentoDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.codigos.editar(id, dto, user.sub);
  }

  /**
   * ⚠️⚠️ Solo borra los que NUNCA se han usado. Uno usado se APAGA: su fila es la
   * prueba de qué descuento llevaron esas ventas (art. 78.Tres.2 LIVA), y
   * `pedidos.descuento_codigo` es TEXT a propósito, así que ninguna FK lo impide. La
   * protección vive en el servicio.
   */
  @Delete(":id")
  @Nivel("total")
  borrar(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.codigos.borrar(id);
  }
}
