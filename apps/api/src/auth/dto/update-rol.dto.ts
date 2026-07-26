import { IsIn, IsOptional } from "class-validator";
import { PermisoModuloDto, PermisosArray } from "./permiso-modulo.dto";

const ROLES_STAFF = ["admin", "asesor"];

export class UpdateRolDto {
  @IsIn(ROLES_STAFF, { message: "rol debe ser 'admin' o 'asesor'" })
  rol!: "admin" | "asesor";

  @IsOptional()
  @PermisosArray()
  permisos?: PermisoModuloDto[];
}
