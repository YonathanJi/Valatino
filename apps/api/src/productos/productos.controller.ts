import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  ParseIntPipe,
  DefaultValuePipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { ProductosService } from "./productos.service";
import { JwtGuard } from "../auth/guards/jwt.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { ModulosGuard } from "../auth/guards/modulos.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { Modulo } from "../auth/decorators/modulo.decorator";
import { CreateProductoDto, UpdateProductoDto, AjustarStockDto } from "./dto/producto.dto";

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

  @Patch(":id")
  @UseGuards(JwtGuard, RolesGuard, ModulosGuard)
  @Roles("admin", "asesor")
  @Modulo("catalogo")
  update(@Param("id") id: string, @Body() dto: UpdateProductoDto) {
    return this.productosService.update(id, dto);
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
