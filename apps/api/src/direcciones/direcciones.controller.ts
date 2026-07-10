import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { DireccionesService } from "./direcciones.service";
import { CreateDireccionDto, UpdateDireccionDto } from "./dto/direccion.dto";
import { JwtGuard } from "../auth/guards/jwt.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { JwtPayload } from "@valatino/types";

@Controller("direcciones")
@UseGuards(JwtGuard)
export class DireccionesController {
  constructor(private readonly direccionesService: DireccionesService) {}

  @Get()
  findAll(@CurrentUser() user: JwtPayload) {
    return this.direccionesService.findByUser(user.sub);
  }

  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateDireccionDto) {
    return this.direccionesService.create(user.sub, dto);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateDireccionDto,
  ) {
    return this.direccionesService.update(user.sub, id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param("id") id: string, @CurrentUser() user: JwtPayload) {
    return this.direccionesService.remove(user.sub, id);
  }
}
