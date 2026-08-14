import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
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

  /**
   * El PDF de una factura, **generado al pedirlo y nunca almacenado**: la fila es
   * la verdad, y un fichero guardado sería un segundo sitio que puede divergir.
   *
   * `lectura` y no `edicion`: ver un documento no lo cambia, y quien consulta el
   * libro tiene que poder abrir lo que hay en él.
   *
   * ⚠️ `inline` y no `attachment`, para que se abra en el navegador al pinchar el
   * número en vez de caer en la carpeta de descargas. Quien lo quiera guardar lo
   * hace desde el visor, que es donde lo va a buscar.
   */
  @Get("facturas/:id/pdf")
  async pdf(@Param("id", ParseUUIDPipe) id: string, @Res() res: Response) {
    const { pdf, nombre } = await this.contabilidadService.facturaPdf(id);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nombre}"`,
      "Content-Length": String(pdf.length),
      // ⚠️ Sin caché, y no por paranoia: el PDF se genera de la fila, así que si
      // algún día un dato del snapshot cambiara —o se corrigiera el formato del
      // número, como pasó en la 074— una copia cacheada en un proxy seguiría
      // sirviendo el documento viejo sin que nadie lo supiera.
      "Cache-Control": "no-store",
    });
    res.end(pdf);
  }

  /**
   * Manda la factura al cliente con el PDF adjunto, y lo anota en el libro.
   *
   * `edicion` como emitir: no destruye nada, pero **sale de la casa** — es la
   * única acción de contabilidad que pone un documento en manos de un tercero.
   *
   * ⚠️ Devuelve 200 y NO es idempotente a propósito: reenviar está permitido
   * porque la gente pierde correos, y cada envío deja su evento `enviada`. Lo que
   * no puede pasar es que un reenvío ocurra sin rastro.
   */
  @Post("facturas/:id/enviar")
  @Nivel("edicion")
  @HttpCode(HttpStatus.OK)
  enviar(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.contabilidadService.enviarFacturaAlCliente(id, user.sub);
  }
}
