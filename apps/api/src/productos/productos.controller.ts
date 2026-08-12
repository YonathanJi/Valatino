import {
  BadRequestException,
  Controller,
  Delete,
  ForbiddenException,
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
import { Throttle } from "@nestjs/throttler";
import { LIMITE_SUBIDAS } from "../common/limites-peticiones";
import { ProductosService, EXTENSION_POR_MIME } from "./productos.service";
import { JwtGuard } from "../auth/guards/jwt.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { ModulosGuard } from "../auth/guards/modulos.guard";
import { OptionalJwtGuard } from "../auth/guards/optional-jwt.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { Modulo, Nivel } from "../auth/decorators/modulo.decorator";
import { nivelEfectivo } from "../auth/nivel-efectivo";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import {
  CreateProductoDto,
  UpdateProductoDto,
  AjustarStockDto,
  DesempaquetarDto,
} from "./dto/producto.dto";
import { nivelAlcanza } from "@valatino/types";
import type { JwtPayload } from "@valatino/types";

const MAX_IMAGEN_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Límites del multipart de la imagen. Ver el comentario largo en
 * `compras.controller.ts`: `fileSize` a solas deja `fields`, `parts` y `files`
 * en **Infinity**, que es lo que aprovechan los avisos de Multer.
 *
 * Aquí el envío es exactamente un fichero y ningún campo de texto, así que los
 * números son los exactos y no de holgura: si alguien añade un campo, el fallo
 * sale en el primer intento y en desarrollo, no meses después en producción.
 */
const LIMITES_IMAGEN = {
  fileSize: MAX_IMAGEN_BYTES,
  files: 1,
  fields: 0,
  parts: 1,
  fieldNameSize: 100,
} as const;

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

  // Catálogo público, pero `soloActivos=false` (que revela borradores y
  // productos despublicados) queda reservado a quien trabaja el catálogo o el
  // inventario. No puede resolverlo el guard con metadata estática porque
  // depende de un parámetro de la petición: la misma ruta sirve la tienda.
  @Get()
  @UseGuards(OptionalJwtGuard)
  findAll(
    @CurrentUser() user: JwtPayload | undefined,
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query("categoria") categoria?: string,
    @Query("q") q?: string,
    @Query("soloActivos") soloActivos?: string,
  ) {
    const incluirInactivos = soloActivos === "false";
    if (incluirInactivos) {
      // Antes bastaba con ser staff, sin mirar el módulo: un asesor que solo
      // llevara Gestión Humana podía listar todos los borradores del catálogo.
      const puedeVerlos =
        nivelAlcanza(nivelEfectivo(user, "catalogo"), "lectura") ||
        nivelAlcanza(nivelEfectivo(user, "inventario"), "lectura");
      if (!puedeVerlos) {
        throw new ForbiddenException("Solo el personal autorizado puede ver productos inactivos");
      }
    }

    return this.productosService.findAll({
      page,
      limit,
      categoria,
      q,
      soloActivos: !incluirInactivos,
    });
  }

  @Get(":id")
  findOne(@Param("id", ParseUUIDPipe) id: string) {
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
  @Nivel("edicion")
  create(@Body() dto: CreateProductoDto) {
    return this.productosService.create(dto);
  }

  /** Sube una imagen al bucket público y devuelve su URL (para `imagenes`) */
  @Post("imagen")
  @UseGuards(JwtGuard, RolesGuard, ModulosGuard)
  @Roles("admin", "asesor")
  @Modulo("catalogo")
  @Nivel("edicion")
  @Throttle(LIMITE_SUBIDAS)
  @UseInterceptors(FileInterceptor("imagen", { limits: LIMITES_IMAGEN }))
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
  @Nivel("edicion")
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateProductoDto) {
    return this.productosService.update(id, dto);
  }

  @Delete(":id")
  @UseGuards(JwtGuard, RolesGuard, ModulosGuard)
  @Roles("admin", "asesor")
  @Modulo("catalogo")
  @Nivel("total")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param("id", ParseUUIDPipe) id: string) {
    return this.productosService.remove(id);
  }

  @Post(":id/stock")
  @UseGuards(JwtGuard, RolesGuard, ModulosGuard)
  @Roles("admin", "asesor")
  @Modulo("inventario")
  @Nivel("edicion")
  @HttpCode(HttpStatus.OK)
  ajustarStock(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AjustarStockDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.productosService.ajustarStock(id, dto.cantidad, dto.motivo, dto.nota, user.sub);
  }

  /**
   * Abrir bultos para vender unidades sueltas. Mismo permiso que la entrada
   * manual de mercancía: mueve inventario, no toca el catálogo.
   *
   * La ruta va sin `:id` porque la operación tiene DOS productos y ninguno es
   * más protagonista que el otro.
   */
  @Post("desempaquetar")
  @UseGuards(JwtGuard, RolesGuard, ModulosGuard)
  @Roles("admin", "asesor")
  @Modulo("inventario")
  @Nivel("edicion")
  @HttpCode(HttpStatus.OK)
  desempaquetar(@Body() dto: DesempaquetarDto, @CurrentUser() user: JwtPayload) {
    return this.productosService.desempaquetar(dto, user.sub);
  }
}
