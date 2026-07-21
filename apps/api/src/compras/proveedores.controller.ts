import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ProveedoresService } from "./proveedores.service";
import { JwtGuard } from "../auth/guards/jwt.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { ModulosGuard } from "../auth/guards/modulos.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { Modulo } from "../auth/decorators/modulo.decorator";
import { CrearProveedorDto, UpdateProveedorDto } from "./dto/proveedor.dto";

/** Proveedores (submódulo de compras) — mismo permiso que el módulo */
@Controller("admin/proveedores")
@UseGuards(JwtGuard, RolesGuard, ModulosGuard)
@Roles("admin", "asesor")
@Modulo("compras")
export class ProveedoresController {
  constructor(private readonly proveedoresService: ProveedoresService) {}

  @Get()
  findAll() {
    return this.proveedoresService.findAll();
  }

  /** Lookup por CIF para autocompletar el formulario de compra */
  @Get("cif/:cif")
  findByCif(@Param("cif") cif: string) {
    return this.proveedoresService.findByCif(cif);
  }

  @Post()
  create(@Body() dto: CrearProveedorDto) {
    return this.proveedoresService.create(dto);
  }

  @Patch(":id")
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateProveedorDto) {
    return this.proveedoresService.update(id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param("id", ParseUUIDPipe) id: string) {
    return this.proveedoresService.remove(id);
  }
}
