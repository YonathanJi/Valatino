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
import { Modulo, Nivel } from "../auth/decorators/modulo.decorator";
import { CrearProveedorDto, UpdateProveedorDto } from "./dto/proveedor.dto";

/** Proveedores (submódulo de compras) — mismo módulo, niveles propios. */
@Controller("admin/proveedores")
@UseGuards(JwtGuard, RolesGuard, ModulosGuard)
@Roles("admin", "asesor")
@Modulo("compras")
@Nivel("lectura")
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
  @Nivel("edicion")
  create(@Body() dto: CrearProveedorDto) {
    return this.proveedoresService.create(dto);
  }

  @Patch(":id")
  @Nivel("edicion")
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateProveedorDto) {
    return this.proveedoresService.update(id, dto);
  }

  // Antes lo podía hacer cualquier asesor con el módulo `compras`: no había
  // ningún freno sobre una operación que borra un proveedor del maestro.
  @Delete(":id")
  @Nivel("total")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param("id", ParseUUIDPipe) id: string) {
    return this.proveedoresService.remove(id);
  }
}
