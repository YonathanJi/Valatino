import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  ParseIntPipe,
  DefaultValuePipe,
  ParseUUIDPipe,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ProductosService, EXTENSION_POR_MIME } from "./productos.service";
import { JwtGuard } from "../auth/guards/jwt.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { ModulosGuard } from "../auth/guards/modulos.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { Modulo } from "../auth/decorators/modulo.decorator";
import { CreateProductoDto, UpdateProductoDto, AjustarStockDto } from "./dto/producto.dto";

const MAX_IMAGEN_BYTES = 5 * 1024 * 1024; // 5 MB

/** Firmas mágicas de los formatos de imagen admitidos */
function esImagenValida(buffer: Buffer, mimetype: string): boolean {
  switch (mimetype) {
    case "image/jpeg":
      return buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
    case "image/png":
      return buffer.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    case "image/webp":
      return (
        buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WEBP"
      );
    default:
      return false;
  }
}

@Controller("productos")
export class ProductosController {
  constructor(private readonly productosService: ProductosService) {}

  @Get()
  findAll(
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query("categoria") categoria?: string,
    @Query("q") q?: string,
    @Query("soloActivos") soloActivos?: string,
  ) {
    return this.productosService.findAll({
      page,
      limit,
      categoria,
      q,
      soloActivos: soloActivos !== "false",
    });
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.productosService.findOne(id);
  }

  @Get("slug/:slug")
  findBySlug(@Param("slug") slug: string) {
    return this.productosService.findBySlug(slug);
  }

  @Post()
  @UseGuards(JwtGuard, RolesGuard, ModulosGuard)
  @Roles("admin", "asesor")
  @Modulo("catalogo")
  create(@Body() dto: CreateProductoDto) {
    return this.productosService.create(dto);
  }

  /** Sube una imagen al bucket público y devuelve su URL (para `imagenes`) */
  @Post("imagen")
  @UseGuards(JwtGuard, RolesGuard, ModulosGuard)
  @Roles("admin", "asesor")
  @Modulo("catalogo")
  @UseInterceptors(FileInterceptor("imagen", { limits: { fileSize: MAX_IMAGEN_BYTES } }))
  subirImagen(@UploadedFile() imagen: Express.Multer.File | undefined) {
    if (!imagen) {
      throw new BadRequestException("Adjunta una imagen (JPG, PNG o WebP)");
    }
    if (!EXTENSION_POR_MIME[imagen.mimetype] || !esImagenValida(imagen.buffer, imagen.mimetype)) {
      throw new BadRequestException("El archivo debe ser una imagen JPG, PNG o WebP válida");
    }
    return this.productosService.subirImagen(imagen.buffer, imagen.mimetype);
  }

  @Patch(":id")
  @UseGuards(JwtGuard, RolesGuard, ModulosGuard)
  @Roles("admin", "asesor")
  @Modulo("catalogo")
  update(@Param("id") id: string, @Body() dto: UpdateProductoDto) {
    return this.productosService.update(id, dto);
  }

  @Delete(":id")
  @UseGuards(JwtGuard, RolesGuard, ModulosGuard)
  @Roles("admin", "asesor")
  @Modulo("catalogo")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param("id", ParseUUIDPipe) id: string) {
    return this.productosService.remove(id);
  }

  @Post(":id/stock")
  @UseGuards(JwtGuard, RolesGuard, ModulosGuard)
  @Roles("admin", "asesor")
  @Modulo("inventario")
  @HttpCode(HttpStatus.OK)
  ajustarStock(@Param("id") id: string, @Body() dto: AjustarStockDto) {
    return this.productosService.ajustarStock(id, dto.cantidad);
  }
}
