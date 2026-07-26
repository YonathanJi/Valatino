import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from "@nestjs/common";
import { CargosService } from "./cargos.service";
import { JwtGuard } from "../auth/guards/jwt.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { ModulosGuard } from "../auth/guards/modulos.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { Modulo, Nivel } from "../auth/decorators/modulo.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { GuardarPlantillaDto, ReaplicarDto } from "./dto/plantilla.dto";
import type { JwtPayload } from "@valatino/types";

/**
 * Plantillas de permisos por cargo.
 *
 * El cargo lo crea Gestión Humana (es dato de RRHH); qué permisos lleva se
 * decide aquí, en TI. Esa separación es deliberada: si Talento Humano pudiera
 * definir los permisos de un cargo, podría concederse acceso al sistema
 * creando un cargo a medida.
 */
@Controller("admin/ti/cargos")
@UseGuards(JwtGuard, RolesGuard, ModulosGuard)
@Roles("admin", "asesor")
@Modulo("ti")
@Nivel("lectura")
export class CargosController {
  constructor(private readonly service: CargosService) {}

  @Get()
  listar() {
    return this.service.listar();
  }

  @Get(":id/plantilla")
  obtenerPlantilla(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string) {
    return this.service.obtenerPlantilla(id);
  }

  /**
   * Guardar la plantilla NO cambia los permisos de nadie: es el molde para las
   * cuentas que se provisionen a partir de ahora. Para llevarlo a quien ya
   * tiene cuenta hay que reaplicar, que avisa antes de a quién afecta.
   */
  @Put(":id/plantilla")
  @Nivel("total")
  guardarPlantilla(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() dto: GuardarPlantillaDto,
    @CurrentUser() editor: JwtPayload,
  ) {
    return this.service.guardarPlantilla(id, dto.permisos, editor.sub);
  }

  /** Vista previa: a quién afecta reaplicar y qué cambia en cada persona. */
  @Get(":id/afectados")
  afectados(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string) {
    return this.service.afectados(id);
  }

  @Post(":id/reaplicar")
  @Nivel("total")
  reaplicar(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() dto: ReaplicarDto,
    @CurrentUser() editor: JwtPayload,
  ) {
    return this.service.reaplicar(id, editor.sub, editor.role === "admin", {
      userIds: dto.user_ids,
      incluirme: dto.incluirme,
    });
  }
}
