import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from "@nestjs/common";
import { ContabilidadService } from "./contabilidad.service";
import { JwtGuard } from "../auth/guards/jwt.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { ModulosGuard } from "../auth/guards/modulos.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { Modulo, Nivel } from "../auth/decorators/modulo.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { LiquidacionIvaQueryDto } from "./dto/liquidacion.dto";
import { EmitirFacturaCompletaDto } from "./dto/factura.dto";
import type { JwtPayload } from "@valatino/types";

/**
 * Contabilidad — la liquidación del IVA (modelo 303) y el libro de facturas
 * expedidas.
 *
 * Módulo propio y no una página de Compras ni del Dashboard, y el motivo es de
 * negocio: el 303 cruza ventas Y compras, así que ninguno de los dos es su
 * dueño, y quien lo presenta no es necesariamente quien registra facturas de
 * proveedor ni quien mira métricas.
 *
 * ⭐ Desde las migraciones 072-073, `edicion` **sí** habilita algo: emitir la
 * factura completa que pide un cliente. Y ese es el nivel correcto y no `total`,
 * porque emitir no destruye nada — una factura no se edita ni se borra jamás, y
 * corregirla es emitir una rectificativa. `total` queda para lo que rompa cosas.
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

  /** El libro de facturas expedidas, de la más reciente a la más antigua. */
  @Get("facturas")
  facturas() {
    return this.contabilidadService.listarFacturas();
  }

  /**
   * Si la cadena de huellas está intacta (Verifactu). De lectura porque no
   * escribe: recalcula y compara.
   */
  @Get("facturas/cadena")
  cadena() {
    return this.contabilidadService.verificarCadena();
  }

  /** Ventas a las que se les puede emitir la factura completa que pide el cliente. */
  @Get("facturas/facturables")
  facturables() {
    return this.contabilidadService.pedidosFacturables();
  }

  /**
   * La factura completa a petición del cliente. **Lo que Jonathan pidió.**
   *
   * Se llama desde la ficha del pedido, pero el permiso es de `contabilidad`, no
   * de `pedidos`: quien despacha pedidos no tiene por qué emitir documentos
   * fiscales. El botón de la ficha se apaga con `usePuede("contabilidad", …)`.
   *
   * Devuelve 200 y no 201 porque es idempotente: dos clics dan la MISMA factura,
   * y un 201 en la segunda diría que se creó otra.
   */
  @Post("facturas/completa")
  @Nivel("edicion")
  @HttpCode(HttpStatus.OK)
  emitirCompleta(@Body() dto: EmitirFacturaCompletaDto, @CurrentUser() user: JwtPayload) {
    return this.contabilidadService.emitirFacturaCompleta(
      dto.pedidoId,
      {
        nif: dto.nif,
        nombre: dto.nombre,
        direccion: dto.direccion,
        codigo_postal: dto.codigoPostal,
        ciudad: dto.ciudad,
        provincia: dto.provincia,
      },
      user.sub,
    );
  }

  /**
   * Emite las simplificadas de las ventas ya devengadas que no tienen ninguna.
   *
   * ⚠️ Es para el arranque: hasta que el emisor esté configurado, las ventas
   * devengan sin poder facturarse. No es una tarea de rutina — si hace falta a
   * menudo, el trigger no está emitiendo y eso es un fallo.
   */
  @Post("facturas/pendientes")
  @Nivel("edicion")
  @HttpCode(HttpStatus.OK)
  emitirPendientes(@CurrentUser() user: JwtPayload) {
    return this.contabilidadService.emitirFacturasPendientes(user.sub);
  }
}
