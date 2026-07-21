import {
  BadRequestException,
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ComprasService } from "./compras.service";
import { JwtGuard } from "../auth/guards/jwt.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { ModulosGuard } from "../auth/guards/modulos.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { Modulo } from "../auth/decorators/modulo.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { CrearCompraDto, compraItemsSchema } from "./dto/compra.dto";
import type { JwtPayload } from "@valatino/types";

const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10 MB

/** Compras de mercancía — admin siempre; asesores solo con el módulo otorgado */
@Controller("admin/compras")
@UseGuards(JwtGuard, RolesGuard, ModulosGuard)
@Roles("admin", "asesor")
@Modulo("compras")
export class ComprasController {
  constructor(private readonly comprasService: ComprasService) {}

  @Post()
  @UseInterceptors(FileInterceptor("pdf", { limits: { fileSize: MAX_PDF_BYTES } }))
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
      numeroFactura: dto.numeroFactura?.trim() || undefined,
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
}
