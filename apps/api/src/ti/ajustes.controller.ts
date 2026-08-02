import { Body, Controller, Get, Put, UseGuards } from "@nestjs/common";
import { TransferenciaService } from "../pedidos/transferencia.service";
import { JwtGuard } from "../auth/guards/jwt.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { ModulosGuard } from "../auth/guards/modulos.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { Modulo, Nivel } from "../auth/decorators/modulo.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { GuardarAjustesTransferenciaDto } from "../pedidos/dto/ajustes-transferencia.dto";
import type { JwtPayload } from "@valatino/types";

/**
 * Ajustes de la tienda que se cambian sin tocar código ni Render.
 *
 * Empezó por la cuenta de cobro de las transferencias, que nació como variable
 * de entorno y no debía serlo: las variables de entorno son para secretos —la
 * clave de Stripe, la contraseña del SMTP—, y un IBAN de cobro se le enseña a
 * cada cliente que compra. Es un dato del negocio, como las plantillas de
 * permisos de los cargos, y quien lleva la tienda tiene que poder cambiarlo.
 *
 * Vive en TI y no en Pedidos porque es configuración del sistema, no trabajo
 * del día a día: quien despacha pedidos no tiene por qué toparse con esto.
 */
@Controller("admin/ti/ajustes")
@UseGuards(JwtGuard, RolesGuard, ModulosGuard)
@Roles("admin", "asesor")
@Modulo("ti")
@Nivel("lectura")
export class AjustesController {
  constructor(private readonly transferencia: TransferenciaService) {}

  @Get("transferencia")
  leer() {
    return this.transferencia.ajustes();
  }

  /**
   * Exige `total` por lo mismo que reembolsar: cambiar el IBAN cambia a dónde
   * va el dinero de todas las ventas que se paguen así. Es la acción con más
   * consecuencias de todo el panel, aunque no lo parezca por lo pequeña.
   */
  @Put("transferencia")
  @Nivel("total")
  guardar(
    @Body() dto: GuardarAjustesTransferenciaDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.transferencia.guardarAjustes(dto, user.sub);
  }
}
