import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common";
import { TransferenciaService } from "../pedidos/transferencia.service";
import { MantenimientoService } from "./mantenimiento.service";
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
  constructor(
    private readonly transferencia: TransferenciaService,
    private readonly mantenimiento: MantenimientoService,
  ) {}

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

  /** En qué modo está la tienda, cuántos pedidos hay y si el stock cuadra. */
  @Get("mantenimiento")
  estado() {
    return this.mantenimiento.estado();
  }

  /**
   * ⚠️⚠️ BORRA TODAS LAS VENTAS. Por eso es `@Roles("admin")` **además** de
   * `total`: un asesor de TI con control total administra cuentas y accesos,
   * pero vaciar la tienda no es administrar, y el nivel más alto de un módulo
   * no debería alcanzar para eso.
   *
   * El guardia de verdad —negarse tras el arranque fiscal— está en la BD, no
   * aquí: así protege también al editor SQL y a lo que se escriba mañana.
   */
  @Post("mantenimiento/limpiar")
  @Roles("admin")
  @Nivel("total")
  @HttpCode(HttpStatus.OK)
  limpiar(@CurrentUser() user: JwtPayload) {
    return this.mantenimiento.limpiarDatosDePrueba(user.sub);
  }

  /**
   * Marca que las ventas empiezan a contar de verdad. **Sin vuelta atrás.**
   */
  @Post("mantenimiento/arranque-fiscal")
  @Roles("admin")
  @Nivel("total")
  @HttpCode(HttpStatus.OK)
  arrancar(@CurrentUser() user: JwtPayload) {
    return this.mantenimiento.marcarArranqueFiscal(user.sub);
  }
}
