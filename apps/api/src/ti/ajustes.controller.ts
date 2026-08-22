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
import { ContabilidadService } from "../contabilidad/contabilidad.service";
import { MantenimientoService } from "./mantenimiento.service";
import { EnvioService } from "./envio.service";
import { IdentidadService } from "../tienda/identidad.service";
import { JwtGuard } from "../auth/guards/jwt.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { ModulosGuard } from "../auth/guards/modulos.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { Modulo, Nivel } from "../auth/decorators/modulo.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { GuardarAjustesTransferenciaDto } from "../pedidos/dto/ajustes-transferencia.dto";
import { GuardarEmisorDto } from "../contabilidad/dto/factura.dto";
import { GuardarAjustesEnvioDto } from "./dto/ajustes-envio.dto";
import { GuardarAjustesContactoDto } from "./dto/ajustes-contacto.dto";
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
    // El servicio vive en Contabilidad —es su dominio— y el controlador en TI,
    // que es donde se edita. Mismo reparto que `TransferenciaService`.
    private readonly contabilidad: ContabilidadService,
    private readonly envio: EnvioService,
    private readonly identidad: IdentidadService,
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

  /**
   * Los datos fiscales con los que se firman las facturas (migración 071).
   *
   * ⚠️ Vive aquí, con el IBAN, y no en Contabilidad, porque es donde vive la
   * tabla `ajustes_tienda` y porque es configuración del negocio, no trabajo del
   * día a día. Quien lo NECESITA es Contabilidad — así que su pantalla de
   * facturas avisa cuando falta y enlaza aquí, en vez de tener otra pantalla de
   * ajustes que diga lo mismo en otro sitio.
   */
  @Get("emisor")
  emisor() {
    return this.contabilidad.emisor();
  }

  /**
   * Exige `total` por el mismo motivo que el IBAN: esto se imprime en documentos
   * contables, y el snapshot de cada factura lo congela. Un NIF mal escrito no se
   * arregla editando las facturas ya emitidas —no se editan jamás—, sino
   * corrigiendo el dato y emitiendo rectificativas.
   */
  @Put("emisor")
  @Nivel("total")
  guardarEmisor(@Body() dto: GuardarEmisorDto, @CurrentUser() user: JwtPayload) {
    return this.contabilidad.guardarEmisor(dto, user.sub);
  }

  /**
   * La tarifa de envío (migración 080).
   *
   * ⚠️ Vive aquí, con el IBAN y el emisor, por el mismo motivo: es un dato del
   * negocio que quien lleva la tienda tiene que poder cambiar sin desplegar. Y
   * como el IBAN, se le enseña a cada cliente que compra.
   */
  @Get("envio")
  leerEnvio() {
    return this.envio.ajustes();
  }

  /**
   * Exige `total`, y no por costumbre: esto cambia LO QUE PAGA cada cliente que
   * compre a partir de ahora. Es del mismo orden de consecuencias que cambiar el
   * IBAN — pequeña en pantalla, grande en la caja.
   */
  @Put("envio")
  @Nivel("total")
  guardarEnvio(@Body() dto: GuardarAjustesEnvioDto, @CurrentUser() user: JwtPayload) {
    return this.envio.guardar({ coste: dto.coste, gratis_desde: dto.gratis_desde }, user.sub);
  }

  /**
   * Los canales por los que el cliente puede preguntar (migración 081).
   *
   * ⚠️ Vive aquí, con el IBAN y el emisor, porque es lo mismo: dato del negocio
   * que hay que poder cambiar sin desplegar. Y la identidad que acompaña a estos
   * canales en el aviso legal NO se edita aquí — es la del emisor de facturas y
   * tiene su propia pantalla, porque es el mismo dato y duplicarlo sería la vía
   * de que la factura diga un NIF y el aviso legal diga otro.
   */
  @Get("contacto")
  contacto() {
    return this.identidad.publica();
  }

  /**
   * Exige `total` porque esto se publica: el correo y el teléfono que se guarden
   * aquí salen en el pie de la tienda y en el aviso legal, a la vista de
   * cualquiera. Y son además la dirección a la que se dirigen las solicitudes del
   * RGPD, así que dejarla mal puesta no es un detalle de pantalla.
   */
  @Put("contacto")
  @Nivel("total")
  guardarContacto(
    @Body() dto: GuardarAjustesContactoDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.identidad.guardarContacto(dto, user.sub);
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
