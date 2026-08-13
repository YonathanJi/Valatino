import {
  BadRequestException,
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Throttle } from "@nestjs/throttler";
import { LIMITE_SUBIDAS } from "../common/limites-peticiones";
import { ComprasService } from "./compras.service";
import { JwtGuard } from "../auth/guards/jwt.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { ModulosGuard } from "../auth/guards/modulos.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { Modulo, Nivel } from "../auth/decorators/modulo.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { CrearCompraDto, compraItemsSchema } from "./dto/compra.dto";
import { ContabilidadService } from "../contabilidad/contabilidad.service";
import { FijarFechaFacturaDto } from "../contabilidad/dto/liquidacion.dto";
import type { JwtPayload } from "@valatino/types";

const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Límites del multipart de la factura.
 *
 * ⚠️ Limitar solo `fileSize` NO limita el resto: en Multer `fields`, `parts` y
 * `files` valen **Infinity** por defecto. Un envío con cien mil campos de texto
 * diminutos pasa el límite de 10 MB del PDF sin despeinarse y tiene al proceso
 * ocupado parseando; con el plan free de Render, que ya arranca en frío, eso se
 * nota. Los cuatro avisos altos de Multer eran justo de esto.
 *
 * El formulario manda 1 fichero (`pdf`) y 5 campos (`numeroFactura`,
 * `fechaFactura`, `proveedorId`, `notas`, `items`). Se deja holgura a propósito:
 * apretar a la
 * cifra exacta convierte «añadir un campo al formulario» en un fallo raro de
 * diagnosticar. `items` es el JSON de las líneas, y por eso su campo admite más
 * que los demás — una factura larga son unas decenas de KB.
 */
const LIMITES_FACTURA = {
  fileSize: MAX_PDF_BYTES,
  files: 1,
  fields: 8,
  parts: 10,
  fieldNameSize: 100,
  fieldSize: 512 * 1024, // 512 KB: ~2.000 líneas de factura
} as const;

/** Compras de mercancía — admin siempre; asesores según su nivel en el módulo. */
@Controller("admin/compras")
@UseGuards(JwtGuard, RolesGuard, ModulosGuard)
@Roles("admin", "asesor")
@Modulo("compras")
@Nivel("lectura")
export class ComprasController {
  constructor(
    private readonly comprasService: ComprasService,
    private readonly contabilidadService: ContabilidadService,
  ) {}

  // `edicion` y no `total` pese a mover stock e importes sin anulación: es LA
  // operación del módulo, y ponerla en `total` dejaría el nivel `edicion` sin
  // habilitar nada. (Que no exista anular una compra es deuda anterior a esto.)
  @Post()
  @Nivel("edicion")
  @Throttle(LIMITE_SUBIDAS)
  @UseInterceptors(FileInterceptor("pdf", { limits: LIMITES_FACTURA }))
  async crear(
    @UploadedFile() pdf: Express.Multer.File | undefined,
    @Body() dto: CrearCompraDto,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!pdf) {
      throw new BadRequestException("Adjunta el PDF de la factura");
    }
    if (pdf.mimetype !== "application/pdf" || !pdf.buffer.subarray(0, 5).toString().startsWith("%PDF")) {
      throw new BadRequestException("El archivo debe ser un PDF válido");
    }

    let itemsRaw: unknown;
    try {
      itemsRaw = JSON.parse(dto.items);
    } catch {
      throw new BadRequestException("Las líneas de la compra no son un JSON válido");
    }

    const parsed = compraItemsSchema.safeParse(itemsRaw);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues[0]?.message ?? "Líneas de compra inválidas",
      );
    }

    return this.comprasService.crear({
      pdf: pdf.buffer,
      // Obligatorio desde la 054; el recorte definitivo lo hace el servicio,
      // que es quien tiene que garantizarlo aunque se le llame desde otro sitio.
      numeroFactura: dto.numeroFactura,
      // Obligatoria desde la 068. Que la base la acepte nula es una concesión a
      // la ventana de despliegue, no una invitación a no mandarla.
      fechaFactura: dto.fechaFactura,
      proveedorId: dto.proveedorId || undefined,
      notas: dto.notas?.trim() || undefined,
      items: parsed.data,
      creadoPor: user.sub,
    });
  }

  @Get()
  findAll(
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.comprasService.findAll(Math.max(page, 1), Math.min(Math.max(limit, 1), 100));
  }

  @Get(":id")
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.comprasService.findOne(id);
  }

  @Get(":id/pdf")
  getPdfUrl(@Param("id", ParseUUIDPipe) id: string) {
    return this.comprasService.getPdfUrl(id);
  }

  /**
   * Corregir la fecha de expedición de una factura ya registrada.
   *
   * Existe porque las compras anteriores a la 068 nacieron sin ese dato y hay
   * que cogerlo del PDF, y porque es un campo de TRANSCRIPCIÓN: equivocarse al
   * teclearlo tiene que ser corregible. Es lo ÚNICO que se puede tocar de una
   * factura registrada — el número es único, el total sale de las líneas y las
   * líneas movieron stock.
   *
   * `edicion` y no `total`: no mueve dinero ni stock, corrige un dato. Aunque
   * cambiarla no reimputa el IVA a otro trimestre (eso lo decide la fecha de
   * registro), sí es un dato del libro registro, así que no cae en `lectura`.
   */
  @Patch(":id/fecha-factura")
  @Nivel("edicion")
  @HttpCode(HttpStatus.NO_CONTENT)
  async fijarFechaFactura(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: FijarFechaFacturaDto,
  ): Promise<void> {
    await this.contabilidadService.fijarFechaFacturaCompra(id, dto.fechaFactura);
  }
}
